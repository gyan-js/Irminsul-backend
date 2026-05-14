import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import chainRoutes from './src/routes/chain.js';
import walletRoutes from './src/routes/wallets.js';
import transactionRoutes from './src/routes/transactions.js';
import miningRoutes from './src/routes/mining.js';
import { errorHandler, notFoundHandler } from './src/middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
import { loadState } from './src/state/appState.js'
loadState(); // ← before routes are registered
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Irminchain API is running',
    routes: {
      chain: '/api/chain',
      wallets: '/api/wallets',
      transactions: '/api/transactions',
      mining: '/api/mining',
    },
  });
});

app.use('/api/chain', chainRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/mining', miningRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Irminsul API started`);
});
