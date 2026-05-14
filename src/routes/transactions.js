import { Router } from 'express';
import { Transaction } from '../core/block.js';
import {
  createSignedTransaction,
  createMultiSigTransaction,
  submitTransaction,
  verifyTransactionSignature,
} from '../state/appState.js';

const router = Router();

router.post('/build', (req, res) => {
  const tx = createSignedTransaction(req.body);
  res.status(201).json({ success: true, data: tx.toJSON() });
});

router.post('/build-multisig', (req, res) => {
  const tx = createMultiSigTransaction(req.body);
  res.status(201).json({ success: true, data: tx.toJSON() });
});

router.post('/submit', (req, res) => {
  const payload = req.body.data ?? req.body;
  const tx = new Transaction(payload);
  tx.id = payload.id;
  tx.timestamp = payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now();
  tx.signature = payload.signature;

  const accepted = submitTransaction(tx);
  res.status(201).json({ success: true, data: accepted.toJSON() });
});

router.post('/verify', (req, res) => {
  const payload = req.body.data ?? req.body;
  const tx = new Transaction(payload);
  tx.id = payload.id;
  tx.timestamp = payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now();
  tx.signature = payload.signature;

  res.json({
    success: true,
    data: {
      valid: verifyTransactionSignature(tx),
    },
  });
});

export default router;
