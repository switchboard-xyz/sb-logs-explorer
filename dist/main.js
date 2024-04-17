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
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const fs = __importStar(require("fs"));
const yargs = require("yargs/yargs");
let ALLOW_MORE_QUERIES = true;
let CURRENT_AWAIT_COUNT = 0;
let HAS_STARTED = false;
const LOG_MAP = new Map([]);
const sleep = (t) => new Promise((s) => setTimeout(s, t));
function sortLogs() {
    const sortedEntries = [...LOG_MAP.entries()].sort((a, b) => a[0] - b[0]);
    const output = [];
    for (let [timestamp, log] of sortedEntries) {
        output.push(log);
    }
    return output;
}
let argv = yargs(process.argv).options({
    account: {
        type: "string",
        describe: "Account to query transaction signatures for",
        demand: true,
    },
    filter: {
        type: "string",
        describe: "Substring to filter logs by",
        demand: true,
    },
    startTime: {
        type: "number",
        describe: "Start time to query transactions",
        demand: true,
    },
    endTime: {
        type: "number",
        describe: "End time to query transactions",
        demand: true,
    },
    url: {
        type: "string",
        describe: "URL of the Solana RPC endpoint",
        demand: true,
    },
    output: {
        type: "string",
        describe: "Output file to write logs to",
        demand: false,
        default: "output.txt",
    },
    forEvents: {
        type: "boolean",
        describe: "Use this flag to query for events instead of logs",
        demand: false,
        default: false,
    },
}).argv;
function getTxSignatureAroundTimestamp(connection, timestamp) {
    return __awaiter(this, void 0, void 0, function* () {
        let maxSlot = yield connection.getSlot();
        let minSlot = 0;
        let currentBlock;
        let midSlot = 0;
        console.log("Goal block time:", new Date(timestamp * 1000).toLocaleString());
        while (maxSlot - minSlot > 10) {
            midSlot = minSlot + Math.floor((maxSlot - minSlot) / 2);
            while (true) {
                try {
                    currentBlock = (yield connection.getBlock(midSlot, {
                        maxSupportedTransactionVersion: 0,
                        transactionDetails: "none",
                        commitment: "finalized",
                    }));
                    break;
                }
                catch (error) {
                    console.error("Error fetching block:", error);
                    midSlot -= 100;
                }
            }
            if (currentBlock == null) {
                console.log("Block not found");
                return "";
            }
            console.log("Guessed block time:", new Date(currentBlock.blockTime * 1000).toLocaleString());
            const diff = currentBlock.blockTime - timestamp;
            if (diff >= 0) {
                maxSlot = midSlot;
            }
            else {
                minSlot = midSlot;
            }
        }
        console.log("Block closest to the timestamp:", minSlot);
        while (true) {
            try {
                currentBlock = (yield connection.getBlock(midSlot, {
                    maxSupportedTransactionVersion: 0,
                    transactionDetails: "full",
                    commitment: "finalized",
                }));
                break;
            }
            catch (error) {
                console.error("Error fetching block:", error);
                midSlot -= 100;
            }
        }
        return currentBlock.transactions[0].transaction.signatures[0];
    });
}
function loadTransactionLogs(connection, transactionSignature, startTime, filter) {
    return __awaiter(this, void 0, void 0, function* () {
        while (true) {
            try {
                // Get transaction details
                if (!ALLOW_MORE_QUERIES) {
                    return -1;
                }
                CURRENT_AWAIT_COUNT += 1;
                yield connection
                    .getTransaction(transactionSignature, {
                    maxSupportedTransactionVersion: 0,
                })
                    .then((tx) => {
                    CURRENT_AWAIT_COUNT += 1;
                    HAS_STARTED = true;
                    tx = tx;
                    // Check if transaction exists
                    // console.log(transaction);
                    const timestamp = new Date(Number(tx.blockTime) * 1000).toISOString();
                    let regex = /Program log: /;
                    let regexLen = 13;
                    if (argv.forEvents) {
                        regex = /Program data: /;
                        regexLen = 14;
                    }
                    const logs = tx
                        .meta.logMessages.filter((m) => regex.test(m))
                        .filter((m) => m.includes(filter));
                    for (let log of logs) {
                        log = log.slice(regexLen);
                        const out = `${tx.blockTime} (${timestamp}) ${transactionSignature}: ${log}`;
                        LOG_MAP.set(tx.blockTime, out);
                        console.log(out);
                    }
                    if (tx.blockTime < startTime) {
                        ALLOW_MORE_QUERIES = false;
                    }
                    CURRENT_AWAIT_COUNT -= 1;
                    return tx.blockTime;
                });
                break;
            }
            catch (error) {
                console.error("Error loading transaction logs:", error);
                CURRENT_AWAIT_COUNT -= 1;
                yield delay(1000);
            }
        }
        CURRENT_AWAIT_COUNT -= 1;
        return -1;
    });
}
function getTransactionSignatures(connection, account, beforeSignature, startTime, filter) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!ALLOW_MORE_QUERIES) {
            return;
        }
        CURRENT_AWAIT_COUNT += 1;
        let lastSignature = beforeSignature;
        try {
            // Go to https://explorer.solana.com/block/SLOT_NUMBER
            // and find a slot closest to the end timestamp you need, use a signature there
            const signatures = yield connection.getConfirmedSignaturesForAddress2(account, {
                limit: 1000,
                before: beforeSignature,
            });
            for (let i = 0; i < signatures.length; i++) {
                // Load transaction logs for each signature
                if (ALLOW_MORE_QUERIES) {
                    console.log("Loading logs for signature:", signatures[i].signature);
                    try {
                        loadTransactionLogs(connection, signatures[i].signature, startTime, filter);
                    }
                    catch (error) {
                        console.error("Error loading transaction logs:", error);
                    }
                }
            }
            lastSignature = signatures[signatures.length - 1].signature;
        }
        catch (error) {
            console.error("Error fetching transaction signatures:", error);
        }
        CURRENT_AWAIT_COUNT -= 1;
        if (ALLOW_MORE_QUERIES) {
            console.log("Last signature:", lastSignature);
            yield getTransactionSignatures(connection, account, lastSignature, startTime, filter);
        }
    });
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const connection = new web3_js_1.Connection(argv.url);
        const account = new web3_js_1.PublicKey(argv.account);
        const startTime = argv.startTime;
        const endTime = argv.endTime;
        const sig = yield getTxSignatureAroundTimestamp(connection, endTime);
        console.log("Starting from signature:", sig);
        getTransactionSignatures(connection, account, sig, startTime, argv.filter);
        yield delay(1000);
        while (!HAS_STARTED || CURRENT_AWAIT_COUNT > 0) {
            yield delay(1000);
        }
        const sortedLogs = sortLogs();
        fs.writeFileSync(argv.output, sortedLogs.join("\n"));
    }
    catch (error) {
        console.error("Caught Error:", error);
    }
}))();
