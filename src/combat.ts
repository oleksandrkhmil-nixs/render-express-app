import type { CombatRequest, CombatAction } from './types';
import { upgradeCost } from './types';

const MAX_LEVEL = 6;

/**
 * Computes a valid list of combat actions for the current turn.
 * Respects: at most one armor, one upgrade, no duplicate targetId, total cost <= resources.
 */
export function computeCombatActions(request: CombatRequest): CombatAction[] {
  const actions: CombatAction[] = [];
  const { playerTower, enemyTowers } = request;
  let resources = playerTower.resources ?? 0;
  const level = playerTower.level;
  const enemyIds = enemyTowers.filter((t) => t.hp > 0).map((t) => t.playerId);

  // 1. Armor: at most one; if we have low armor and budget, add some
  const armorCost = 10;
  if (resources >= armorCost && playerTower.armor < 15) {
    const amount = Math.min(10, Math.floor(resources));
    if (amount > 0) {
      actions.push({ type: 'armor', amount });
      resources -= amount;
    }
  }

  // 2. Attack: pick one enemy (lowest HP or first), no duplicate targetId
  const attackBudget = Math.floor(resources);
  if (attackBudget >= 1 && enemyIds.length > 0) {
    const target = enemyTowers
      .filter((t) => t.hp > 0)
      .sort((a, b) => a.hp - b.hp)[0];
    if (target) {
      const troopCount = Math.min(attackBudget, 50);
      actions.push({ type: 'attack', targetId: target.playerId, troopCount });
      resources -= troopCount;
    }
  }

  // 3. Upgrade: at most one; level < 6 and can afford
  const cost = upgradeCost(level);
  if (level < MAX_LEVEL && resources >= cost) {
    actions.push({ type: 'upgrade' });
  }

  return actions;
}
