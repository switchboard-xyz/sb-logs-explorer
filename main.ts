import { Connection, PublicKey, Keypair } from "@solana/web3.js";

import * as fs from "fs";
const yargs = require("yargs/yargs");

import * as anchor from "@coral-xyz/anchor";
import * as readline from "readline";
import Big from "big.js";

//= begin - globals

let ALLOW_MORE_QUERIES = true;
let CURRENT_AWAIT_COUNT = 0;
let HAS_STARTED = false;

const LOG_MAP = new Map<number, string>([]);

const results: any[] = [];
const signatures: string[] = [];

const now = Math.floor(new Date().getTime() / 1000); // milliseconds to seconds
let argv = yargs(process.argv).options({
  account: {
    type: "string",
    describe: "Account to query transaction signatures for",
    demand: true,
  },
  url: {
    type: "string",
    describe: "URL for the Solana chain the program is running on",
    demand: false,
    default: "https://api.mainnet-beta.solana.com",
  },
  startTime: {
    type: "number",
    describe: "Start time to query transactions (EPOCH time, in seconds, UTC)",
    demand: false,
    default: now - (10 * 60), // 10 minutes ago
  },
  endTime: {
    type: "number",
    describe: "End time to query transactions (EPOCH time, in seconds, UTC)",
    demand: false,
    default: now,
  },
  filter: {
    type: "string",
    describe: "Substring to filter logs by",
    demand: false,
    default: "",
  },
  output: {
    type: "string",
    describe: "Output file to write logs to",
    demand: false,
  },
  limit: {
    type: "number",
    describe: "Maximum number of signatures to analyze",
    demand: false,
    default: 1000,
  },
  verbose: {
    type: "boolean",
    describe: "Enable debugging info",
    demand: false,
    default: false,
  },
}).argv;

//= end - globals

//= begin - utility functions

const sleep = (t: any) => new Promise((s) => setTimeout(s, t));

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

//= end - utility functions

//= begin - business logic functions

function sortLogs(): Array<string> {
  const sortedEntries = [...LOG_MAP.entries()].sort(
    (a: any, b: any) => a[0] - b[0]
  );
  const output: Array<string> = [];
  for (let [, log] of sortedEntries) {
    output.push(log);
  }
  return output;
}

async function getTxSignatureAroundTimestamp(
  connection: Connection,
  timestamp: number
): Promise<string> {
  let maxSlot = await connection.getSlot();
  let minSlot = 0;
  let currentBlock;
  let midSlot = 0;
  console.log("Goal block time:", new Date(timestamp * 1000).toLocaleString());

  //= begin - binary search to find a block close enough to the desired one
  while (maxSlot - minSlot > 10) {
    midSlot = minSlot + Math.floor((maxSlot - minSlot) / 2);
    while (true) {
      try {
        currentBlock = (await connection.getBlock(midSlot, {
          maxSupportedTransactionVersion: 0,
          transactionDetails: "none",
          commitment: "finalized",
        })!)!;
        break;
      } catch (error) {
        if (argv.verbose) {
          console.error("Error fetching block:", error);
        };
        // generating a random number to avoid loops based on the slot size
        // matching exactly the midSlot retrocession
        midSlot -= Math.floor(Math.random() * 142);
      }
    }
    if (currentBlock == null) {
      if (argv.verbose) {
        console.log("Block not found");
      };
      return "";
    }

    if (argv.verbose) {
      console.log(
        "Guessed block time:",
        new Date(currentBlock.blockTime! * 1000).toLocaleString()
      );
    };

    const diff = currentBlock.blockTime! - timestamp;
    if (diff >= 0) {
      maxSlot = midSlot;
    } else {
      minSlot = midSlot;
    }
  }
  //= end - binary search to find a block close enough to the desired one

  console.log("Block closest to the timestamp:", minSlot);
  //= begin - sequential scan to find the desired block now that we're close enough
  while (true) {
    try {
      currentBlock = (await connection.getBlock(midSlot, {
        maxSupportedTransactionVersion: 0,
        transactionDetails: "full",
        commitment: "finalized",
      }))!;
      break;
    } catch (error) {
      if (argv.verbose) {
        console.error("Error fetching block:", error);
      };
      midSlot -= 100;
    }
  }
  //= end - sequential scan to find the desired block now that we're close enough
  return currentBlock.transactions[0].transaction.signatures[0];
}

async function loadTransactionLogs(
  connection: Connection,
  transactionSignature: string,
  startTime: number,
  filter: string
): Promise<number> {
  while (true) {
    try {
      // Get transaction details
      if (!ALLOW_MORE_QUERIES) {
        return -1;
      }
      CURRENT_AWAIT_COUNT += 1;
      await connection
        .getTransaction(transactionSignature, {
          maxSupportedTransactionVersion: 0,
        })
        .then((tx) => {
          CURRENT_AWAIT_COUNT += 1;
          HAS_STARTED = true;
          tx = tx!;
          // WAY TOO verbose
          // if (argv.verbose) {
          //   console.log(tx);
          // };
          const timestamp = new Date(Number(tx.blockTime) * 1000).toISOString();

          let logs: Array<string> = [];
          if (filter) {
            logs = tx.meta!.logMessages!
              .filter((m) => m.includes(filter));
          } else {
            logs = tx.meta!.logMessages!;
          };

          for (let log of logs) {
            //log = log.slice(regexLen);
            const out = `${tx.blockTime} (${timestamp}) ${transactionSignature}: ${log}`;
            LOG_MAP.set(tx.blockTime!, out);
          }

          if (tx.blockTime! < startTime) {
            ALLOW_MORE_QUERIES = false;
          }
          CURRENT_AWAIT_COUNT -= 1;
          return tx.blockTime!;
        });
      break;
    } catch (error) {
      if (argv.verbose) {
        console.error("Error loading transaction logs:", error);
      };
      CURRENT_AWAIT_COUNT -= 1;
      await delay(1000);
    }
  }
  CURRENT_AWAIT_COUNT -= 1;
  return -1;
}

async function getTransactionSignatures(
  connection: Connection,
  account: PublicKey,
  beforeSignature: string,
  startTime: number,
  filter: string
) {
  if (!ALLOW_MORE_QUERIES) {
    return;
  }
  CURRENT_AWAIT_COUNT += 1;
  let lastSignature = beforeSignature;
  try {
    // Go to https://explorer.solana.com/block/SLOT_NUMBER
    // and find a slot closest to the end timestamp you need, use a signature there
    const signatures = await connection.getConfirmedSignaturesForAddress2(
      account,
      {
        limit: argv.limit,
        before: beforeSignature,
      }
    );

    for (let i = 0; i < signatures.length; i++) {
      // Load transaction logs for each signature
      if (ALLOW_MORE_QUERIES) {
        if (argv.verbose) {
          console.log("Loading logs for signature:", signatures[i].signature);
        };
        try {
          loadTransactionLogs(
            connection,
            signatures[i].signature,
            startTime,
            filter
          );
        } catch (error) {
          console.error("Error loading transaction logs:", error);
        }
      }
    }
    lastSignature = signatures[signatures.length - 1].signature;
  } catch (error) {
    console.error("Error fetching transaction signatures:", error);
  }
  CURRENT_AWAIT_COUNT -= 1;
  if (ALLOW_MORE_QUERIES) {
    if (argv.verbose) {
      console.log("Last signature:", lastSignature);
    };
    await getTransactionSignatures(
      connection,
      account,
      lastSignature,
      startTime,
      filter
    );
  }
}

//= end - business logic functions

//= begin - main loop

(async () => {
  try {
    //= begin - basic setup
    const connection = new Connection(argv.url);
    const account = new PublicKey(argv.account);
    //= end - basic setup

    //= begin - events gathering
    const startTime = argv.startTime;
    const endTime = argv.endTime;

    if (startTime >= endTime) {
      console.log("startTime should be earlier than endTime");
      console.log("startTime : ", startTime, new Date(startTime * 1000).toISOString());
      console.log("endTime   : ", endTime, new Date(endTime * 1000).toISOString());
      process.exit(1);
    };

    const sig = await getTxSignatureAroundTimestamp(connection, endTime);
    console.log("Starting from signature:", sig);
    getTransactionSignatures(connection, account, sig, startTime, argv.filter);

    await delay(1000);
    while (!HAS_STARTED || CURRENT_AWAIT_COUNT > 0) {
      await delay(1000);
    }

    const sortedLogs = sortLogs();
    //= end - events gathering

    //= begin - output to file or stdout
    if (argv.output) {
      console.log("Writing results to log file:", argv.output);

      fs.writeFileSync(argv.output, sortedLogs.join("\n"));
    } else {
      console.log(sortedLogs.join("\n"));
    }
    //= end - output to file or stdout
    /*

    // TODO: add a feature like --data or similar that focuses on logs
    // with `Program data: `

    //= begin - events parsing
    const programId = new PublicKey(
      "SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f"
    );
    const wallet = new anchor.Wallet(Keypair.generate());
    const provider = new anchor.AnchorProvider(connection, wallet, {});

    const idl = await anchor.Program.fetchIdl(programId, provider);
    if (!idl) {
      console.error("Program requested not found: ", argv.account);
      process.exit(1);
    };
    const decoder = new anchor.BorshEventCoder(idl);

    for (var line of sortedLogs) {
      if (argv.verbose) {
        console.log("line: ", line);
      };

      const parts = line.split(/ +/);
      if (argv.verbose) {
        console.log("parts: ", parts);
      };
      const signature = parts[2].replace(":", "");
      if (argv.verbose) {
        console.log("signature: ", signature);
      };
      signatures.push(signature);

      //= check if line is data and needs decoding
      if (parts[4] == "data:") {
        const serialized = parts[5];
        if (argv.verbose) {
          console.log("serialized: ", serialized);
        };
        const parsed = decoder.decode(serialized);
        if (argv.verbose) {
          console.log("parsed: ", parsed);
        };

        const result = parsed!.data;
        const sig = signature;

        const mantissa = new Big(result.value.mantissa.toString());
        const scale = new Big(10).pow(result.value.scale);
        const value = mantissa.div(scale).toString();
        const timestamp = new Date(
          result.timestamp.toNumber() * 1000
        ).toUTCString();

        const outLine = `${timestamp} - ${sig} ${value}`;
        outlogs.push(outLine);
      };

      //= begin - output to file or stdout
      if (argv.output) {
        console.log("Writing results to log file:", argv.output);
        const outlogs: string[] = [];
        for (const idx in results) {
          const result = results[idx];
          const sig = signatures[idx];
          const mantissa = new Big(result.value.mantissa.toString());
          const scale = new Big(10).pow(result.value.scale);
          const value = mantissa.div(scale).toString();
          const timestamp = new Date(
            result.timestamp.toNumber() * 1000
          ).toUTCString();
          const outLine = `${timestamp} - ${sig} ${value}`;
          outlogs.push(outLine);
        }

        fs.writeFileSync(argv.output, outlogs.join("\n"));
      } else {
        console.log("Results:", results);
      };
    };
    //= end - events parsing
    */

    // exit with no errors
    process.exit(0);
  } catch (error) {
    console.error("Caught Error:", error);
  };

  await sleep(3600); // 1 hour
  process.exit(1);
})();
//= end - main loop
