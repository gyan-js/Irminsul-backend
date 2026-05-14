import crypto from 'node:crypto';

function generateKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 512,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKey, publicKey };
}

function publicKeyToAddress(publicKey) {
  const sha256 = crypto.createHash('sha256').update(publicKey).digest();
  const ripemd = crypto.createHash('ripemd160').update(sha256).digest('hex');
  return 'IRM' + ripemd.slice(0, 32).toUpperCase();
}

function sign(payload, privateKey) {
  return crypto.createSign('SHA256').update(payload).sign(privateKey, 'hex');
}

function verify(payload, signature, publicKey) {
  try {
    return crypto.createVerify('SHA256').update(payload).verify(publicKey, signature, 'hex');
  } catch {
    return false;
  }
}

class Wallet {
  constructor(label = 'Wallet', keys = null) {
    this.label = label;
    this.createdAt = new Date().toISOString();

    const kp = keys ?? generateKeyPair();
    this.privateKey = kp.privateKey;
    this.publicKey = kp.publicKey;
    this.address = publicKeyToAddress(this.publicKey);
    this.contacts = new Map();
    this.pendingLog = [];
  }

  sign(payload) {
    return sign(payload, this.privateKey);
  }

  verify(payload, signature, pubKey = this.publicKey) {
    return verify(payload, signature, pubKey);
  }

  buildTransaction(TransactionClass, { to, amount, fee = 0, memo = null }) {
    if (amount <= 0) throw new Error('Amount must be > 0');

    const tx = new TransactionClass({
      from: this.address,
      to,
      amount,
      fee,
      data: memo,
    });

    tx.sign((payload) => this.sign(payload));
    this.pendingLog.push({ txId: tx.id, to, amount, fee, memo, at: new Date().toISOString() });
    return tx;
  }

  addContact(name, address) {
    this.contacts.set(name, address);
  }

  getContact(name) {
    const addr = this.contacts.get(name);
    if (!addr) throw new Error(`Contact "${name}" not found`);
    return addr;
  }

  export() {
    return {
      label: this.label,
      address: this.address,
      publicKey: this.publicKey,
      privateKey: this.privateKey,
      createdAt: this.createdAt,
    };
  }

  static import(exported) {
    const w = new Wallet(exported.label, {
      privateKey: exported.privateKey,
      publicKey: exported.publicKey,
    });
    w.createdAt = exported.createdAt;
    return w;
  }

  info() {
    return {
      label: this.label,
      address: this.address,
      publicKey: this.publicKey,
      createdAt: this.createdAt,
      contacts: Object.fromEntries(this.contacts),
      pendingLog: this.pendingLog,
    };
  }
}

class HDWallet {
  constructor(seed = null) {
    this.seed = seed ? Buffer.from(seed, 'hex') : crypto.randomBytes(32);
    this.seedHex = this.seed.toString('hex');
    this.children = new Map();
  }

  deriveChild(path = 'm/0/0', label = null) {
    if (this.children.has(path)) return this.children.get(path);

    const derived = crypto.createHmac('sha256', this.seed).update(path).digest('hex');
    const kp = generateKeyPair();
    const child = new Wallet(label ?? path, kp);
    child._derivationPath = path;
    child._derivedSeed = derived;

    this.children.set(path, child);
    return child;
  }

  deriveReceiveAddresses(count = 5) {
    return Array.from({ length: count }, (_, i) => this.deriveChild(`m/0/${i}`, `Receive #${i}`));
  }

  deriveChangeAddresses(count = 3) {
    return Array.from({ length: count }, (_, i) => this.deriveChild(`m/1/${i}`, `Change #${i}`));
  }
}

class MultiSigWallet {
  constructor(signers, required) {
    if (required > signers.length) throw new Error('required > total signers');

    this.signers = signers;
    this.required = required;
    this.address =
      'MSIG-' +
      crypto.createHash('sha256').update(signers.map((s) => s.address).join('|')).digest('hex').slice(0, 32).toUpperCase();
  }

  sign(TransactionClass, { to, amount, fee = 0, memo = null }) {
    const tx = new TransactionClass({
      from: this.address,
      to,
      amount,
      fee,
      data: memo ?? `multisig:${this.required}/${this.signers.length}`,
    });

    const sigs = [];
    for (let i = 0; i < this.required; i += 1) {
      sigs.push({
        signer: this.signers[i].address,
        sig: this.signers[i].sign(tx.signingPayload),
      });
    }

    tx.signature = JSON.stringify(sigs);
    return tx;
  }

  info() {
    return {
      address: this.address,
      required: this.required,
      signers: this.signers.map((s) => ({ label: s.label, address: s.address })),
    };
  }
}

export { Wallet, HDWallet, MultiSigWallet, publicKeyToAddress, sign, verify };
