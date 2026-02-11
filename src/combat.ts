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
 * One-enemy mode (1v1): collect, upgrade to level 3, then spend everything on armor.
 * After an upgrade, spend any leftover resources on armor.
 */
function oneEnemyActions(request: CombatRequest): CombatAction[] {
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
 * Save-for-kill strategy when 2+ enemies:
 * 1. Collect: if we can't kill any enemy, return [] (save resources).
 * 2. Kill: if we can kill at least one, attack the cheapest-to-kill target(s).
 */
export function computeCombatActions(request: CombatRequest): CombatAction[] {
  const actions: CombatAction[] = [];
  const { playerTower, enemyTowers } = request;
  let resources = playerTower.resources ?? 0;

  const living = enemyTowers.filter((t) => t.hp > 0);
  if (living.length === 0) {
    return [];
  }

  if (living.length === 1) {
    return oneEnemyActions(request);
  }

  const minCostToKill = Math.min(...living.map(costToKill));
  if (resources < minCostToKill) {
    return [];
  }

  // Kill phase: attack cheapest-to-kill targets until we can't afford another kill
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
