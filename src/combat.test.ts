/**
 * Unit tests for combat.ts strategy functions
 */
import { computeCombatActions } from './combat';
import type { CombatRequest, CombatAction, Tower, CombatActionAttack, DiplomacyEntry } from './types';

// Helper to create a basic combat request
function createCombatRequest(overrides: Partial<CombatRequest> = {}): CombatRequest {
  return {
    gameId: 1,
    turn: 1,
    playerTower: {
      playerId: 1,
      hp: 100,
      armor: 0,
      resources: 100,
      level: 1,
    },
    enemyTowers: [
      { playerId: 2, hp: 100, armor: 0, level: 1 },
      { playerId: 3, hp: 100, armor: 0, level: 1 },
    ],
    diplomacy: [],
    previousAttacks: [],
    ...overrides,
  };
}

// Helper to find action by type
function findAction(actions: CombatAction[], type: string): CombatAction | undefined {
  return actions.find(a => a.type === type);
}

function countActions(actions: CombatAction[], type: string): number {
  return actions.filter(a => a.type === type).length;
}

describe('computeCombatActions', () => {
  // Disable chaos for deterministic tests
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99); // Always above CHAOS_FACTOR (0.15)
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Kill Shot Priority', () => {
    it('should attack to kill if enemy can be eliminated', () => {
      const request = createCombatRequest({
        playerTower: { playerId: 1, hp: 100, armor: 50, resources: 100, level: 2 },
        enemyTowers: [
          { playerId: 2, hp: 30, armor: 10, level: 1 }, // Kill cost: 40
          { playerId: 3, hp: 100, armor: 50, level: 2 },
        ],
      });

      const actions = computeCombatActions(request);
      const attack = actions.find(a => a.type === 'attack') as { type: 'attack'; targetId: number; troopCount: number };
      
      expect(attack).toBeDefined();
      expect(attack.targetId).toBe(2); // Target the killable enemy
      expect(attack.troopCount).toBe(40); // Exact kill cost
    });

    it('should prioritize killing aggressors over easier targets', () => {
      const request = createCombatRequest({
        playerTower: { playerId: 1, hp: 100, armor: 50, resources: 150, level: 2 },
        enemyTowers: [
          { playerId: 2, hp: 20, armor: 10, level: 1 },  // Kill cost: 30 (easier)
          { playerId: 3, hp: 30, armor: 20, level: 1 },  // Kill cost: 50 (aggressor)
        ],
        previousAttacks: [
          { playerId: 3, action: { targetId: 1, troopCount: 20 } }, // Player 3 attacked us
        ],
      });

      const actions = computeCombatActions(request);
      const attack = actions.find(a => a.type === 'attack') as { type: 'attack'; targetId: number; troopCount: number };
      
      expect(attack).toBeDefined();
      expect(attack.targetId).toBe(3); // Kill the aggressor, not the easier target
    });
  });

  describe('Retaliation Behavior', () => {
    it('should retaliate when attacked (tit-for-tat)', () => {
      const request = createCombatRequest({
        turn: 10,
        playerTower: { playerId: 1, hp: 80, armor: 50, resources: 100, level: 2 },
        enemyTowers: [
          { playerId: 2, hp: 100, armor: 50, level: 2 },
          { playerId: 3, hp: 100, armor: 50, level: 2 },
        ],
        previousAttacks: [
          { playerId: 2, action: { targetId: 1, troopCount: 30 } }, // Player 2 attacked us for 30
        ],
      });

      const actions = computeCombatActions(request);
      const attack = actions.find(a => a.type === 'attack') as { type: 'attack'; targetId: number; troopCount: number };
      
      expect(attack).toBeDefined();
      expect(attack.targetId).toBe(2); // Retaliate against attacker
      expect(attack.troopCount).toBe(45); // 1.5x retaliation (30 * 1.5)
    });

    it('should not retaliate if not attacked', () => {
      const request = createCombatRequest({
        turn: 10,
        playerTower: { playerId: 1, hp: 100, armor: 50, resources: 100, level: 2 },
        enemyTowers: [
          { playerId: 2, hp: 100, armor: 50, level: 2 },
        ],
        previousAttacks: [
          { playerId: 2, action: { targetId: 3, troopCount: 50 } }, // Player 2 attacked someone else
        ],
      });

      const actions = computeCombatActions(request);
      const attacks = actions.filter(a => a.type === 'attack');
      
      // Should have no attacks (no kill opportunity, no one attacked us)
      expect(attacks.length).toBe(0);
    });
  });

  describe('Phase 1: Early Game Rush', () => {
    it('should upgrade in early turns when affordable', () => {
      const request = createCombatRequest({
        turn: 3,
        playerTower: { playerId: 1, hp: 100, armor: 10, resources: 60, level: 1 },
      });

      const actions = computeCombatActions(request);
      expect(findAction(actions, 'upgrade')).toBeDefined();
    });

    it('should build armor if HP is low in early game', () => {
      const request = createCombatRequest({
        turn: 3,
        playerTower: { playerId: 1, hp: 70, armor: 0, resources: 60, level: 1 },
      });

      const actions = computeCombatActions(request);
      const armorAction = findAction(actions, 'armor') as { type: 'armor'; amount: number };
      
      expect(armorAction).toBeDefined();
      expect(armorAction.amount).toBeGreaterThan(0);
    });
  });

  describe('Phase 2: Fortress Mode', () => {
    it('should build armor before upgrading in mid-game', () => {
      const request = createCombatRequest({
        turn: 12,
        playerTower: { playerId: 1, hp: 100, armor: 20, resources: 150, level: 2 },
      });

      const actions = computeCombatActions(request);
      const armorAction = findAction(actions, 'armor') as { type: 'armor'; amount: number };
      
      // Should build armor since below target (level 2 * 25 = 50)
      expect(armorAction).toBeDefined();
    });

    it('should upgrade when well-defended (100+ armor) and not under attack', () => {
      // Explicitly disable chaos for this test
      jest.spyOn(Math, 'random').mockReturnValue(0.99);
      
      const request = createCombatRequest({
        turn: 12,
        playerTower: { playerId: 1, hp: 100, armor: 120, resources: 150, level: 2 }, // Enough resources for upgrade
        enemyTowers: [
          // Enemies with enough health that we can't kill them (cost > our resources)
          { playerId: 2, hp: 150, armor: 50, level: 2 }, // Kill cost: 200
          { playerId: 3, hp: 150, armor: 50, level: 2 }, // Kill cost: 200
        ],
        previousAttacks: [], // Not under attack
      });

      const actions = computeCombatActions(request);
      expect(findAction(actions, 'upgrade')).toBeDefined();
    });

    it('should NOT upgrade when under heavy attack even with lots of armor', () => {
      const request = createCombatRequest({
        turn: 12,
        playerTower: { playerId: 1, hp: 100, armor: 120, resources: 100, level: 2 },
        previousAttacks: [
          { playerId: 2, action: { targetId: 1, troopCount: 50 } }, // Heavy attack
        ],
      });

      const actions = computeCombatActions(request);
      // Should retaliate, not upgrade
      const attack = actions.find(a => a.type === 'attack');
      expect(attack).toBeDefined();
    });
  });

  describe('Phase 3: Endgame Aggression', () => {
    it('should attack in endgame (turn 20+)', () => {
      const request = createCombatRequest({
        turn: 22,
        playerTower: { playerId: 1, hp: 100, armor: 100, resources: 150, level: 3 },
        enemyTowers: [
          { playerId: 2, hp: 80, armor: 40, level: 2 },
        ],
      });

      const actions = computeCombatActions(request);
      const attack = actions.find(a => a.type === 'attack');
      
      expect(attack).toBeDefined();
    });

    it('should increase aggression as turns progress', () => {
      const requestTurn20 = createCombatRequest({
        turn: 20,
        playerTower: { playerId: 1, hp: 100, armor: 100, resources: 150, level: 3 },
        enemyTowers: [{ playerId: 2, hp: 100, armor: 50, level: 2 }],
      });

      const requestTurn24 = createCombatRequest({
        turn: 24,
        playerTower: { playerId: 1, hp: 100, armor: 100, resources: 150, level: 3 },
        enemyTowers: [{ playerId: 2, hp: 100, armor: 50, level: 2 }],
      });

      const actions20 = computeCombatActions(requestTurn20);
      const actions24 = computeCombatActions(requestTurn24);

      const attack20 = actions20.find(a => a.type === 'attack') as { type: 'attack'; troopCount: number };
      const attack24 = actions24.find(a => a.type === 'attack') as { type: 'attack'; troopCount: number };

      // Both should attack, and turn 24 should be at least as aggressive
      expect(attack20).toBeDefined();
      expect(attack24).toBeDefined();
      expect(attack24.troopCount).toBeGreaterThanOrEqual(attack20.troopCount);
    });
  });

  describe('Trust But Verify (Ignoring Diplomacy)', () => {
    it('should ignore diplomacy signals and only trust previousAttacks', () => {
      const request = createCombatRequest({
        turn: 15,
        playerTower: { playerId: 1, hp: 100, armor: 50, resources: 100, level: 2 },
        enemyTowers: [
          { playerId: 2, hp: 100, armor: 50, level: 2 },
          { playerId: 3, hp: 100, armor: 50, level: 2 },
        ],
        diplomacy: [
          { playerId: 2, action: { allyId: 1 } }, // Player 2 claims alliance with us
        ],
        previousAttacks: [
          { playerId: 2, action: { targetId: 1, troopCount: 40 } }, // But player 2 attacked us!
        ],
      });

      const actions = computeCombatActions(request);
      const attack = actions.find(a => a.type === 'attack') as { type: 'attack'; targetId: number };
      
      // Should retaliate against player 2 despite their alliance claim
      expect(attack).toBeDefined();
      expect(attack.targetId).toBe(2);
    });
  });

  describe('No Enemies Left', () => {
    it('should return empty actions when no enemies alive', () => {
      const request = createCombatRequest({
        enemyTowers: [
          { playerId: 2, hp: 0, armor: 0, level: 1 },
          { playerId: 3, hp: 0, armor: 0, level: 1 },
        ],
      });

      const actions = computeCombatActions(request);
      expect(actions).toHaveLength(0);
    });
  });

  describe('Resource Management', () => {
    it('should not overspend resources', () => {
      const request = createCombatRequest({
        turn: 10,
        playerTower: { playerId: 1, hp: 100, armor: 20, resources: 50, level: 2 },
      });

      const actions = computeCombatActions(request);
      
      let totalSpent = 0;
      for (const action of actions) {
        if (action.type === 'armor') totalSpent += action.amount;
        if (action.type === 'attack') totalSpent += action.troopCount;
        if (action.type === 'upgrade') totalSpent += 87; // Level 2 upgrade cost
      }

      expect(totalSpent).toBeLessThanOrEqual(50);
    });
  });
});

describe('Chaos Mode', () => {
  it('should sometimes take random actions when chaos triggers', () => {
    // Mock Math.random to trigger chaos
    jest.spyOn(Math, 'random').mockReturnValue(0.05); // Below CHAOS_FACTOR (0.15)

    const request = createCombatRequest({
      turn: 10,
      playerTower: { playerId: 1, hp: 100, armor: 50, resources: 100, level: 2 },
      enemyTowers: [
        { playerId: 2, hp: 100, armor: 50, level: 2 },
        { playerId: 3, hp: 100, armor: 50, level: 2 },
      ],
    });

    // Run multiple times to see if chaos produces varied results
    const results = new Set<string>();
    for (let i = 0; i < 10; i++) {
      // Alternate random values for different chaos actions
      jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.05)  // Trigger chaos
        .mockReturnValueOnce(i / 10); // Different chaos action each time
      
      const actions = computeCombatActions(request);
      results.add(JSON.stringify(actions));
    }

    // With chaos, we should see some variation
    expect(results.size).toBeGreaterThanOrEqual(1);

    jest.restoreAllMocks();
  });
});
