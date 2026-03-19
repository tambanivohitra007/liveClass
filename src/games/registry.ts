import type { GameModule } from './types';
import binaryModule from './binary';

/** All registered game modules, keyed by type */
const GAME_REGISTRY: Record<string, GameModule> = {
  [binaryModule.type]: binaryModule,
};

/** Get a game module by type, or null if not found */
export function getGameModule(gameType: string): GameModule | null {
  return GAME_REGISTRY[gameType] || null;
}

/** Get all registered game modules as an array */
export function getAllGameModules(): GameModule[] {
  return Object.values(GAME_REGISTRY);
}

export default GAME_REGISTRY;
