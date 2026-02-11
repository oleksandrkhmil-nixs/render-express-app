import type { NegotiateRequest, NegotiateResponseItem, Tower } from './types';

/**
 * Compute diplomacy: peace to lowest-level enemy, declare attack on highest-level enemy.
 * Returns one message to the ally (lowest level) with attackTargetId set to highest-level player.
 */
export function computeNegotiationActions(request: NegotiateRequest): NegotiateResponseItem[] {
  const { enemyTowers } = request;
  const living = enemyTowers.filter((t: Tower) => t.hp > 0);

  if (living.length < 2) {
    return [];
  }

  const byLevel = [...living].sort((a, b) => a.level - b.level);
  const lowestLevel = byLevel[0];
  const highestLevel = byLevel[byLevel.length - 1];

  if (lowestLevel.playerId === highestLevel.playerId) {
    return [];
  }

  return [
    {
      allyId: lowestLevel.playerId,
      attackTargetId: highestLevel.playerId
    }
  ];
}
