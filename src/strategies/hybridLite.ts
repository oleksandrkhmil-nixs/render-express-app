import type {
  CombatAction,
  CombatRequest,
  NegotiateRequest,
  NegotiateResponseItem,
  Tower
} from '../types';
import { upgradeCost } from '../types';
import type { Strategy } from './types';

const MAX_LEVEL = 6;
const EARLY_GAME_LAST_TURN = 10;

function towerStrength(tower: Tower): number {
  return tower.level * 1000 + (tower.hp + tower.armor) * 10;
}

function chooseLeader(enemies: Tower[]): Tower | undefined {
  return [...enemies].sort((a, b) => towerStrength(b) - towerStrength(a))[0];
}

function chooseAlly(enemies: Tower[], leaderId: number): Tower | undefined {
  return enemies.filter((e) => e.playerId !== leaderId).sort((a, b) => towerStrength(b) - towerStrength(a))[0];
}

function hybridNegotiate(request: NegotiateRequest): NegotiateResponseItem[] {
  const liveEnemies = request.enemyTowers.filter((tower) => tower.hp > 0);
  if (liveEnemies.length === 0) {
    return [];
  }

  if (liveEnemies.length === 1) {
    return [{ allyId: liveEnemies[0].playerId }];
  }

  const leader = chooseLeader(liveEnemies);
  if (!leader) {
    return [];
  }

  const ally = chooseAlly(liveEnemies, leader.playerId);
  if (!ally) {
    return [];
  }

  return [{ allyId: ally.playerId, attackTargetId: leader.playerId }];
}

function estimateIncomingDamage(request: CombatRequest): number {
  const myId = request.playerTower.playerId;
  const recentIncoming = request.previousAttacks
    .filter((attack) => attack.action.targetId === myId)
    .reduce((sum, attack) => sum + Math.max(0, Math.floor(attack.action.troopCount)), 0);

  const diplomacyThreat = request.diplomacy.filter((entry) => entry.action.attackTargetId === myId).length * 8;
  const baseRiskBuffer = request.turn <= EARLY_GAME_LAST_TURN ? 6 : 10;

  return recentIncoming + diplomacyThreat + baseRiskBuffer;
}

function chooseKillTarget(enemies: Tower[], budget: number): Tower | undefined {
  return enemies
    .filter((enemy) => enemy.hp > 0 && enemy.hp + enemy.armor <= budget)
    .sort((a, b) => {
      if (a.level !== b.level) {
        return b.level - a.level;
      }
      return a.hp + a.armor - (b.hp + b.armor);
    })[0];
}

function choosePressureTarget(request: CombatRequest, attackedTargetIds: Set<number>): Tower | undefined {
  const myId = request.playerTower.playerId;
  const attackers = new Set(
    request.previousAttacks
      .filter((attack) => attack.action.targetId === myId)
      .map((attack) => attack.playerId)
  );

  return request.enemyTowers
    .filter((enemy) => enemy.hp > 0 && !attackedTargetIds.has(enemy.playerId))
    .sort((a, b) => {
      if (a.level !== b.level) {
        return b.level - a.level;
      }
      const aAttackedUs = attackers.has(a.playerId) ? 1 : 0;
      const bAttackedUs = attackers.has(b.playerId) ? 1 : 0;
      if (aAttackedUs !== bAttackedUs) {
        return bAttackedUs - aAttackedUs;
      }
      return a.hp + a.armor - (b.hp + b.armor);
    })[0];
}

function isValidPlan(actions: CombatAction[], resources: number, level: number): boolean {
  let armorCount = 0;
  let upgradeCount = 0;
  let spent = 0;
  const targets = new Set<number>();

  for (const action of actions) {
    if (action.type === 'armor') {
      armorCount += 1;
      const amount = Math.floor(action.amount);
      if (amount <= 0) {
        return false;
      }
      spent += amount;
      continue;
    }

    if (action.type === 'upgrade') {
      upgradeCount += 1;
      spent += upgradeCost(level);
      continue;
    }

    const troops = Math.floor(action.troopCount);
    if (troops <= 0) {
      return false;
    }
    if (targets.has(action.targetId)) {
      return false;
    }
    targets.add(action.targetId);
    spent += troops;
  }

  if (armorCount > 1 || upgradeCount > 1) {
    return false;
  }
  if (level >= MAX_LEVEL && upgradeCount > 0) {
    return false;
  }
  return spent <= resources;
}

function hybridCombat(request: CombatRequest): CombatAction[] {
  const actions: CombatAction[] = [];
  const attackedTargetIds = new Set<number>();
  const liveEnemies = request.enemyTowers.filter((enemy) => enemy.hp > 0);
  const level = request.playerTower.level;
  let resources = Math.max(0, Math.floor(request.playerTower.resources ?? 0));

  if (resources <= 0 || liveEnemies.length === 0) {
    return [];
  }

  // DEFEND: absorb likely incoming damage first.
  const expectedIncoming = estimateIncomingDamage(request);
  const needArmor = Math.max(0, expectedIncoming - request.playerTower.armor);
  const armorAmount = Math.min(resources, Math.max(0, Math.floor(needArmor)));
  if (armorAmount > 0) {
    actions.push({ type: 'armor', amount: armorAmount });
    resources -= armorAmount;
  }

  // BURST: if we can finish an enemy, do it immediately.
  const killTarget = chooseKillTarget(liveEnemies, resources);
  if (killTarget) {
    const troops = Math.min(resources, killTarget.hp + killTarget.armor);
    if (troops > 0) {
      actions.push({ type: 'attack', targetId: killTarget.playerId, troopCount: troops });
      attackedTargetIds.add(killTarget.playerId);
      resources -= troops;
    }
  }

  // ECO: upgrade early if resources allow after defense/burst.
  const canUpgradeEarly = request.turn <= EARLY_GAME_LAST_TURN && level < 3 && level < MAX_LEVEL;
  const upgradePrice = upgradeCost(level);
  if (canUpgradeEarly && resources >= upgradePrice) {
    actions.push({ type: 'upgrade' });
    resources -= upgradePrice;
  }

  // PRESSURE: spend remaining resources pressuring the strongest viable enemy.
  if (resources > 0) {
    const target = choosePressureTarget(request, attackedTargetIds);
    if (target) {
      actions.push({ type: 'attack', targetId: target.playerId, troopCount: resources });
      attackedTargetIds.add(target.playerId);
      resources = 0;
    }
  }

  return isValidPlan(actions, Math.max(0, Math.floor(request.playerTower.resources ?? 0)), level) ? actions : [];
}

export const hybridLiteStrategy: Strategy = {
  negotiate: hybridNegotiate,
  combat: hybridCombat
};
