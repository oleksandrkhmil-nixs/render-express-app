/**
 * Kingdom Wars bot – request/response types and cost helpers.
 */

export interface Tower {
  playerId: number;
  hp: number;
  armor: number;
  resources?: number;
  level: number;
}

export interface CombatActionAttack {
  playerId: number;
  action: { targetId: number; troopCount: number };
}

export interface NegotiateRequest {
  gameId: number;
  turn: number;
  playerTower: Tower;
  enemyTowers: Tower[];
  combatActions: CombatActionAttack[];
}

export interface DiplomacyEntry {
  playerId: number;
  action: { allyId: number; attackTargetId?: number };
}

export interface CombatRequest {
  gameId: number;
  turn: number;
  playerTower: Tower;
  enemyTowers: Tower[];
  diplomacy: DiplomacyEntry[];
  previousAttacks: CombatActionAttack[];
}

export interface NegotiateResponseItem {
  allyId: number;
  attackTargetId?: number;
}

export type CombatAction =
  | { type: 'armor'; amount: number }
  | { type: 'attack'; targetId: number; troopCount: number }
  | { type: 'upgrade' };

/** Upgrade cost: 50 * (1.75 ^ (level - 1)). Level 1→2: 50, 2→3: 88, 3→4: 153, 4→5: 268, 5→6: 469 */
export function upgradeCost(level: number): number {
  return Math.floor(50 * Math.pow(1.75, level - 1));
}

/** Resources per turn: 20 * (1.5 ^ (level - 1)) */
export function resourcesPerTurn(level: number): number {
  return Math.floor(20 * Math.pow(1.5, level - 1));
}
