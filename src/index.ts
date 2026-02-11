import express, { Request, Response } from 'express';
import cors from 'cors';
import type { NegotiateRequest, CombatRequest, NegotiateResponseItem } from './types';
import { computeCombatActions } from './combat';
import { findStrongestEnemy, findWeakestEnemy, getAliveTowers } from './types';

const app = express();
const PORT: number = process.env.PORT ? parseInt(process.env.PORT) : 8000;

const BOT_NAME = process.env.BOT_NAME ?? 'Kingdom Wars Bot';
const BOT_VERSION = '1.0';

app.use(express.json());
app.use(cors());

/** Log every request with [KW-BOT] prefix for the log collector. */
app.use((req: Request, _res: Response, next: () => void) => {
  console.log(`[KW-BOT] ${req.method} ${req.path}`);
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
    strategy: 'AI-trapped-strategy',
    version: BOT_VERSION
  });
});

/**
 * Negotiation Strategy ("The Iron Bank" Diplomacy):
 * 1. Ally with the STRONGEST enemy (suck up to the bully to deflect aggression)
 * 2. Suggest attacking the WEAKEST enemy (coordinate the lobby against them)
 */
app.post('/negotiate', (req: Request, res: Response) => {
  try {
    const body = req.body as NegotiateRequest;
    if (!body || typeof body.gameId !== 'number' || !body.playerTower || !Array.isArray(body.enemyTowers)) {
      res.json([]);
      return;
    }

    const aliveTowers = getAliveTowers(body.enemyTowers);
    if (aliveTowers.length === 0) {
      res.json([]);
      return;
    }

    const diplomacy: NegotiateResponseItem[] = [];

    // Find the strongest enemy to ally with (Non-Aggression Pact)
    const strongest = findStrongestEnemy(aliveTowers);
    
    // Find the weakest enemy to suggest as a target
    const weakest = findWeakestEnemy(aliveTowers);

    if (strongest) {
      const diplomacyMessage: NegotiateResponseItem = {
        allyId: strongest.playerId
      };

      // If there's a different weak target, suggest attacking them
      if (weakest && weakest.playerId !== strongest.playerId) {
        diplomacyMessage.attackTargetId = weakest.playerId;
      }

      diplomacy.push(diplomacyMessage);
    }

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
    const actions = computeCombatActions(body);
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
