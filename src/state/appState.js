import { Blockchain, Transaction } from '../core/block.js';
import { Wallet, HDWallet, MultiSigWallet, verify } from '../core/wallet.js';
import fs from 'node:fs';
const chain = new Blockchain({
  name: 'IRMINSUL',
  ticker: 'IRM',
  blockReward: 50,
  halvingInterval: 4,
  targetBlockTime: 100,
  difficultyWindow: 4,
  maxSupply: 10_000_000,
  initialDifficulty: 2,
  maxTxPerBlock: 5,
});



const STATE_FILE = './chain-state.json';


export function saveState() {
  const data = {
    chain: chain.chain.map(b => b.toJSON()),
    utxoSet: Object.fromEntries(chain.utxoSet),
    totalMinted: chain.totalMinted,
    difficulty: chain.difficulty,
    mempool: chain.mempool.map(tx => tx.toJSON()),
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
}

// Load on startup
export function loadState() {
  if (!fs.existsSync(STATE_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    chain.utxoSet = new Map(Object.entries(data.utxoSet));
    chain.totalMinted = data.totalMinted;
    chain.difficulty = data.difficulty;
    // Rebuild chain array from JSON (blocks as plain objects)
    // Note: for full block rebuild you'd need Block reconstruction
    console.log(`[STATE] Loaded: height=${data.chain.length - 1}, minted=${data.totalMinted}`);
  } catch (e) {
    console.warn('[STATE] Could not load state:', e.message);
  }
}

const wallets = new Map();
const hdWallets = new Map();
const multiSigWallets = new Map();

function registerWallet(wallet) {
  wallets.set(wallet.address, wallet);
  return wallet;
}

function createWallet(label = 'Wallet') {
  return registerWallet(new Wallet(label));
}

function importWallet(payload) {
  const wallet = Wallet.import(payload);
  return registerWallet(wallet);
}

function createHdWallet(seedHex = null) {
  const hd = new HDWallet(seedHex);
  hdWallets.set(hd.seedHex, hd);
  return hd;
}

function deriveHdChild(seedHex, path, label = null) {
  const hd = hdWallets.get(seedHex);
  if (!hd) throw new Error('HD wallet not found');
  const child = hd.deriveChild(path, label);
  registerWallet(child);
  return child;
}

function createMultiSigWallet(addresses, required) {
  const signers = addresses.map((address) => {
    const wallet = wallets.get(address);
    if (!wallet) throw new Error(`Signer wallet not found: ${address}`);
    return wallet;
  });

  const msig = new MultiSigWallet(signers, required);
  multiSigWallets.set(msig.address, msig);
  return msig;
}

function getWallet(address) {
  return wallets.get(address) ?? null;
}

function verifyTransactionSignature(tx) {
  if (!tx.from) return true;

  const normalWallet = wallets.get(tx.from);
  if (normalWallet) {
    return verify(tx.signingPayload, tx.signature, normalWallet.publicKey);
  }

  const multiSig = multiSigWallets.get(tx.from);
  if (multiSig) {
    let sigs;
    try {
      sigs = JSON.parse(tx.signature);
    } catch {
      return false;
    }

    if (!Array.isArray(sigs) || sigs.length < multiSig.required) return false;

    let validCount = 0;
    const seen = new Set();

    for (const entry of sigs) {
      if (!entry?.signer || !entry?.sig || seen.has(entry.signer)) continue;
      const signerWallet = wallets.get(entry.signer);
      if (!signerWallet) continue;
      if (!multiSig.signers.some((signer) => signer.address === entry.signer)) continue;

      const ok = verify(tx.signingPayload, entry.sig, signerWallet.publicKey);
      if (ok) {
        seen.add(entry.signer);
        validCount += 1;
      }
    }

    return validCount >= multiSig.required;
  }

  return false;
}

function createSignedTransaction({ from, to, amount, fee = 0, memo = null }) {
  const wallet = wallets.get(from);
  if (!wallet) throw new Error('Sender wallet not found');
  return wallet.buildTransaction(Transaction, { to, amount, fee, memo });
}

function createMultiSigTransaction({ from, to, amount, fee = 0, memo = null }) {
  const msig = multiSigWallets.get(from);
  if (!msig) throw new Error('MultiSig wallet not found');
  return msig.sign(Transaction, { to, amount, fee, memo });
}

function submitTransaction(tx) {
  if (!verifyTransactionSignature(tx)) {
    throw new Error('Invalid transaction signature');
  }
  return chain.addToMempool(tx);
}

function serializeWallet(wallet) {
  return {
    ...wallet.info(),
    balance: chain.getBalance(wallet.address),
    pendingSpend: chain.getPendingSpend(wallet.address),
  };
}

export {
  chain,
  wallets,
  hdWallets,
  multiSigWallets,
  registerWallet,
  createWallet,
  importWallet,
  createHdWallet,
  deriveHdChild,
  createMultiSigWallet,
  getWallet,
  createSignedTransaction,
  createMultiSigTransaction,
  submitTransaction,
  verifyTransactionSignature,
  serializeWallet,
};
