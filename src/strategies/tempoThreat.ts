import type { CombatAction, CombatRequest, NegotiateRequest, NegotiateResponseItem, Tower } from '../types';
import { upgradeCost } from '../types';
import type { Strategy } from './types';

const LEVEL_STRENGTH_CAP = 3;
const UPGRADE_TARGET_LEVEL = 3;
const EARLY_UPGRADE_TURN_LIMIT = 20;
const LATE_GAME_TURN = 20;

function cappedLevel(level: number): number {
  return Math.min(level, LEVEL_STRENGTH_CAP);
}

function durability(tower: Tower): number {
  return tower.hp + tower.armor;
}

function compareStrength(a: Tower, b: Tower): number {
  const levelDiff = cappedLevel(a.level) - cappedLevel(b.level);
  if (levelDiff !== 0) {
    return levelDiff;
  }
  return durability(a) - durability(b);
}

function estimateIncomingDamage(request: CombatRequest): number {
  const myId = request.playerTower.playerId;
  const recentIncoming = request.previousAttacks
    .filter((attack) => attack.action.targetId === myId)
    .reduce((sum, attack) => sum + Math.max(0, Math.floor(attack.action.troopCount)), 0);

  const diplomacyPressure = request.diplomacy.filter((d) => d.action.attackTargetId === myId).length * 6;
  const riskBuffer = request.turn >= LATE_GAME_TURN ? 12 : 6;

  return recentIncoming + diplomacyPressure + riskBuffer;
}

function chooseLeader(enemies: Tower[]): Tower | undefined {
  return [...enemies].sort((a, b) => compareStrength(b, a))[0];
}

function chooseNonLeaderAlly(enemies: Tower[], leaderId: number): Tower | undefined {
  return enemies
    .filter((enemy) => enemy.playerId !== leaderId)
    .sort((a, b) => compareStrength(b, a))[0];
}

function chooseBestKill(enemies: Tower[], budget: number): Tower | undefined {
  return enemies
    .filter((enemy) => enemy.hp > 0 && enemy.hp + enemy.armor <= budget)
    .sort((a, b) => compareStrength(b, a))[0];
}

function choosePressureTarget(enemies: Tower[], excludedTargetIds: Set<number>): Tower | undefined {
  return enemies
    .filter((enemy) => enemy.hp > 0 && !excludedTargetIds.has(enemy.playerId))
    .sort((a, b) => compareStrength(b, a))[0];
}

function tempoThreatNegotiate(request: NegotiateRequest): NegotiateResponseItem[] {
  const liveEnemies = request.enemyTowers.filter((enemy) => enemy.hp > 0);
  if (liveEnemies.length < 2) {
    return [];
  }

  const leader = chooseLeader(liveEnemies);
  if (!leader) {
    return [];
  }

  const ally = chooseNonLeaderAlly(liveEnemies, leader.playerId);
  if (!ally) {
    return [];
  }

  return [{ allyId: ally.playerId, attackTargetId: leader.playerId }];
}

function tempoThreatCombat(request: CombatRequest): CombatAction[] {
  const actions: CombatAction[] = [];
  const attackedTargetIds = new Set<number>();
  const liveEnemies = request.enemyTowers.filter((enemy) => enemy.hp > 0);
  const player = request.playerTower;
  const level = player.level;
  let resources = Math.max(0, Math.floor(player.resources ?? 0));

  if (resources <= 0 || liveEnemies.length === 0) {
    return [];
  }

  const expectedIncoming = estimateIncomingDamage(request);
  const neededArmor = Math.max(0, expectedIncoming - player.armor);
  const upgradePrice = upgradeCost(level);
  const canStillUpgradeThisTurn =
    request.turn <= EARLY_UPGRADE_TURN_LIMIT && level < UPGRADE_TARGET_LEVEL && resources >= upgradePrice;
  const lowThreatForFastUpgrade = neededArmor <= 8;
  let didUpgrade = false;

  // 1) Prefer immediate growth on low-threat turns.
  if (canStillUpgradeThisTurn && lowThreatForFastUpgrade) {
    actions.push({ type: 'upgrade' });
    resources -= upgradePrice;
    didUpgrade = true;
  }

  // 2) Survive: reserve upgrade cost first unless this is an emergency threat turn.
  let armorBudget = resources;
  if (!didUpgrade && canStillUpgradeThisTurn) {
    const reservedForUpgrade = upgradePrice;
    const budgetIfReserved = Math.max(0, resources - reservedForUpgrade);
    const emergencyThreat = neededArmor > budgetIfReserved + 20;
    armorBudget = emergencyThreat ? resources : budgetIfReserved;
  }

  const armorToBuy = Math.min(armorBudget, Math.floor(neededArmor));
  if (armorToBuy > 0) {
    actions.push({ type: 'armor', amount: armorToBuy });
    resources -= armorToBuy;
  }

  // 3) Second chance to upgrade before attacking.
  const shouldUpgradeNow = !didUpgrade && canStillUpgradeThisTurn && resources >= upgradePrice;
  if (shouldUpgradeNow) {
    actions.push({ type: 'upgrade' });
    resources -= upgradePrice;
    didUpgrade = true;
  }

  // 4) If we can finish anyone safely, take the elimination immediately.
  const killTarget = chooseBestKill(liveEnemies, resources);
  if (killTarget) {
    const killTroops = Math.min(resources, killTarget.hp + killTarget.armor);
    if (killTroops > 0) {
      actions.push({ type: 'attack', targetId: killTarget.playerId, troopCount: killTroops });
      attackedTargetIds.add(killTarget.playerId);
      resources -= killTroops;
    }
  }

  // 5) Use remaining resources to pressure the strongest available target.
  if (resources > 0) {
    const pressureTarget = choosePressureTarget(liveEnemies, attackedTargetIds);
    if (pressureTarget) {
      actions.push({ type: 'attack', targetId: pressureTarget.playerId, troopCount: resources });
    }
  }

  return actions;
}

export const tempoThreatStrategy: Strategy = {
  negotiate: tempoThreatNegotiate,
  combat: tempoThreatCombat
};
