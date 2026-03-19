import { GameModuleServer } from "./types";
import binaryModule from "./binary";

const GAME_REGISTRY: Record<string, GameModuleServer> = {
  binary: binaryModule,
};

export function getGameModule(gameType: string): GameModuleServer | null {
  return GAME_REGISTRY[gameType] || null;
}

export default GAME_REGISTRY;
