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
import mentalMathModule from "./mentalMath";
import fractionFighterModule from "./fractionFighter";
import unitConverterModule from "./unitConverter";
import percentageProModule from "./percentagePro";
import elementBlitzModule from "./elementBlitz";
import capitalCitiesModule from "./capitalCities";
import vocabSprintModule from "./vocabSprint";
import acronymDecoderModule from "./acronymDecoder";
import interestCalcModule from "./interestCalc";
import equationSolverModule from "./equationSolver";

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
  mental_math: mentalMathModule,
  fraction_fighter: fractionFighterModule,
  unit_converter: unitConverterModule,
  percentage_pro: percentageProModule,
  element_blitz: elementBlitzModule,
  capital_cities: capitalCitiesModule,
  vocab_sprint: vocabSprintModule,
  acronym_decoder: acronymDecoderModule,
  interest_calc: interestCalcModule,
  equation_solver: equationSolverModule,
};

export function getGameModule(gameType: string): GameModuleServer | null {
  return GAME_REGISTRY[gameType] || null;
}

export default GAME_REGISTRY;
