import { legacyStrategy } from './legacy';
import { hybridLiteStrategy } from './hybridLite';
import { cappedBuffStrategy } from './cappedBuff';
import type { Strategy, StrategyName } from './types';

export function getStrategy(strategyName: StrategyName): Strategy {
  switch (strategyName) {
    case 'capped-buff':
      return cappedBuffStrategy;
    case 'hybrid-lite':
      return hybridLiteStrategy;
    case 'legacy':
    default:
      return legacyStrategy;
  }
}
