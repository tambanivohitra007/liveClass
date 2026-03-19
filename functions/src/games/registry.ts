import { GameModuleServer } from "./types";
import binaryModule from "./binary";
import portBlitzModule from "./portBlitz";
import asciiCodeModule from "./asciiCode";
import osiLayerModule from "./osiLayer";
import bigOModule from "./bigO";
import logicGateModule from "./logicGate";
import codeOutputModule from "./codeOutput";
import subnetModule from "./subnetShowdown";
import booleanAlgebraModule from "./booleanAlgebra";
import regexMatchModule from "./regexMatch";
import sqlOutputModule from "./sqlOutput";
import baseConverterModule from "./baseConverter";

const GAME_REGISTRY: Record<string, GameModuleServer> = {
  binary: binaryModule,
  port_blitz: portBlitzModule,
  ascii_code: asciiCodeModule,
  osi_layer: osiLayerModule,
  big_o: bigOModule,
  logic_gate: logicGateModule,
  code_output: codeOutputModule,
  subnet: subnetModule,
  boolean_algebra: booleanAlgebraModule,
  regex_match: regexMatchModule,
  sql_output: sqlOutputModule,
  base_converter: baseConverterModule,
};

export function getGameModule(gameType: string): GameModuleServer | null {
  return GAME_REGISTRY[gameType] || null;
}

export default GAME_REGISTRY;
