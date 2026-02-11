import type { CombatAction, CombatRequest, NegotiateRequest, NegotiateResponseItem, Tower } from '../types';
import { upgradeCost } from '../types';
import type { Strategy } from './types';

const LEVEL_CAP_FOR_STRENGTH = 3;

function cappedLevel(level: number): number {
  return Math.min(level, LEVEL_CAP_FOR_STRENGTH);
}

function durability(tower: Tower): number {
  return tower.hp + tower.armor;
}

function compareStrength(a: Tower, b: Tower): number {
  const levelDiff = cappedLevel(a.level) - cappedLevel(b.level);
  if (levelDiff !== 0) {
    return levelDiff;
  }

  const durabilityDiff = durability(a) - durability(b);
  if (durabilityDiff !== 0) {
    return durabilityDiff;
  }

  return 0;
}

function isStrongest(player: Tower, enemies: Tower[]): boolean {
  return enemies.every((enemy) => compareStrength(player, enemy) > 0);
}

function chooseWeakestEnemy(enemies: Tower[]): Tower | undefined {
  return [...enemies].sort((a, b) => {
    const strengthDiff = compareStrength(a, b);
    if (strengthDiff !== 0) {
      return strengthDiff;
    }
    return a.playerId - b.playerId;
  })[0];
}

function cappedBuffNegotiate(_request: NegotiateRequest): NegotiateResponseItem[] {
  return [];
}

function cappedBuffCombat(request: CombatRequest): CombatAction[] {
  const resources = Math.max(0, Math.floor(request.playerTower.resources ?? 0));
  if (resources <= 0) {
    return [];
  }

  const liveEnemies = request.enemyTowers.filter((enemy) => enemy.hp > 0);
  if (liveEnemies.length === 0) {
    return [];
  }

  if (isStrongest(request.playerTower, liveEnemies)) {
    const weakestEnemy = chooseWeakestEnemy(liveEnemies);
    if (!weakestEnemy) {
      return [];
    }
    return [{ type: 'attack', targetId: weakestEnemy.playerId, troopCount: resources }];
  }

  if (request.playerTower.level < LEVEL_CAP_FOR_STRENGTH) {
    const cost = upgradeCost(request.playerTower.level);
    if (resources >= cost) {
      return [{ type: 'upgrade' }];
    }
    return [];
  }

  return [{ type: 'armor', amount: resources }];
}

export const cappedBuffStrategy: Strategy = {
  negotiate: cappedBuffNegotiate,
  combat: cappedBuffCombat
};
