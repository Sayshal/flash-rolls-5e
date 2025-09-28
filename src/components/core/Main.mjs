import { getSettings } from "../../constants/Settings.mjs";
import { SOCKET_CALLS } from "../../constants/General.mjs";
import { SocketUtil } from "../utils/SocketUtil.mjs";
import { DiceConfigUtil } from "../utils/DiceConfigUtil.mjs";
import { HooksManager } from "./HooksManager.mjs";
import { SettingsUtil } from "../utils/SettingsUtil.mjs";
import { RollRequestManager } from "../managers/RollRequestManager.mjs";
import { LogUtil } from "../utils/LogUtil.mjs";
import { HOOKS_CORE } from "../../constants/Hooks.mjs";
import { ActorDirectoryIconUtil } from "../utils/ActorDirectoryIconUtil.mjs";
import { GeneralUtil } from "../utils/GeneralUtil.mjs";

/**
 * @typedef {import("./RollRequestManager.mjs").RollRequestData} RollRequestData
 */

/**
 * Main class handling core module initialization and setup
 * Manages module lifecycle, hooks, and core functionality
 */
export class Main {
  /**
   * Initialize the module and set up core hooks
   * @static
   */
  static init(){
    SocketUtil.initialize(Main.registerSocketCalls);
    HooksManager.initialize();
  }

  // Wrapper methods for socket calls to DiceConfigUtil
  static getDiceConfig() {
    return DiceConfigUtil.getDiceConfig();
  }
  
  static receiveDiceConfig(userId, diceConfig) {
    DiceConfigUtil.receiveDiceConfig(userId, diceConfig);
  }

  /**
   * Handle roll request from GM on player side
   * @param {RollRequestData} requestData - The roll request data
   */
  static async handleRollRequest(requestData) {
    LogUtil.log('Main.handleRollRequest', requestData);
    return RollRequestManager.handleRequest(requestData);
  }

  /**
   * Register methods with socketlib for remote execution
   */
  static registerSocketCalls() {
    SocketUtil.registerCall(SOCKET_CALLS.getDiceConfig, Main.getDiceConfig);
    SocketUtil.registerCall(SOCKET_CALLS.receiveDiceConfig, Main.receiveDiceConfig);
    SocketUtil.registerCall(SOCKET_CALLS.handleRollRequest, Main.handleRollRequest);
    SocketUtil.registerCall(SOCKET_CALLS.removeTemplate, GeneralUtil.removeTemplate);
  }
}
