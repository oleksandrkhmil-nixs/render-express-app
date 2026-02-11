import type { CombatRequest, CombatAction, Tower, CombatActionAttack } from './types';
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
  FATIGUE_START_TURN,
  totalDamageReceived,
} from './types';

/** Maximum armor worth building (aggressive defense) */
const MAX_USEFUL_ARMOR = 300;

/** Target armor per level (aggressive: 25 armor per level) */
const AGGRESSIVE_ARMOR_PER_LEVEL = 25;

/** Minimum armor to maintain at all times */
const MIN_ARMOR_FLOOR = 30;

/** Turn to start being aggressive to avoid fatigue draw */
const AGGRESSION_TURN = 20;

/** Retaliation multiplier - hit back harder than they hit you */
const RETALIATION_MULTIPLIER = 1.5;

/**
 * "Trust But Verify" Combat Strategy
 * 
 * KEY INSIGHT: Diplomacy is cheap talk - anyone can lie.
 * We IGNORE incoming diplomacy and only trust ACTIONS (previousAttacks).
 * 
 * Phase 1 (Turns 1-8): Rush to Level 3, build armor
 * Phase 2 (Turns 9-19): Fortress mode - retaliate against aggressors, ignore diplomacy
 * Phase 3 (Turn 20+): Aggression mode - attack to avoid fatigue draw
 */
export function computeCombatActions(request: CombatRequest): CombatAction[] {
  const actions: CombatAction[] = [];
  // NOTE: We intentionally IGNORE request.diplomacy - it's cheap talk and unreliable
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
  // Prioritize killing aggressors who attacked us
  const killTarget = findBestKillTarget(aliveTowers, resources, previousAttacks, myId);
  if (killTarget) {
    const cost = killCost(killTarget);
    actions.push({ type: 'attack', targetId: killTarget.playerId, troopCount: cost });
    resources -= cost;
    // Continue with remaining resources for defense
  }

  // ============ PRIORITY 2: RETALIATION (Tit-for-Tat with Escalation) ============
  // If someone attacked us, retaliate HARDER to establish deterrence
  // This is based on ACTIONS, not diplomacy promises
  const aggressor = findTopAggressor(previousAttacks, myId);
  if (aggressor && aggressor.damage > 0 && !killTarget) {
    const aggressorTower = aliveTowers.find(t => t.playerId === aggressor.playerId);
    if (aggressorTower && !hasAttackOnTarget(actions, aggressor.playerId)) {
      // Retaliate with ESCALATED force (1.5x their damage) to discourage future attacks
      const retaliationAmount = Math.min(
        resources, 
        Math.floor(aggressor.damage * RETALIATION_MULTIPLIER)
      );
      if (retaliationAmount > 0) {
        actions.push({ type: 'attack', targetId: aggressor.playerId, troopCount: retaliationAmount });
        resources -= retaliationAmount;
      }
    }
  }

  // ============ PHASE 3: ENDGAME / AGGRESSION MODE (Turn 20+) ============
  if (turn >= AGGRESSION_TURN) {
    return executeEndgameStrategy(actions, resources, armor, aliveTowers, turn, hp, previousAttacks, myId);
  }

  // ============ PHASE 1 & 2: BUILD UP AND FORTRESS ============
  
  // Determine target armor level (Aggressive Porcupine threshold)
  const targetArmor = Math.min(level * AGGRESSIVE_ARMOR_PER_LEVEL, MAX_USEFUL_ARMOR);
  
  // Check if we should prioritize defense (low HP or low armor)
  const needsDefense = hp < HP_SAFETY_THRESHOLD || armor < targetArmor || armor < MIN_ARMOR_FLOOR;
  
  // Determine if we should upgrade
  const canAffordUpgrade = resources >= upgradeCost(level);
  const shouldUpgrade = getShouldUpgrade(turn, level, hp, armor, resources, targetArmor);

  if (shouldUpgrade && canAffordUpgrade) {
    // ============ UPGRADE PATH ============
    // First ensure minimum armor before upgrading
    const minArmorBeforeUpgrade = Math.max(MIN_ARMOR_FLOOR - armor, targetArmor - armor, 0);
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
    // ============ AGGRESSIVE DEFENSE PATH ============
    // Build armor aggressively - spend most resources on armor
    const armorDeficit = Math.max(0, targetArmor - armor);
    const armorAmount = Math.min(resources, Math.max(armorDeficit + 20, resources * 0.8)); // Spend up to 80% on armor
    if (armorAmount > 0 && !hasArmorAction(actions)) {
      actions.push({ type: 'armor', amount: Math.floor(armorAmount) });
      resources -= Math.floor(armorAmount);
    }
  } else {
    // ============ SAVINGS PATH ============
    // Save for upgrade, but still build armor aggressively
    const armorDeficit = Math.max(0, targetArmor - armor);
    const upgradeSavings = upgradeCost(level);
    const availableForArmor = Math.max(0, resources - upgradeSavings);
    
    if (availableForArmor > 0 && !hasArmorAction(actions)) {
      // Spend excess above upgrade cost on armor
      const armorAmount = Math.min(availableForArmor, MAX_USEFUL_ARMOR - armor);
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

  // ALWAYS spend leftover resources on armor (aggressive armor collection)
  if (resources > 0 && !hasArmorAction(actions) && armor < MAX_USEFUL_ARMOR) {
    const armorToAdd = Math.min(resources, MAX_USEFUL_ARMOR - armor);
    if (armorToAdd > 0) {
      actions.push({ type: 'armor', amount: armorToAdd });
      resources -= armorToAdd;
    }
  }

  return actions;
}

/**
 * Endgame strategy (Turn 20+): Must be aggressive to avoid fatigue draw
 * - Prioritize killing aggressors who attacked us (trust actions, not diplomacy)
 * - Attack the weakest enemy to eliminate them before fatigue kills everyone
 * - Still maintain strong armor for survivability
 */
function executeEndgameStrategy(
  existingActions: CombatAction[],
  resources: number,
  currentArmor: number,
  aliveTowers: Tower[],
  turn: number,
  hp: number,
  previousAttacks: CombatActionAttack[],
  myId: number
): CombatAction[] {
  const actions = [...existingActions];
  
  // Calculate how aggressive we need to be based on fatigue pressure
  const inFatigue = turn >= FATIGUE_START_TURN;
  
  // Aggression ratio: balance attack and defense
  // Turn 20: 50%, Turn 25+: 60% (keep more for armor)
  const aggressionRatio = inFatigue ? 0.6 : Math.min(0.6, 0.5 + (turn - AGGRESSION_TURN) * 0.02);
  
  // First, ensure we have minimum armor (aggressive defense even in endgame)
  const minEndgameArmor = 50;
  if (currentArmor < minEndgameArmor && !hasArmorAction(actions)) {
    const armorNeeded = Math.min(resources, minEndgameArmor - currentArmor);
    if (armorNeeded > 0) {
      actions.push({ type: 'armor', amount: armorNeeded });
      resources -= armorNeeded;
    }
  }
  
  // Check for kill shot opportunity - prioritize aggressors
  const killTarget = findBestKillTarget(aliveTowers, resources, previousAttacks, myId);
  if (killTarget && !hasAttackOnTarget(actions, killTarget.playerId)) {
    const cost = killCost(killTarget);
    actions.push({ type: 'attack', targetId: killTarget.playerId, troopCount: cost });
    resources -= cost;
  } else {
    // No kill shot available - find best target based on threat level
    const target = findBestAttackTarget(aliveTowers, previousAttacks, myId);
    if (target && !hasAttackOnTarget(actions, target.playerId)) {
      const attackBudget = Math.floor(resources * aggressionRatio);
      if (attackBudget > 0) {
        actions.push({ type: 'attack', targetId: target.playerId, troopCount: attackBudget });
        resources -= attackBudget;
      }
    }
  }

  // Use ALL remaining resources for armor (aggressive armor collection)
  if (resources > 0 && !hasArmorAction(actions) && currentArmor < MAX_USEFUL_ARMOR) {
    const armorAmount = Math.min(resources, MAX_USEFUL_ARMOR - currentArmor);
    if (armorAmount > 0) {
      actions.push({ type: 'armor', amount: armorAmount });
    }
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
 * "Trust But Verify" Kill Target Selection
 * 
 * When we can kill someone, prioritize:
 * 1. Confirmed aggressors (they attacked us - verified hostility)
 * 2. Easiest kills (maximize elimination efficiency)
 * 
 * We IGNORE diplomacy because anyone can lie about alliances.
 */
function findBestKillTarget(
  towers: Tower[], 
  resources: number, 
  previousAttacks: CombatActionAttack[],
  myId: number
): Tower | null {
  const killable = towers.filter(t => canKill(resources, t));
  if (killable.length === 0) return null;
  
  // Find who attacked us this turn (targetId is inside action object)
  const attackersWhoHitMe = new Set(
    previousAttacks
      .filter(a => a.action.targetId === myId)
      .map(a => a.playerId)
  );
  
  // Priority 1: Kill confirmed aggressors first (they attacked us)
  const killableAggressors = killable.filter(t => attackersWhoHitMe.has(t.playerId));
  if (killableAggressors.length > 0) {
    // Among aggressors, kill the most dangerous (highest level)
    return killableAggressors.reduce((a, b) => b.level - a.level > 0 ? b : a);
  }
  
  // Priority 2: Kill easiest target
  return killable.reduce((a, b) => killCost(a) < killCost(b) ? a : b);
}

/**
 * "Trust But Verify" Attack Target Selection
 * 
 * When we need to attack (endgame aggression), prioritize:
 * 1. Anyone who attacked us (verified threat)
 * 2. Strongest player (most dangerous if left unchecked)
 * 
 * We IGNORE diplomacy promises - they're cheap talk.
 */
function findBestAttackTarget(
  towers: Tower[],
  previousAttacks: CombatActionAttack[],
  myId: number
): Tower | null {
  if (towers.length === 0) return null;
  
  // Find who attacked us (targetId is inside action object)
  const attackersWhoHitMe = new Set(
    previousAttacks
      .filter(a => a.action.targetId === myId)
      .map(a => a.playerId)
  );
  
  // Priority 1: Attack confirmed aggressors
  const aggressorTowers = towers.filter(t => attackersWhoHitMe.has(t.playerId));
  if (aggressorTowers.length > 0) {
    // Attack the weakest aggressor (easier to kill)
    return aggressorTowers.reduce((a, b) => 
      (a.hp + a.armor) < (b.hp + b.armor) ? a : b
    );
  }
  
  // Priority 2: Attack strongest player (most dangerous)
  return towers.reduce((a, b) => b.level > a.level ? b : a);
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
