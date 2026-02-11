import type { CombatRequest, NegotiateRequest, CombatAction, NegotiateResponseItem } from '../types';

export interface Strategy {
  negotiate: (request: NegotiateRequest) => NegotiateResponseItem[];
  combat: (request: CombatRequest) => CombatAction[];
}

export type StrategyName = 'legacy' | 'hybrid-lite' | 'capped-buff';
