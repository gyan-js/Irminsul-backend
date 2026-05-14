import { Router } from 'express';
import { chain,   saveState
 } from '../state/appState.js';

const router = Router();

router.post('/mine', (req, res) => {
  const { minerAddress } = req.body;


  console.log('[BEFORE MINE] totalMinted:', chain.totalMinted, '| height:', chain.height);
  const block = chain.mineBlock(minerAddress);
  console.log('[AFTER MINE] totalMinted:', chain.totalMinted, '| height:', chain.height);
  saveState();
  res.status(201).json({
    success: true,
    data: {
      block: block.toJSON(),
      stats: chain.stats(),
    },
  });
});

export default router;
