import type { GameModule } from './types';
import binaryModule from './binary';
import portBlitzModule from './port-blitz';
import asciiCodeModule from './ascii-code';
import osiLayerModule from './osi-layer';
import bigOModule from './big-o';
import logicGateModule from './logic-gate';
import codeOutputModule from './code-output';
import subnetModule from './subnet';
import booleanAlgebraModule from './boolean-algebra';
import regexMatchModule from './regex-match';
import sqlOutputModule from './sql-output';
import baseConverterModule from './base-converter';
import mentalMathModule from './mental-math';

/** All registered game modules, keyed by type */
const GAME_REGISTRY: Record<string, GameModule> = {
  [binaryModule.type]: binaryModule,
  [portBlitzModule.type]: portBlitzModule,
  [asciiCodeModule.type]: asciiCodeModule,
  [osiLayerModule.type]: osiLayerModule,
  [bigOModule.type]: bigOModule,
  [logicGateModule.type]: logicGateModule,
  [codeOutputModule.type]: codeOutputModule,
  [subnetModule.type]: subnetModule,
  [booleanAlgebraModule.type]: booleanAlgebraModule,
  [regexMatchModule.type]: regexMatchModule,
  [sqlOutputModule.type]: sqlOutputModule,
  [baseConverterModule.type]: baseConverterModule,
  [mentalMathModule.type]: mentalMathModule,
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
