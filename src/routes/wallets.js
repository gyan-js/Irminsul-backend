import { Router } from 'express';
import {
  chain,
  createWallet,
  importWallet,
  createHdWallet,
  deriveHdChild,
  createMultiSigWallet,
  getWallet,
  multiSigWallets,
  serializeWallet,
} from '../state/appState.js';

const router = Router();

router.post('/', (req, res) => {
  const { label = 'Wallet' } = req.body;
  const wallet = createWallet(label);
  res.status(201).json({
    success: true,
    data: {
      ...serializeWallet(wallet),
      export: wallet.export(),
    },
  });
});

router.post('/import', (req, res) => {
  const wallet = importWallet(req.body);
  res.status(201).json({
    success: true,
    data: {
      ...serializeWallet(wallet),
      export: wallet.export(),
    },
  });
});

router.get('/:address', (req, res) => {
  const wallet = getWallet(req.params.address);
  if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found' });
  return res.json({ success: true, data: serializeWallet(wallet) });
});

router.get('/:address/export', (req, res) => {
  const wallet = getWallet(req.params.address);
  if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found' });
  return res.json({ success: true, data: wallet.export() });
});

router.post('/:address/contacts', (req, res) => {
  const wallet = getWallet(req.params.address);
  if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found' });

  const { name, contactAddress } = req.body;
  wallet.addContact(name, contactAddress);
  return res.status(201).json({ success: true, data: wallet.info() });
});

router.get('/:address/history', (req, res) => {
  const wallet = getWallet(req.params.address);
  if (!wallet) return res.status(404).json({ success: false, message: 'Wallet not found' });
  return res.json({ success: true, data: chain.getHistory(wallet.address) });
});

router.post('/hd', (req, res) => {
  const { seedHex = null } = req.body;
  const hd = createHdWallet(seedHex);
  res.status(201).json({
    success: true,
    data: {
      seedHex: hd.seedHex,
      children: [],
    },
  });
});

router.post('/hd/:seedHex/derive', (req, res) => {
  const { path = 'm/0/0', label = null } = req.body;
  const child = deriveHdChild(req.params.seedHex, path, label);
  res.status(201).json({
    success: true,
    data: {
      ...serializeWallet(child),
      derivationPath: child._derivationPath,
      derivedSeed: child._derivedSeed,
      export: child.export(),
    },
  });
});

router.post('/multisig', (req, res) => {
  const { signerAddresses, required } = req.body;
  const wallet = createMultiSigWallet(signerAddresses, required);
  res.status(201).json({
    success: true,
    data: {
      ...wallet.info(),
      balance: chain.getBalance(wallet.address),
    },
  });
});

router.get('/multisig/:address', (req, res) => {
  const wallet = multiSigWallets.get(req.params.address);
  if (!wallet) return res.status(404).json({ success: false, message: 'MultiSig wallet not found' });
  return res.json({
    success: true,
    data: {
      ...wallet.info(),
      balance: chain.getBalance(wallet.address),
    },
  });
});

export default router;
