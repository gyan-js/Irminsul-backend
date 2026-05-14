# Irminsul (IRM) — Blockchain Simulation

A full-featured cryptocurrency blockchain simulation built in Node.js. RasChain implements core blockchain concepts including Proof-of-Work mining, UTXO-based balances, Merkle trees, HD wallets, MultiSig wallets, dynamic difficulty adjustment, and a RESTful API server.

---

## Project Structure

```
project/
├── server.js                        # Entry point — Express server
└── src/
    ├── core/
    │   ├── block.js                 # Transaction, Block, Blockchain classes
    │   └── wallet.js                # Wallet, HDWallet, MultiSigWallet classes
    ├── routes/
    │   ├── chain.js                 # Chain & block query routes
    │   ├── wallets.js               # Wallet management routes
    │   ├── transactions.js          # Transaction build/submit routes
    │   └── mining.js                # Block mining route
    ├── state/
    │   └── appState.js              # Shared in-memory state & business logic
    └── middleware/
        └── errorHandler.js          # Global error & 404 handlers
```

---

## File Reference

### `server.js` — Application Entry Point

Bootstraps the Express server and wires all routes together.

- Initializes middleware: `cors`, `express.json()`, `morgan` (HTTP logging)
- Mounts route groups at `/api/chain`, `/api/wallets`, `/api/transactions`, `/api/mining`
- Registers the 404 and global error handlers last
- Listens on `PORT` (default `3000`)

---

### `src/core/block.js` — Core Blockchain Engine

The heart of the simulation. Contains three classes:

#### `Transaction`
Represents a single transfer of value.

| Field | Description |
|---|---|
| `id` | UUID auto-generated on construction |
| `from` | Sender address (`null` for coinbase) |
| `to` | Recipient address |
| `amount` | Transfer amount |
| `fee` | Miner tip (default `0`) |
| `data` | Optional memo / metadata |
| `signature` | Attached after signing |

Key methods: `sign(fn)`, `hash()`, `signingPayload` (getter), `toJSON()`

#### `Block`
Groups transactions into an immutable block with Proof-of-Work.

- Computes a **Merkle root** from all transaction hashes
- Computes its own **SHA-256 hash** over `{index, previousHash, merkleRoot, difficulty, miner, nonce, timestamp}`
- `isHashValid()` — checks whether the hash satisfies the current difficulty (leading zeros)
- `recomputeHash()` — called during mining as nonce increments

#### `Blockchain`
Manages the full chain, mempool, UTXO set, and consensus rules.

| Config Option | Default | Description |
|---|---|---|
| `blockReward` | `50` | Base coinbase reward |
| `halvingInterval` | `10` | Blocks between reward halvings |
| `targetBlockTime` | `5000ms` | Desired ms per block |
| `difficultyWindow` | `5` | Blocks used for difficulty retarget |
| `maxSupply` | `10,000,000` | Hard cap on total IRM |
| `initialDifficulty` | `2` | Starting PoW difficulty |
| `maxTxPerBlock` | `10` | Max transactions per block |

Key methods:

- `mineBlock(minerAddress)` — selects top-fee transactions, creates a coinbase tx, runs PoW loop, applies the block
- `addToMempool(tx)` — validates balance and signature presence before queuing
- `#retargetDifficulty()` — adjusts difficulty up/down based on actual vs expected block time
- `#applyBlock(block)` — updates the UTXO set and pushes the block onto the chain
- `getBalance(address)` / `getPendingSpend(address)` — balance queries
- `isChainValid()` — full chain integrity check (hash recompute + link verification + PoW check)
- `getHistory(address)` — all transactions involving an address across the chain
- `stats()` — snapshot of chain health (height, difficulty, circulating supply, halving info)

---

### `src/core/wallet.js` — Wallet Cryptography

Handles key generation, address derivation, signing, and wallet types.

#### Utility Functions

| Function | Description |
|---|---|
| `generateKeyPair()` | RSA-512 key pair via Node.js `crypto` |
| `publicKeyToAddress(pubKey)` | SHA-256 → RIPEMD-160 → `IRM` + 32-char hex address |
| `sign(payload, privateKey)` | SHA-256 RSA signature, returns hex |
| `verify(payload, sig, pubKey)` | Verifies a hex signature against a public key |

#### `Wallet`
A standard single-key wallet.

- Generates an RSA key pair and derives its address on construction
- `buildTransaction(TransactionClass, opts)` — creates and signs a transaction, logs it to `pendingLog`
- `addContact(name, address)` / `getContact(name)` — address book
- `export()` / `Wallet.import(data)` — serialization for persistence

#### `HDWallet` (Hierarchical Deterministic)
Deterministically derives child wallets from a seed.

- `deriveChild(path, label)` — creates a child `Wallet` at a BIP-style path (e.g. `m/0/0`) using HMAC-SHA256
- `deriveReceiveAddresses(count)` — derives `m/0/0` through `m/0/n`
- `deriveChangeAddresses(count)` — derives `m/1/0` through `m/1/n`

> **Note:** Child key pairs are independently generated (not mathematically derived from parent), making this a simulation of HD structure rather than a spec-compliant BIP-32 implementation.

#### `MultiSigWallet`
An M-of-N multi-signature wallet.

- Address is `MSIG-` + SHA-256 hash of all signer addresses joined
- `sign(TransactionClass, opts)` — collects signatures from the first `required` signers and serializes them as a JSON array on `tx.signature`

---

### `src/state/appState.js` — Shared State & Business Logic

The single source of truth for runtime state. All routes call functions from here rather than touching the core classes directly.

**State maps:**

| Variable | Contents |
|---|---|
| `chain` | The `Blockchain` instance (configured for RasChain) |
| `wallets` | `Map<address, Wallet>` — all registered wallets |
| `hdWallets` | `Map<seedHex, HDWallet>` |
| `multiSigWallets` | `Map<address, MultiSigWallet>` |

**Key functions:**

| Function | Description |
|---|---|
| `createWallet(label)` | Creates and registers a new wallet |
| `importWallet(payload)` | Imports a wallet from exported keys |
| `createHdWallet(seedHex?)` | Creates an HD wallet, optionally from a given seed |
| `deriveHdChild(seedHex, path, label?)` | Derives a child from an HD wallet and registers it |
| `createMultiSigWallet(addresses, required)` | Looks up signers and creates a MultiSig wallet |
| `verifyTransactionSignature(tx)` | Handles both single-sig and multi-sig verification |
| `createSignedTransaction(opts)` | Builds and signs a tx using a registered wallet |
| `createMultiSigTransaction(opts)` | Builds a tx signed by a MultiSig wallet |
| `submitTransaction(tx)` | Verifies signature then adds tx to mempool |
| `serializeWallet(wallet)` | Returns wallet info merged with live balance data |

---

### `src/routes/chain.js` — Chain Query Routes

All routes are read-only (`GET`).

| Endpoint | Description |
|---|---|
| `GET /api/chain/stats` | Chain statistics (height, difficulty, supply, etc.) |
| `GET /api/chain/validate` | Full chain integrity check |
| `GET /api/chain/mempool` | Pending transactions in the mempool |
| `GET /api/chain/blocks` | All blocks |
| `GET /api/chain/blocks/:index` | Single block by index |
| `GET /api/chain/blocks/hash/:hash` | Single block by hash |
| `GET /api/chain/addresses/:address/balance` | Balance, pending spend, and available balance |
| `GET /api/chain/addresses/:address/history` | Full transaction history for an address |

---

### `src/routes/wallets.js` — Wallet Management Routes

| Endpoint | Description |
|---|---|
| `POST /api/wallets` | Create a new wallet |
| `POST /api/wallets/import` | Import wallet from private/public key |
| `GET /api/wallets/:address` | Get wallet info + balance |
| `GET /api/wallets/:address/export` | Export wallet keys |
| `POST /api/wallets/:address/contacts` | Add a named contact address |
| `GET /api/wallets/:address/history` | Transaction history for wallet |
| `POST /api/wallets/hd` | Create an HD wallet |
| `POST /api/wallets/hd/:seedHex/derive` | Derive a child wallet from an HD seed |
| `POST /api/wallets/multisig` | Create a MultiSig wallet from signer addresses |
| `GET /api/wallets/multisig/:address` | Get MultiSig wallet info + balance |

---

### `src/routes/transactions.js` — Transaction Routes

| Endpoint | Description |
|---|---|
| `POST /api/transactions/build` | Build + sign a transaction (wallet must exist in state) |
| `POST /api/transactions/build-multisig` | Build + sign a MultiSig transaction |
| `POST /api/transactions/submit` | Submit a pre-built transaction to the mempool |
| `POST /api/transactions/verify` | Verify a transaction's signature without submitting |

---

### `src/routes/mining.js` — Mining Route

| Endpoint | Description |
|---|---|
| `POST /api/mining/mine` | Mine a new block; body: `{ "minerAddress": "IRM..." }` |

Mining selects the highest-fee transactions from the mempool (up to `maxTxPerBlock`), prepends a coinbase transaction, runs the PoW loop, and returns the new block alongside updated chain stats.

---

### `src/middleware/errorHandler.js` — Error Handling

Two Express middleware functions registered at the end of the middleware stack:

- **`notFoundHandler`** — catches any unmatched route and returns `404` with the attempted method and path
- **`errorHandler`** — catches errors thrown in route handlers, returns `err.statusCode` (default `400`) with the error message

---

## Getting Started

```bash
# Install dependencies
npm install

# Start the server
node server.js
# → RasChain API listening on http://localhost:3000
```

**Quick workflow example:**

```bash
# 1. Create two wallets
curl -X POST http://localhost:3000/api/wallets -H "Content-Type: application/json" -d '{"label":"Alice"}'
curl -X POST http://localhost:3000/api/wallets -H "Content-Type: application/json" -d '{"label":"Bob"}'

# 2. Mine a block to give Alice some IRM
curl -X POST http://localhost:3000/api/mining/mine -H "Content-Type: application/json" -d '{"minerAddress":"<alice_address>"}'

# 3. Send IRM from Alice to Bob
curl -X POST http://localhost:3000/api/transactions/build -H "Content-Type: application/json" \
  -d '{"from":"<alice_address>","to":"<bob_address>","amount":10,"fee":1}'

# 4. Submit the transaction
curl -X POST http://localhost:3000/api/transactions/submit -H "Content-Type: application/json" -d '<tx_json>'

# 5. Mine again to confirm
curl -X POST http://localhost:3000/api/mining/mine -H "Content-Type: application/json" -d '{"minerAddress":"<alice_address>"}'
```

---

## Key Design Notes

- **In-memory only** — all state (chain, wallets, mempool) lives in RAM and resets on server restart. There is no database or persistence layer.
- **RSA-512 keys** — intentionally small for simulation speed; not suitable for production security.
- **Simplified UTXO model** — balances are stored as a flat `Map<address, number>` rather than tracking individual unspent outputs.
- **HD wallet derivation** — uses HMAC-SHA256 to derive a seed per path, but generates independent RSA key pairs rather than implementing BIP-32 elliptic curve derivation.