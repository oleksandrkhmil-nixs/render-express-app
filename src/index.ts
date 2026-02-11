import express, { Request, Response } from 'express';
import cors from 'cors';
import type { NegotiateRequest, CombatRequest } from './types';
import { getStrategy } from './strategies';
import type { StrategyName } from './strategies/types';

const app = express();
const PORT: number = process.env.PORT ? parseInt(process.env.PORT) : 8000;

const BOT_NAME = process.env.BOT_NAME ?? 'Kingdom Wars Bot';
const BOT_VERSION = '1.0';
const ACTIVE_STRATEGY: StrategyName = 'armor-control';
const strategy = getStrategy(ACTIVE_STRATEGY);

app.use(express.json());
app.use(cors());

/** Log every request with [KW-BOT] prefix for the log collector. */
app.use((req: Request, _res: Response, next: () => void) => {
  console.log(`[KW-BOT] [strategy=${ACTIVE_STRATEGY}] ${req.method} ${req.path}`);
  next();
});

app.get('/', (_req: Request, res: Response) => {
  res.send('if err != nil rulez');
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.json({ status: 'OK' });
});

app.get('/info', (_req: Request, res: Response) => {
  res.json({
    name: BOT_NAME,
    strategy: ACTIVE_STRATEGY,
    version: BOT_VERSION
  });
});

app.post('/negotiate', (req: Request, res: Response) => {
  try {
    const body = req.body as NegotiateRequest;
    if (!body || typeof body.gameId !== 'number' || !body.playerTower || !Array.isArray(body.enemyTowers)) {
      res.json([]);
      return;
    }
    const diplomacy = strategy.negotiate(body);
    res.json(diplomacy);
  } catch {
    res.json([]);
  }
});

app.post('/combat', (req: Request, res: Response) => {
  try {
    const body = req.body as CombatRequest;
    if (!body || typeof body.gameId !== 'number' || !body.playerTower || !Array.isArray(body.enemyTowers)) {
      res.json([]);
      return;
    }
    const actions = strategy.combat(body);
    res.json(actions);
  } catch {
    res.json([]);
  }
});

// Global error handler (catches errors but doesn't prevent crash from throw)
app.use((err: Error, req: Request, res: Response, _next: () => void) => {
  console.error('❌ Global error handler caught:', err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
