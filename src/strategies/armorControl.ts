import type { CombatAction, CombatRequest, NegotiateRequest, NegotiateResponseItem, Tower } from '../types';
import { upgradeCost } from '../types';
import type { Strategy } from './types';

function chooseStrongestEnemy(enemies: Tower[]): Tower | undefined {
  return [...enemies].sort((a, b) => {
    if (a.level !== b.level) {
      return b.level - a.level;
    }
    const aDurability = a.hp + a.armor;
    const bDurability = b.hp + b.armor;
    if (aDurability !== bDurability) {
      return bDurability - aDurability;
    }
    return a.playerId - b.playerId;
  })[0];
}

function chooseLastAttacker(request: CombatRequest): Tower | undefined {
  const myId = request.playerTower.playerId;
  const incoming = request.previousAttacks.filter((attack) => attack.action.targetId === myId);
  if (incoming.length === 0) {
    return undefined;
  }

  const lastAttack = incoming[incoming.length - 1];
  return request.enemyTowers.find((enemy) => enemy.playerId === lastAttack.playerId && enemy.hp > 0);
}

function armorControlNegotiate(_request: NegotiateRequest): NegotiateResponseItem[] {
  return [];
}

function armorControlCombat(request: CombatRequest): CombatAction[] {
  const resources = Math.max(0, Math.floor(request.playerTower.resources ?? 0));
  if (resources <= 0) {
    return [];
  }

  const liveEnemies = request.enemyTowers.filter((enemy) => enemy.hp > 0);
  if (liveEnemies.length === 0) {
    return [];
  }

  const myArmor = request.playerTower.armor;
  const maxEnemyArmor = Math.max(...liveEnemies.map((enemy) => enemy.armor));
  const hasMostArmor = myArmor >= maxEnemyArmor;

  // Rule 1: if anyone has more armor than us, invest in armor.
  if (!hasMostArmor) {
    const targetArmor = maxEnemyArmor + 5;
    const armorNeeded = Math.max(0, targetArmor - myArmor);
    const armorAmount = Math.min(resources, armorNeeded);
    if (armorAmount > 0) {
      return [{ type: 'armor', amount: armorAmount }];
    }
    return [];
  }

  // Rule 2: if we have most armor and we're under level 3, push levels.
  if (request.playerTower.level < 3) {
    const cost = upgradeCost(request.playerTower.level);
    if (resources >= cost) {
      return [{ type: 'upgrade' }];
    }
    return [];
  }

  // Rule 3: at level 3+ with most armor, attack last attacker, else strongest.
  const target = chooseLastAttacker(request) ?? chooseStrongestEnemy(liveEnemies);
  if (!target) {
    return [];
  }

  return [{ type: 'attack', targetId: target.playerId, troopCount: resources }];
}

export const armorControlStrategy: Strategy = {
  negotiate: armorControlNegotiate,
  combat: armorControlCombat
};
