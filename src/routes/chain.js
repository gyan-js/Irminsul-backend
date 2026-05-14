import { Router } from 'express';
import { chain,   saveState } from '../state/appState.js';

const router = Router();

router.get('/stats', (req, res) => {
  res.json({ success: true, data: chain.stats() });
});

router.get('/validate', (req, res) => {
  res.json({ success: true, data: chain.isChainValid() });
});

router.get('/mempool', (req, res) => {
  res.json({
    success: true,
    data: {
      size: chain.mempool.length,
      transactions: chain.mempool.map((tx) => tx.toJSON()),
    },
  });
});

router.get('/blocks', (req, res) => {
  res.json({
    success: true,
    data: chain.chain.map((block) => block.toJSON()),
  });
});

router.get('/blocks/:index', (req, res) => {
  const index = Number(req.params.index);
  const block = chain.chain.find((item) => item.index === index);
  if (!block) return res.status(404).json({ success: false, message: 'Block not found' });
  return res.json({ success: true, data: block.toJSON() });
});

router.get('/blocks/hash/:hash', (req, res) => {
  const block = chain.chain.find((item) => item.hash === req.params.hash);
  if (!block) return res.status(404).json({ success: false, message: 'Block not found' });
  return res.json({ success: true, data: block.toJSON() });
});

router.get('/addresses/:address/balance', (req, res) => {
  const { address } = req.params;
  res.json({
    success: true,
    data: {
      address,
      balance: chain.getBalance(address),
      pendingSpend: chain.getPendingSpend(address),
      availableBalance: chain.getBalance(address) - chain.getPendingSpend(address),
    },
  });
});

router.get('/addresses/:address/history', (req, res) => {
  const { address } = req.params;
  res.json({ success: true, data: chain.getHistory(address) });
});

export default router;
