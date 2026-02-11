import type { CombatRequest, CombatAction, Tower } from './types';
import { upgradeCost } from './types';

const TARGET_LEVEL = 3;

/**
 * Resources needed to kill a tower (armor first, then HP).
 */
function costToKill(tower: Tower): number {
  return tower.armor + tower.hp;
}

/**
 * Two-enemies mode: collect, upgrade to level 3, then spend everything on armor.
 * After an upgrade, spend any leftover resources on armor.
 */
function twoEnemiesEconomyActions(request: CombatRequest): CombatAction[] {
  const actions: CombatAction[] = [];
  const { playerTower } = request;
  let resources = playerTower.resources ?? 0;
  const level = playerTower.level;

  if (level >= TARGET_LEVEL) {
    if (resources > 0) {
      actions.push({ type: 'armor', amount: resources });
    }
    return actions;
  }

  const cost = upgradeCost(level);
  if (resources < cost) {
    return [];
  }

  actions.push({ type: 'upgrade' });
  resources -= cost;
  if (resources > 0) {
    actions.push({ type: 'armor', amount: resources });
  }
  return actions;
}

/**
 * One-enemy mode: spend everything on attacking the last living target.
 */
function oneEnemyActions(request: CombatRequest, living: Tower[]): CombatAction[] {
  const resources = request.playerTower.resources ?? 0;
  if (resources <= 0 || living.length === 0) {
    return [];
  }
  const target = living[0];
  return [{ type: 'attack', targetId: target.playerId, troopCount: resources }];
}

/**
 * Save-for-kill: wait until enough resources to kill someone, then attack cheapest-to-kill target(s).
 * Used for 3+ enemies.
 */
function threeEnemiesActions(request: CombatRequest, living: Tower[]): CombatAction[] {
  const actions: CombatAction[] = [];
  let resources = request.playerTower.resources ?? 0;

  const minCostToKill = Math.min(...living.map(costToKill));
  if (resources < minCostToKill) {
    return [];
  }

  const remaining = living.slice();
  while (remaining.length > 0 && resources > 0) {
    remaining.sort((a, b) => costToKill(a) - costToKill(b));
    const target = remaining[0];
    const cost = costToKill(target);
    if (resources < cost) break;
    actions.push({
      type: 'attack',
      targetId: target.playerId,
      troopCount: cost
    });
    resources -= cost;
    remaining.shift();
  }

  return actions;
}

/**
 * Strategy by number of living enemies:
 * - 1 enemy: spend everything on attacking the last living target.
 * - 2 enemies: economy mode (upgrade to level 3, then armor; armor after upgrade if leftover).
 * - 3+ enemies: save until we can kill, then attack cheapest-to-kill target(s).
 */
export function computeCombatActions(request: CombatRequest): CombatAction[] {
  const { enemyTowers } = request;
  const living = enemyTowers.filter((t) => t.hp > 0);

  if (living.length === 0) {
    return [];
  }

  if (living.length === 2) {
    return twoEnemiesEconomyActions(request);
  }

  return threeEnemiesActions(request, living);
}
