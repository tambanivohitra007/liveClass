"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGameModule = getGameModule;
const binary_1 = __importDefault(require("./binary"));
const portBlitz_1 = __importDefault(require("./portBlitz"));
const asciiCode_1 = __importDefault(require("./asciiCode"));
const osiLayer_1 = __importDefault(require("./osiLayer"));
const bigO_1 = __importDefault(require("./bigO"));
const logicGate_1 = __importDefault(require("./logicGate"));
const codeOutput_1 = __importDefault(require("./codeOutput"));
const subnetShowdown_1 = __importDefault(require("./subnetShowdown"));
const booleanAlgebra_1 = __importDefault(require("./booleanAlgebra"));
const regexMatch_1 = __importDefault(require("./regexMatch"));
const sqlOutput_1 = __importDefault(require("./sqlOutput"));
const baseConverter_1 = __importDefault(require("./baseConverter"));
const GAME_REGISTRY = {
    binary: binary_1.default,
    port_blitz: portBlitz_1.default,
    ascii_code: asciiCode_1.default,
    osi_layer: osiLayer_1.default,
    big_o: bigO_1.default,
    logic_gate: logicGate_1.default,
    code_output: codeOutput_1.default,
    subnet: subnetShowdown_1.default,
    boolean_algebra: booleanAlgebra_1.default,
    regex_match: regexMatch_1.default,
    sql_output: sqlOutput_1.default,
    base_converter: baseConverter_1.default,
};
function getGameModule(gameType) {
    return GAME_REGISTRY[gameType] || null;
}
exports.default = GAME_REGISTRY;
//# sourceMappingURL=registry.js.map