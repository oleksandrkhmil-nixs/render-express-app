import type { CombatRequest, NegotiateRequest, CombatAction, NegotiateResponseItem } from '../types';
import type { Strategy } from './types';
import { computeCombatActions } from '../combat';

function legacyNegotiate(_request: NegotiateRequest): NegotiateResponseItem[] {
  return [];
}

function legacyCombat(request: CombatRequest): CombatAction[] {
  return computeCombatActions(request);
}

export const legacyStrategy: Strategy = {
  negotiate: legacyNegotiate,
  combat: legacyCombat
};
