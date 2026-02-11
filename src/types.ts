/**
 * Kingdom Wars bot – request/response types and cost helpers.
 * Strategy: "The Iron Bank" - Peace through superior firepower.
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

// ============ STRATEGY CONSTANTS ============

/** Stop upgrading after this level (ROI diminishes) */
export const OPTIMAL_LEVEL_CAP = 3;

/** Absolute max level to consider if we're rich and untouched */
export const MAX_LEVEL_IF_RICH = 4;

/** Stop all upgrades after this turn (fatigue prep) */
export const UPGRADE_CUTOFF_TURN = 20;

/** Fatigue starts at turn 25 */
export const FATIGUE_START_TURN = 25;

/** Minimum HP before we prioritize defense over upgrades */
export const HP_SAFETY_THRESHOLD = 80;

/** Minimum armor threshold: level * this multiplier */
export const ARMOR_PER_LEVEL = 10;

/** Percentage of income to dump into armor during endgame */
export const ENDGAME_ARMOR_RATIO = 0.8;

// ============ COST HELPERS ============

/** Upgrade cost: 50 * (1.75 ^ (level - 1)). Level 1→2: 50, 2→3: 88, 3→4: 153, 4→5: 268, 5→6: 469 */
export function upgradeCost(level: number): number {
  return Math.floor(50 * Math.pow(1.75, level - 1));
}

/** Resources per turn: 20 * (1.5 ^ (level - 1)) */
export function resourcesPerTurn(level: number): number {
  return Math.floor(20 * Math.pow(1.5, level - 1));
}

/** Calculate the cost to kill an enemy (their HP + Armor) */
export function killCost(tower: Tower): number {
  return tower.hp + tower.armor;
}

/** Calculate effective health (HP + Armor) */
export function effectiveHealth(tower: Tower): number {
  return tower.hp + tower.armor;
}

/** Calculate tower "strength" for diplomacy (resources estimate + effective health + level bonus) */
export function towerStrength(tower: Tower): number {
  const resources = tower.resources ?? 0;
  return effectiveHealth(tower) + resources + tower.level * 20;
}

/** Get alive enemy towers */
export function getAliveTowers(towers: Tower[]): Tower[] {
  return towers.filter(t => t.hp > 0);
}

/** Find strongest enemy (highest strength score) */
export function findStrongestEnemy(towers: Tower[]): Tower | null {
  const alive = getAliveTowers(towers);
  if (alive.length === 0) return null;
  return alive.reduce((a, b) => towerStrength(a) > towerStrength(b) ? a : b);
}

/** Find weakest enemy (lowest effective health) */
export function findWeakestEnemy(towers: Tower[]): Tower | null {
  const alive = getAliveTowers(towers);
  if (alive.length === 0) return null;
  return alive.reduce((a, b) => effectiveHealth(a) < effectiveHealth(b) ? a : b);
}

/** Check if we can afford to kill an enemy outright */
export function canKill(resources: number, target: Tower): boolean {
  return resources >= killCost(target);
}

/** Calculate total damage received from previous attacks */
export function totalDamageReceived(attacks: CombatActionAttack[], myId: number): number {
  return attacks
    .filter(a => a.action.targetId === myId)
    .reduce((sum, a) => sum + a.action.troopCount, 0);
}

/** Find who attacked us the most */
export function findTopAggressor(attacks: CombatActionAttack[], myId: number): { playerId: number; damage: number } | null {
  const attacksOnMe = attacks.filter(a => a.action.targetId === myId);
  if (attacksOnMe.length === 0) return null;
  
  const damageByPlayer = new Map<number, number>();
  for (const attack of attacksOnMe) {
    const current = damageByPlayer.get(attack.playerId) ?? 0;
    damageByPlayer.set(attack.playerId, current + attack.action.troopCount);
  }
  
  let topAggressor: { playerId: number; damage: number } | null = null;
  for (const [playerId, damage] of damageByPlayer) {
    if (!topAggressor || damage > topAggressor.damage) {
      topAggressor = { playerId, damage };
    }
  }
  return topAggressor;
}
