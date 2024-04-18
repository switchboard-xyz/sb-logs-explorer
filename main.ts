import { Connection, PublicKey, Keypair } from "@solana/web3.js";

import * as fs from "fs";
const yargs = require("yargs/yargs");

import * as anchor from "@coral-xyz/anchor";
import * as readline from "readline";
import Big from "big.js";

let ALLOW_MORE_QUERIES = true;
let CURRENT_AWAIT_COUNT = 0;
let HAS_STARTED = false;
const LOG_MAP = new Map<number, string>([]);

const sleep = (t: any) => new Promise((s) => setTimeout(s, t));

const results: any[] = [];
const signatures: string[] = [];

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

const now = new Date().getTime() / 1000; // milliseconds to seconds
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
    describe: "Start time to query transactions (EPOCH time, seconds, UTC)",
    demand: false,
    default: now - 10 * 60 * 1000, // 10 minutes ago
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
  verbose: {
    type: "boolean",
    describe: "Enable debugging info",
    demand: false,
    default: false,
  },
}).argv;

async function getTxSignatureAroundTimestamp(
  connection: Connection,
  timestamp: number
): Promise<string> {
  let maxSlot = await connection.getSlot();
  let minSlot = 0;
  let currentBlock;
  let midSlot = 0;
  console.log("Goal block time:", new Date(timestamp * 1000).toLocaleString());
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

  console.log("Block closest to the timestamp:", minSlot);
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
          if (argv.verbose) {
            console.log(tx);
          };
          const timestamp = new Date(Number(tx.blockTime) * 1000).toISOString();
          let regex = /Program log: /;
          let regexLen = 13;
          if (argv.filter) {
            regex = /Program data: /;
            regexLen = 14;
          }
          const logs = tx
            .meta!.logMessages!.filter((m) => regex.test(m))
            .filter((m) => m.includes(filter));
          for (let log of logs) {
            log = log.slice(regexLen);
            const out = `${tx.blockTime} (${timestamp}) ${transactionSignature}: ${log}`;
            LOG_MAP.set(tx.blockTime!, out);
            if (argv.verbose) {
              console.log(out);
            };
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
        limit: 1000,
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  try {
    //= begin - basic setup
    const connection = new Connection(argv.url);
    const account = new PublicKey(argv.account);
    //= end - basic setup

    //= begin - events gathering
    const startTime = argv.startTime;
    const endTime = argv.endTime;

    const sig = await getTxSignatureAroundTimestamp(connection, endTime);
    console.log("Starting from signature:", sig);
    getTransactionSignatures(connection, account, sig, startTime, argv.filter);

    await delay(1000);
    while (!HAS_STARTED || CURRENT_AWAIT_COUNT > 0) {
      await delay(1000);
    }
    const sortedLogs = sortLogs();
    //= end - events gathering

    //= begin - file based events parsing
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
    console.log(">>>>>>>>>> 4 DEBUG LELE");
    const program = new anchor.Program(idl!, provider);
    console.log(">>>>>>>>>> 5 DEBUG LELE");
    const decoder = new anchor.BorshEventCoder(idl!);
    console.log(">>>>>>>>>> 6 DEBUG LELE");

    for (let line in sortedLogs) {
      const parts = line.split(/ +/);
      const signature = parts[parts.length - 2];
      const serialized = parts[parts.length - 1];
      const parsed = decoder.decode(serialized);
      if (argv.filter) {
        let regex = /argv.filter/;
        if (!regex.test(parsed?.name || "")) {
          continue;
        };
      };
      signatures.push(signature);
      results.push(parsed!.data);
    };
    //= end - file based events parsing

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
    }
    //= end - output to file or stdout

    // exit with no errors
    process.exit(0);
  } catch (error) {
    console.error("Caught Error:", error);
  }

  await sleep(1_000_000_000);
})();
