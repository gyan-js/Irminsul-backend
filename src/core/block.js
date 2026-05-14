import crypto from 'node:crypto';

class Transaction {
  constructor({ from, to, amount, fee = 0, data = null }) {
    this.id = crypto.randomUUID();
    this.from = from;
    this.to = to;
    this.amount = amount;
    this.fee = fee;
    this.data = data;
    this.timestamp = Date.now();
    this.signature = null;
  }

  get signingPayload() {
    return JSON.stringify({
      id: this.id,
      from: this.from,
      to: this.to,
      amount: this.amount,
      fee: this.fee,
      data: this.data,
      timestamp: this.timestamp,
    });
  }

  hash() {
    return crypto.createHash('sha256').update(this.signingPayload).digest('hex');
  }

  sign(signatureFn) {
    if (!this.from) throw new Error('Coinbase transactions are not signed');
    this.signature = signatureFn(this.signingPayload);
  }

  toJSON() {
    return {
      id: this.id,
      from: this.from,
      to: this.to,
      amount: this.amount,
      fee: this.fee,
      data: this.data,
      timestamp: new Date(this.timestamp).toISOString(),
      signature: this.signature,
    };
  }
}

class Block {
  constructor({ index, previousHash, transactions, difficulty, miner, nonce = 0 }) {
    this.index = index;
    this.previousHash = previousHash;
    this.transactions = transactions;
    this.difficulty = difficulty;
    this.miner = miner;
    this.nonce = nonce;
    this.timestamp = Date.now();
    this.merkleRoot = this.#buildMerkleRoot();
    this.hash = this.#computeHash();
  }

  #buildMerkleRoot() {
    const hashes = this.transactions.map((t) => t.hash());
    if (!hashes.length) return crypto.createHash('sha256').update('empty').digest('hex');

    let layer = hashes;
    while (layer.length > 1) {
      const next = [];
      for (let i = 0; i < layer.length; i += 2) {
        const left = layer[i];
        const right = layer[i + 1] ?? left;
        next.push(crypto.createHash('sha256').update(left + right).digest('hex'));
      }
      layer = next;
    }
    return layer[0];
  }

  #computeHash() {
    const content = JSON.stringify({
      index: this.index,
      previousHash: this.previousHash,
      merkleRoot: this.merkleRoot,
      difficulty: this.difficulty,
      miner: this.miner,
      nonce: this.nonce,
      timestamp: this.timestamp,
    });
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  recomputeHash() {
    this.hash = this.#computeHash();
  }

  isHashValid() {
    return this.hash.startsWith('0'.repeat(this.difficulty));
  }

  toJSON() {
    return {
      index: this.index,
      hash: this.hash,
      previousHash: this.previousHash,
      merkleRoot: this.merkleRoot,
      difficulty: this.difficulty,
      miner: this.miner,
      nonce: this.nonce,
      timestamp: new Date(this.timestamp).toISOString(),
      txCount: this.transactions.length,
      transactions: this.transactions.map((tx) => tx.toJSON()),
    };
  }
}

class Blockchain {
  constructor({
    name = 'IRMINSUL',
    ticker = 'IRM',
    initialSupply = 0,
    blockReward = 50,
    halvingInterval = 10,
    targetBlockTime = 5000,
    difficultyWindow = 5,
    maxSupply = 10_000_000,
    initialDifficulty = 2,
    maxTxPerBlock = 10,
  } = {}) {
    this.name = name;
    this.ticker = ticker;
    this.blockReward = blockReward;
    this.halvingInterval = halvingInterval;
    this.targetBlockTime = targetBlockTime;
    this.difficultyWindow = difficultyWindow;
    this.maxSupply = maxSupply;
    this.maxTxPerBlock = maxTxPerBlock;
    this.difficulty = initialDifficulty;

    this.chain = [];
    this.mempool = [];
    this.utxoSet = new Map();
    this.totalMinted = initialSupply;

    this.#addGenesisBlock();
  }

  #addGenesisBlock() {
    const genesis = new Block({
      index: 0,
      previousHash: '0'.repeat(64),
      transactions: [],
      difficulty: this.difficulty,
      miner: null,
    });

    while (!genesis.isHashValid()) {
      genesis.nonce += 1;
      genesis.recomputeHash();
    }

    this.chain.push(genesis);
  }

  get latestBlock() {
    return this.chain[this.chain.length - 1];
  }

  get height() {
    return this.chain.length - 1;
  }

  currentBlockReward() {
    const halvings = Math.floor(this.height / this.halvingInterval);
    const reward = this.blockReward / Math.pow(2, halvings);
    const remaining = this.maxSupply - this.totalMinted;
    return Math.min(reward, remaining);
  }

  #retargetDifficulty() {
    const len = this.chain.length;
    if (len < this.difficultyWindow + 1) return;
    if ((len - 1) % this.difficultyWindow !== 0) return;

    const windowStart = this.chain[len - 1 - this.difficultyWindow];
    const windowEnd = this.chain[len - 1];
    const elapsed = windowEnd.timestamp - windowStart.timestamp;
    const expected = this.targetBlockTime * this.difficultyWindow;
    const ratio = elapsed / expected;

    if (ratio < 0.5) this.difficulty = Math.min(this.difficulty + 1, 6);
    else if (ratio > 2.0) this.difficulty = Math.max(this.difficulty - 1, 1);
  }

  addToMempool(tx) {
    if (!tx.from) throw new Error('Only signed transactions go into the mempool');
    if (!tx.signature) throw new Error('Transaction must be signed before submission');
    if (tx.amount <= 0) throw new Error('Amount must be positive');
    if (tx.fee < 0) throw new Error('Fee cannot be negative');

    const senderBalance = this.getBalance(tx.from);
    const reservedSpend = this.getPendingSpend(tx.from);
    const available = senderBalance - reservedSpend;

    if (available < tx.amount + tx.fee) {
      throw new Error(`Insufficient balance: have ${available}, need ${tx.amount + tx.fee}`);
    }

    this.mempool.push(tx);
    return tx;
  }

  getPendingSpend(address) {
    return this.mempool
      .filter((tx) => tx.from === address)
      .reduce((sum, tx) => sum + tx.amount + tx.fee, 0);
  }

  mineBlock(minerAddress) {
    const reward = this.currentBlockReward();
    const selectedTxs = [...this.mempool]
      .sort((a, b) => b.fee - a.fee)
      .slice(0, this.maxTxPerBlock);

    const totalFees = selectedTxs.reduce((s, t) => s + t.fee, 0);

    const coinbase = new Transaction({
      from: null,
      to: minerAddress,
      amount: reward + totalFees,
      fee: 0,
      data: `Block ${this.height + 1} reward`,
    });

    const block = new Block({
      index: this.height + 1,
      previousHash: this.latestBlock.hash,
      transactions: [coinbase, ...selectedTxs],
      difficulty: this.difficulty,
      miner: minerAddress,
    });

    while (!block.isHashValid()) {
      block.nonce += 1;
      block.recomputeHash();
    }

    this.#applyBlock(block);
    this.#retargetDifficulty();

    const confirmedIds = new Set(selectedTxs.map((t) => t.id));
    this.mempool = this.mempool.filter((t) => !confirmedIds.has(t.id));

    return block;
  }

  #applyBlock(block) {
    for (const tx of block.transactions) {
      if (tx.from) {
        const senderBal = this.getBalance(tx.from);
        this.utxoSet.set(tx.from, senderBal - tx.amount - tx.fee);
      }

      const receiverBal = this.getBalance(tx.to);
      this.utxoSet.set(tx.to, receiverBal + tx.amount);

      if (!tx.from) this.totalMinted += tx.amount;
    }

    this.chain.push(block);
  }

  getBalance(address) {
    return this.utxoSet.get(address) ?? 0;
  }

  isChainValid() {
    for (let i = 1; i < this.chain.length; i += 1) {
      const current = this.chain[i];
      const previous = this.chain[i - 1];

      const content = JSON.stringify({
        index: current.index,
        previousHash: current.previousHash,
        merkleRoot: current.merkleRoot,
        difficulty: current.difficulty,
        miner: current.miner,
        nonce: current.nonce,
        timestamp: current.timestamp,
      });

      const recomputed = crypto.createHash('sha256').update(content).digest('hex');

      if (current.hash !== recomputed) return { valid: false, reason: `Block #${i} hash mismatch` };
      if (current.previousHash !== previous.hash) return { valid: false, reason: `Block #${i} broken link` };
      if (!current.hash.startsWith('0'.repeat(current.difficulty))) {
        return { valid: false, reason: `Block #${i} insufficient PoW` };
      }
    }

    return { valid: true };
  }

  getHistory(address) {
    const history = [];
    for (const block of this.chain) {
      for (const tx of block.transactions) {
        if (tx.from === address || tx.to === address) {
          history.push({ block: block.index, ...tx.toJSON() });
        }
      }
    }
    return history;
  }

  stats() {
    const halvings = Math.floor(this.height / this.halvingInterval);
    return {
      name: this.name,
      ticker: this.ticker,
      height: this.height,
      difficulty: this.difficulty,
      mempoolSize: this.mempool.length,
      totalMinted: this.totalMinted,
      maxSupply: this.maxSupply,
      circulatingPct: `${((this.totalMinted / this.maxSupply) * 100).toFixed(4)}%`,
      blockRewardNow: this.currentBlockReward(),
      halvings,
      nextHalvingIn: this.halvingInterval - (this.height % this.halvingInterval),
    };
  }
}

export { Transaction, Block, Blockchain };
