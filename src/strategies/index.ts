import { legacyStrategy } from './legacy';
import { hybridLiteStrategy } from './hybridLite';
import { cappedBuffStrategy } from './cappedBuff';
import { tempoThreatStrategy } from './tempoThreat';
import { armorControlStrategy } from './armorControl';
import type { Strategy, StrategyName } from './types';

export function getStrategy(strategyName: StrategyName): Strategy {
  switch (strategyName) {
    case 'armor-control':
      return armorControlStrategy;
    case 'tempo-threat':
      return tempoThreatStrategy;
    case 'capped-buff':
      return cappedBuffStrategy;
    case 'hybrid-lite':
      return hybridLiteStrategy;
    case 'legacy':
    default:
      return legacyStrategy;
  }
}
