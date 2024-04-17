import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import * as fs from "fs";
const yargs = require("yargs/yargs");
import * as anchor from "@coral-xyz/anchor";
import * as readline from "readline";
import Big from "big.js";

let argv = yargs(process.argv).options({
  input: {
    type: "string",
    describe: "Input file to read logs from",
    demand: false,
    default: "output.txt",
  },
  output: {
    type: "string",
    describe: "Output file to write logs to",
    demand: false,
    default: "events.txt",
  },
  eventName: {
    type: "string",
    describe: "Event name to filter for",
    demand: true,
  },
}).argv;

const sleep = (t: any) => new Promise((s) => setTimeout(s, t));
const results: any[] = [];
const signatures: string[] = [];

(async () => {
  try {
    const connection = new Connection("https://api.mainnet-beta.solana.com");
    const programId = new PublicKey(
      "SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f"
    );
    const wallet = new anchor.Wallet(Keypair.generate());
    const provider = new anchor.AnchorProvider(connection, wallet, {});
    const idl = await anchor.Program.fetchIdl(programId, provider);
    const program = new anchor.Program(idl!, programId, provider);
    const decoder = new anchor.BorshEventCoder(idl!);
    const readInterface = readline.createInterface({
      input: fs.createReadStream(argv.input),
      output: process.stdout,
      terminal: false,
    });
    readInterface.on("line", function (line) {
      const parts = line.split(/ +/);
      const signature = parts[parts.length - 2];
      const serialized = parts[parts.length - 1];
      const parsed = decoder.decode(serialized);
      if (parsed?.name === argv.eventName) {
        signatures.push(signature);
        results.push(parsed!.data);
      }
    });

    readInterface.on("close", function () {
      console.log("Finished reading the file.");
      console.log("Results:", results);
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
      process.exit(0);
    });
  } catch (error) {
    console.error("Caught Error:", error);
  }
  await sleep(1_000_000_000);
})();
