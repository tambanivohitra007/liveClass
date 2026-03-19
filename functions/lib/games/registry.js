"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGameModule = getGameModule;
const binary_1 = __importDefault(require("./binary"));
const GAME_REGISTRY = {
    binary: binary_1.default,
};
function getGameModule(gameType) {
    return GAME_REGISTRY[gameType] || null;
}
exports.default = GAME_REGISTRY;
//# sourceMappingURL=registry.js.map