"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const fs = __importStar(require("fs"));
const yargs = require("yargs/yargs");
const anchor = __importStar(require("@coral-xyz/anchor"));
const readline = __importStar(require("readline"));
const big_js_1 = __importDefault(require("big.js"));
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
const sleep = (t) => new Promise((s) => setTimeout(s, t));
const results = [];
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const connection = new web3_js_1.Connection("https://api.mainnet-beta.solana.com");
        const programId = new web3_js_1.PublicKey("SW1TCH7qEPTdLsDHRgPuMQjbQxKdH2aBStViMFnt64f");
        const wallet = new anchor.Wallet(web3_js_1.Keypair.generate());
        const provider = new anchor.AnchorProvider(connection, wallet, {});
        const idl = yield anchor.Program.fetchIdl(programId, provider);
        const program = new anchor.Program(idl, programId, provider);
        const decoder = new anchor.BorshEventCoder(idl);
        const readInterface = readline.createInterface({
            input: fs.createReadStream(argv.input),
            output: process.stdout,
            terminal: false,
        });
        readInterface.on("line", function (line) {
            const parts = line.split(/ +/);
            const serialized = parts[parts.length - 1];
            const parsed = decoder.decode(serialized);
            if ((parsed === null || parsed === void 0 ? void 0 : parsed.name) === argv.eventName) {
                results.push(parsed.data);
            }
        });
        readInterface.on("close", function () {
            console.log("Finished reading the file.");
            console.log("Results:", results);
            const outlogs = [];
            for (const result of results) {
                const mantissa = new big_js_1.default(result.value.mantissa.toString());
                const scale = new big_js_1.default(10).pow(result.value.scale);
                const value = mantissa.div(scale).toString();
                const timestamp = new Date(result.timestamp.toNumber() * 1000).toUTCString();
                const outLine = `${timestamp}: ${value}`;
                outlogs.push(outLine);
            }
            fs.writeFileSync(argv.output, outlogs.join("\n"));
            process.exit(0);
        });
    }
    catch (error) {
        console.error("Caught Error:", error);
    }
    yield sleep(1000000000);
}))();
