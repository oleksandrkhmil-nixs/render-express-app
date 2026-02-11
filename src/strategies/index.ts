import { legacyStrategy } from './legacy';
import { hybridLiteStrategy } from './hybridLite';
import type { Strategy, StrategyName } from './types';

export function getStrategy(strategyName: StrategyName): Strategy {
  switch (strategyName) {
    case 'hybrid-lite':
      return hybridLiteStrategy;
    case 'legacy':
    default:
      return legacyStrategy;
  }
}
