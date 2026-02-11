/**
 * Unit tests for types.ts helper functions
 */
import {
  upgradeCost,
  resourcesPerTurn,
  killCost,
  effectiveHealth,
  towerStrength,
  getAliveTowers,
  findStrongestEnemy,
  findWeakestEnemy,
  canKill,
  totalDamageReceived,
  findTopAggressor,
  Tower,
  CombatActionAttack,
} from './types';

describe('Cost Helper Functions', () => {
  describe('upgradeCost', () => {
    it('should return 50 for level 1 to 2 upgrade', () => {
      expect(upgradeCost(1)).toBe(50);
    });

    it('should return 87 for level 2 to 3 upgrade', () => {
      expect(upgradeCost(2)).toBe(87);
    });

    it('should return 153 for level 3 to 4 upgrade', () => {
      expect(upgradeCost(3)).toBe(153);
    });

    it('should scale exponentially with level', () => {
      expect(upgradeCost(4)).toBeGreaterThan(upgradeCost(3));
      expect(upgradeCost(5)).toBeGreaterThan(upgradeCost(4));
    });
  });

  describe('resourcesPerTurn', () => {
    it('should return 20 for level 1', () => {
      expect(resourcesPerTurn(1)).toBe(20);
    });

    it('should return 30 for level 2', () => {
      expect(resourcesPerTurn(2)).toBe(30);
    });

    it('should scale with level', () => {
      expect(resourcesPerTurn(3)).toBeGreaterThan(resourcesPerTurn(2));
    });
  });

  describe('killCost', () => {
    it('should return HP + armor', () => {
      const tower: Tower = { playerId: 1, hp: 100, armor: 50, level: 2 };
      expect(killCost(tower)).toBe(150);
    });

    it('should handle zero armor', () => {
      const tower: Tower = { playerId: 1, hp: 80, armor: 0, level: 1 };
      expect(killCost(tower)).toBe(80);
    });
  });

  describe('effectiveHealth', () => {
    it('should return HP + armor', () => {
      const tower: Tower = { playerId: 1, hp: 100, armor: 25, level: 1 };
      expect(effectiveHealth(tower)).toBe(125);
    });
  });

  describe('towerStrength', () => {
    it('should calculate strength including resources and level bonus', () => {
      const tower: Tower = { playerId: 1, hp: 100, armor: 50, resources: 100, level: 3 };
      // effectiveHealth: 150, resources: 100, level bonus: 60
      expect(towerStrength(tower)).toBe(310);
    });

    it('should handle missing resources', () => {
      const tower: Tower = { playerId: 1, hp: 100, armor: 50, level: 2 };
      // effectiveHealth: 150, resources: 0, level bonus: 40
      expect(towerStrength(tower)).toBe(190);
    });
  });
});

describe('Tower Query Functions', () => {
  const towers: Tower[] = [
    { playerId: 1, hp: 100, armor: 50, level: 3, resources: 200 },
    { playerId: 2, hp: 0, armor: 0, level: 2, resources: 0 },  // Dead
    { playerId: 3, hp: 50, armor: 10, level: 1, resources: 30 },
    { playerId: 4, hp: 80, armor: 30, level: 2, resources: 100 },
  ];

  describe('getAliveTowers', () => {
    it('should filter out dead towers (hp <= 0)', () => {
      const alive = getAliveTowers(towers);
      expect(alive).toHaveLength(3);
      expect(alive.map(t => t.playerId)).toEqual([1, 3, 4]);
    });

    it('should return empty array if all dead', () => {
      const deadTowers = [{ playerId: 1, hp: 0, armor: 0, level: 1 }];
      expect(getAliveTowers(deadTowers)).toHaveLength(0);
    });
  });

  describe('findStrongestEnemy', () => {
    it('should return tower with highest strength', () => {
      const strongest = findStrongestEnemy(towers);
      expect(strongest?.playerId).toBe(1); // Highest resources and level
    });

    it('should return null for empty array', () => {
      expect(findStrongestEnemy([])).toBeNull();
    });

    it('should ignore dead towers', () => {
      const allDead = [{ playerId: 1, hp: 0, armor: 100, level: 5, resources: 500 }];
      expect(findStrongestEnemy(allDead)).toBeNull();
    });
  });

  describe('findWeakestEnemy', () => {
    it('should return tower with lowest effective health', () => {
      const weakest = findWeakestEnemy(towers);
      expect(weakest?.playerId).toBe(3); // HP 50 + armor 10 = 60
    });

    it('should return null for empty array', () => {
      expect(findWeakestEnemy([])).toBeNull();
    });
  });

  describe('canKill', () => {
    it('should return true if resources >= kill cost', () => {
      const target: Tower = { playerId: 1, hp: 50, armor: 30, level: 1 };
      expect(canKill(80, target)).toBe(true);
      expect(canKill(100, target)).toBe(true);
    });

    it('should return false if resources < kill cost', () => {
      const target: Tower = { playerId: 1, hp: 50, armor: 30, level: 1 };
      expect(canKill(79, target)).toBe(false);
      expect(canKill(0, target)).toBe(false);
    });
  });
});

describe('Attack Analysis Functions', () => {
  const myId = 1;
  const attacks: CombatActionAttack[] = [
    { playerId: 2, action: { targetId: 1, troopCount: 30 } },  // Player 2 attacks me
    { playerId: 3, action: { targetId: 1, troopCount: 20 } },  // Player 3 attacks me
    { playerId: 2, action: { targetId: 1, troopCount: 10 } },  // Player 2 attacks me again
    { playerId: 3, action: { targetId: 4, troopCount: 50 } },  // Player 3 attacks someone else
  ];

  describe('totalDamageReceived', () => {
    it('should sum all damage targeting myId', () => {
      expect(totalDamageReceived(attacks, myId)).toBe(60); // 30 + 20 + 10
    });

    it('should return 0 if no attacks on me', () => {
      expect(totalDamageReceived(attacks, 99)).toBe(0);
    });

    it('should return 0 for empty attacks', () => {
      expect(totalDamageReceived([], myId)).toBe(0);
    });
  });

  describe('findTopAggressor', () => {
    it('should find player who dealt most damage to me', () => {
      const aggressor = findTopAggressor(attacks, myId);
      expect(aggressor?.playerId).toBe(2); // 30 + 10 = 40 damage
      expect(aggressor?.damage).toBe(40);
    });

    it('should return null if no attacks on me', () => {
      expect(findTopAggressor(attacks, 99)).toBeNull();
    });

    it('should return null for empty attacks', () => {
      expect(findTopAggressor([], myId)).toBeNull();
    });

    it('should handle single attacker', () => {
      const singleAttack: CombatActionAttack[] = [
        { playerId: 5, action: { targetId: 1, troopCount: 25 } },
      ];
      const aggressor = findTopAggressor(singleAttack, 1);
      expect(aggressor?.playerId).toBe(5);
      expect(aggressor?.damage).toBe(25);
    });
  });
});
