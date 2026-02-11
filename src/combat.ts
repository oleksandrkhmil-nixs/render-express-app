import type { CombatRequest, CombatAction, Tower } from './types';
import {
  upgradeCost,
  killCost,
  effectiveHealth,
  findWeakestEnemy,
  findTopAggressor,
  getAliveTowers,
  canKill,
  OPTIMAL_LEVEL_CAP,
  MAX_LEVEL_IF_RICH,
  UPGRADE_CUTOFF_TURN,
  HP_SAFETY_THRESHOLD,
  ARMOR_PER_LEVEL,
  ENDGAME_ARMOR_RATIO,
} from './types';

/**
 * "The Iron Bank" Combat Strategy
 * 
 * Phase 1 (Turns 1-8): Rush to Level 3
 * Phase 2 (Turns 9-20): Fortress mode - maintain armor, retaliate against aggressors
 * Phase 3 (Turn 21+): Endgame - armor dump, execute kill shots
 */
export function computeCombatActions(request: CombatRequest): CombatAction[] {
  const actions: CombatAction[] = [];
  const { playerTower, enemyTowers, previousAttacks, turn } = request;
  let resources = playerTower.resources ?? 0;
  const level = playerTower.level;
  const hp = playerTower.hp;
  const armor = playerTower.armor;
  const myId = playerTower.playerId;

  const aliveTowers = getAliveTowers(enemyTowers);
  if (aliveTowers.length === 0) {
    // We won! No actions needed
    return [];
  }

  // ============ PRIORITY 1: KILL SHOT ============
  // If we can eliminate any player, do it immediately
  const killTarget = findKillableTarget(aliveTowers, resources);
  if (killTarget) {
    const cost = killCost(killTarget);
    actions.push({ type: 'attack', targetId: killTarget.playerId, troopCount: cost });
    resources -= cost;
    // Continue with remaining resources for defense
  }

  // ============ PRIORITY 2: RETALIATION (Tit-for-Tat) ============
  // If someone attacked us, retaliate to establish deterrence
  const aggressor = findTopAggressor(previousAttacks, myId);
  if (aggressor && aggressor.damage > 0 && !killTarget) {
    const aggressorTower = aliveTowers.find(t => t.playerId === aggressor.playerId);
    if (aggressorTower) {
      // Retaliate with proportional force (match their aggression)
      const retaliationAmount = Math.min(resources, aggressor.damage);
      if (retaliationAmount > 0) {
        actions.push({ type: 'attack', targetId: aggressor.playerId, troopCount: retaliationAmount });
        resources -= retaliationAmount;
      }
    }
  }

  // ============ PHASE 3: ENDGAME (Turn 21+) ============
  if (turn >= 21) {
    return executeEndgameStrategy(actions, resources, armor, aliveTowers);
  }

  // ============ PHASE 1 & 2: BUILD UP AND FORTRESS ============
  
  // Determine target armor level (Porcupine threshold)
  const targetArmor = level * ARMOR_PER_LEVEL;
  
  // Check if we should prioritize defense (low HP)
  const needsDefense = hp < HP_SAFETY_THRESHOLD || armor < targetArmor;
  
  // Determine if we should upgrade
  const canAffordUpgrade = resources >= upgradeCost(level);
  const shouldUpgrade = getShouldUpgrade(turn, level, hp, armor, resources, targetArmor);

  if (shouldUpgrade && canAffordUpgrade) {
    // ============ UPGRADE PATH ============
    // First ensure minimum armor
    const minArmorBeforeUpgrade = Math.max(0, targetArmor - armor);
    if (minArmorBeforeUpgrade > 0 && resources >= upgradeCost(level) + minArmorBeforeUpgrade) {
      const armorAmount = Math.min(minArmorBeforeUpgrade, resources - upgradeCost(level));
      if (armorAmount > 0 && !hasArmorAction(actions)) {
        actions.push({ type: 'armor', amount: armorAmount });
        resources -= armorAmount;
      }
    }
    
    // Then upgrade
    if (resources >= upgradeCost(level)) {
      actions.push({ type: 'upgrade' });
      resources -= upgradeCost(level);
    }
  } else if (needsDefense) {
    // ============ DEFENSE PATH ============
    const armorDeficit = Math.max(0, targetArmor - armor);
    const armorAmount = Math.min(resources, armorDeficit + 10); // Extra buffer
    if (armorAmount > 0 && !hasArmorAction(actions)) {
      actions.push({ type: 'armor', amount: armorAmount });
      resources -= armorAmount;
    }
  } else {
    // ============ SAVINGS PATH ============
    // Save for upgrade, but maintain minimum armor
    const armorDeficit = Math.max(0, targetArmor - armor);
    if (armorDeficit > 0 && !hasArmorAction(actions)) {
      const armorAmount = Math.min(resources, armorDeficit);
      if (armorAmount > 0) {
        actions.push({ type: 'armor', amount: armorAmount });
        resources -= armorAmount;
      }
    }
    
    // If we have excess resources and can afford upgrade now
    if (shouldUpgrade && resources >= upgradeCost(level)) {
      actions.push({ type: 'upgrade' });
      resources -= upgradeCost(level);
    }
  }

  // Spend leftover resources on armor (only if we haven't added armor yet)
  if (resources > 0 && !hasArmorAction(actions)) {
    actions.push({ type: 'armor', amount: resources });
  }

  return actions;
}

/**
 * Endgame strategy (Turn 21+): Armor dump + kill shots
 */
function executeEndgameStrategy(
  existingActions: CombatAction[],
  resources: number,
  currentArmor: number,
  aliveTowers: Tower[]
): CombatAction[] {
  const actions = [...existingActions];
  
  // Check for kill shot opportunity with remaining resources
  const killTarget = findKillableTarget(aliveTowers, resources);
  if (killTarget && !hasAttackOnTarget(actions, killTarget.playerId)) {
    const cost = killCost(killTarget);
    actions.push({ type: 'attack', targetId: killTarget.playerId, troopCount: cost });
    resources -= cost;
  }

  // Dump remaining resources into armor (80% ratio)
  // Only if we don't already have excessive armor (cap at 100)
  const maxArmorNeeded = Math.max(0, 100 - currentArmor);
  const armorDump = Math.min(Math.floor(resources * ENDGAME_ARMOR_RATIO), maxArmorNeeded);
  if (armorDump > 0 && !hasArmorAction(actions)) {
    actions.push({ type: 'armor', amount: armorDump });
  }

  return actions;
}

/**
 * Determine if we should upgrade this turn
 */
function getShouldUpgrade(
  turn: number,
  level: number,
  hp: number,
  armor: number,
  resources: number,
  targetArmor: number
): boolean {
  // Never upgrade after cutoff turn
  if (turn > UPGRADE_CUTOFF_TURN) return false;

  // Don't upgrade if HP is critical
  if (hp < 60) return false;

  // Determine level cap based on situation
  const isRichAndSafe = hp >= 90 && armor >= targetArmor && resources >= 200;
  const levelCap = isRichAndSafe ? MAX_LEVEL_IF_RICH : OPTIMAL_LEVEL_CAP;

  // Don't exceed level cap
  if (level >= levelCap) return false;

  // Phase 1 (Turns 1-8): Rush to Level 3
  if (turn <= 8) {
    // Prioritize upgrade if we have enough and aren't too vulnerable
    if (hp >= HP_SAFETY_THRESHOLD || armor >= 10) {
      return resources >= upgradeCost(level);
    }
    // If low HP, only upgrade if we can also afford some armor
    return resources >= upgradeCost(level) + 10;
  }

  // Phase 2 (Turns 9-20): Only upgrade if safe
  // Must have armor at porcupine threshold before upgrading
  if (armor < targetArmor) return false;

  return resources >= upgradeCost(level);
}

/**
 * Find a target we can kill outright
 */
function findKillableTarget(towers: Tower[], resources: number): Tower | null {
  const killable = towers.filter(t => canKill(resources, t));
  if (killable.length === 0) return null;
  
  // Prioritize weakest target (easiest kill)
  return killable.reduce((a, b) => killCost(a) < killCost(b) ? a : b);
}

/**
 * Check if we already have an armor action
 */
function hasArmorAction(actions: CombatAction[]): boolean {
  return actions.some(a => a.type === 'armor');
}

/**
 * Check if we already have an attack on a specific target
 */
function hasAttackOnTarget(actions: CombatAction[], targetId: number): boolean {
  return actions.some(a => a.type === 'attack' && a.targetId === targetId);
}
