import { MODULE_ID } from "../../constants/General.mjs";
import { getSettings } from "../../constants/Settings.mjs";
import { LogUtil } from "../utils/LogUtil.mjs";
import { SettingsUtil } from "../utils/SettingsUtil.mjs";
import { SocketUtil } from "../utils/SocketUtil.mjs";
import { getPlayerOwner } from "../helpers/Helpers.mjs";
import { DnDBConnection } from "./dnd-beyond/DnDBConnection.mjs";
import { DnDBRollParser } from "./dnd-beyond/DnDBRollParser.mjs";
import { DnDBRollExecutor } from "./dnd-beyond/DnDBRollExecutor.mjs";
import { DnDBMidiIntegration } from "./dnd-beyond/DnDBMidiIntegration.mjs";

const SOCKET_HANDLERS = {
  EXECUTE_DDB_ROLL: "executeDnDBRoll"
};

/**
 * Integration with D&D Beyond Game Log via proxy server
 * Orchestrates connection, roll parsing, and execution
 * Premium feature - requires Patreon authentication
 */
export class DnDBeyondIntegration {

  /**
   * Initialize the DnDB Game Log integration
   * Only runs for GM users with valid configuration
   */
  static async initialize() {
    DnDBMidiIntegration.registerHooks();
    this._registerSocketHandlers();

    if (!game.user.isGM) {
      return;
    }

    const config = DnDBConnection.getConfig();
    if (!config.proxyApiKey) {
      return;
    }

    if (!config.isValid) {
      LogUtil.log("DnDBeyondIntegration: API key set but missing DnDB credentials - skipping auto-connect");
      return;
    }

    LogUtil.log("DnDBeyondIntegration: Initializing with config", [config]);

    DnDBConnection.setRollEventHandler((data) => this._onRollEvent(data));
    await DnDBConnection.connect();
  }

  /**
   * Register socket handlers for player-side roll execution
   */
  static _registerSocketHandlers() {
    LogUtil.log("DnDBeyondIntegration._registerSocketHandlers - Attempting registration", [
      "hasSocket:", !!SocketUtil.socket,
      "isGM:", game.user?.isGM
    ]);
    SocketUtil.registerCall(SOCKET_HANDLERS.EXECUTE_DDB_ROLL, this._handleSocketRollExecution.bind(this));
    LogUtil.log("DnDBeyondIntegration: Registered socket handlers");
  }

  /**
   * Handle roll execution request received via socket (runs on player's client)
   * @param {Object} data - The roll execution data
   * @param {string} data.actorId - The actor ID
   * @param {Object} data.rollInfo - The parsed roll info
   * @param {Object} data.category - The roll category
   * @returns {Promise<boolean>} Success status
   */
  static async _handleSocketRollExecution(data) {
    const { actorId, rollInfo, category } = data;
    LogUtil.log("DnDBeyondIntegration._handleSocketRollExecution - Received roll request", [
      "actorId:", actorId,
      "action:", rollInfo.action,
      "rollType:", rollInfo.rollType,
      "category:", category.category,
      "isGM:", game.user.isGM
    ]);

    const actor = game.actors.get(actorId);
    if (!actor) {
      LogUtil.warn("DnDBeyondIntegration._handleSocketRollExecution - Actor not found", [actorId]);
      return false;
    }

    return await DnDBRollExecutor.execute(actor, rollInfo, category);
  }

  /**
   * Handle roll events from the connection
   * @param {Object} rollData - The roll data from DnDB
   */
  static async _onRollEvent(rollData) {
    LogUtil.log("=== DnDB ROLL EVENT ===");
    LogUtil.log("Action:", [rollData.data?.action]);
    LogUtil.log("Roll Type:", [rollData.data?.rolls?.[0]?.rollType]);
    LogUtil.log("Roll Kind:", [rollData.data?.rolls?.[0]?.rollKind]);
    LogUtil.log("======================");

    await this._processRollEvent(rollData);
  }

  /**
   * Process a roll event
   * @param {Object} rollData - The roll data from DnDB
   */
  static async _processRollEvent(rollData) {
    const characterId = rollData.entityId;
    const actor = this._getActorForCharacter(characterId);

    const rollInfo = DnDBRollParser.extractRollInfo(rollData);
    const category = DnDBRollParser.determineRollCategory(
      rollInfo.action,
      rollInfo.rollType,
      actor
    );

    LogUtil.log("DnDBeyondIntegration: Processing roll", [
      rollInfo.action,
      rollInfo.rollType,
      category.category,
      actor?.name
    ]);

    if (actor) {
      const playerOwner = getPlayerOwner(actor);
      const shouldPlayerExecute = this._shouldPlayerExecute(playerOwner);

      if (shouldPlayerExecute) {
        LogUtil.log("DnDBeyondIntegration: Sending roll to player", [
          playerOwner.name,
          actor.name,
          "category:", category.category
        ]);
        const success = await this._sendRollToPlayer(actor, rollInfo, category, playerOwner);
        LogUtil.log("DnDBeyondIntegration: Player execution result", [
          "success:", success,
          "category:", category.category
        ]);
        if (success) return;
        LogUtil.log("DnDBeyondIntegration: Player execution failed, falling back to GM");
      }

      const success = await DnDBRollExecutor.execute(actor, rollInfo, category);
      if (success) return;
    }

    await this._createFallbackMessage(rollInfo);
  }

  /**
   * Check if a player should execute the roll based on settings and online status
   * @param {User|null} playerOwner - The player owner of the actor
   * @returns {boolean} Whether the player should execute the roll
   */
  static _shouldPlayerExecute(playerOwner) {
    if (!playerOwner) return false;
    if (!playerOwner.active) return false;

    const SETTINGS = getSettings();
    const rollOwnership = SettingsUtil.get(SETTINGS.ddbRollOwnership.tag) ?? 0;
    return rollOwnership === 1;
  }

  /**
   * Send roll execution request to player via socket
   * @param {Actor} actor - The actor performing the roll
   * @param {Object} rollInfo - The parsed roll info
   * @param {Object} category - The roll category
   * @param {User} playerOwner - The player to send the roll to
   * @returns {Promise<boolean>} Success status
   */
  static async _sendRollToPlayer(actor, rollInfo, category, playerOwner) {
    try {
      const data = {
        actorId: actor.id,
        rollInfo: rollInfo,
        category: category
      };

      const result = await SocketUtil.execForUser(
        SOCKET_HANDLERS.EXECUTE_DDB_ROLL,
        playerOwner.id,
        data
      );

      LogUtil.log("DnDBeyondIntegration._sendRollToPlayer - Result", [result]);
      return result === true;
    } catch (error) {
      LogUtil.error("DnDBeyondIntegration._sendRollToPlayer - Failed", [error]);
      return false;
    }
  }

  /**
   * Create a fallback chat message when no actor is mapped
   * @param {Object} rollInfo - The parsed roll information
   */
  static async _createFallbackMessage(rollInfo) {
    const diceHtml = rollInfo.diceResults
      .map((d) => `<span class="die d${d.type.replace("d", "")}">${d.value}</span>`)
      .join(" ");

    const rollTypeLabel = DnDBRollParser.getRollTypeLabel(rollInfo.rollType);
    const advantageLabel = rollInfo.isAdvantage
      ? ` (${game.i18n.localize("DND5E.Advantage")})`
      : rollInfo.isDisadvantage
        ? ` (${game.i18n.localize("DND5E.Disadvantage")})`
        : "";

    const sourceIcon = rollInfo.source === "mobile" ? "📱" : "🖥️";

    const content = `
      <div class="ddb-roll flash5e-ddb-roll">
        <div class="roll-header">
          <span class="roll-action">${rollInfo.action}</span>
          <span class="roll-type">${rollTypeLabel}${advantageLabel}</span>
          <span class="roll-source" title="${rollInfo.source}">${sourceIcon}</span>
        </div>
        <div class="roll-content">
          <div class="dice-results">${diceHtml}</div>
          <div class="roll-formula">${rollInfo.formula}</div>
          <div class="roll-total">${rollInfo.total}</div>
        </div>
      </div>
    `;

    await ChatMessage.create({
      speaker: { alias: rollInfo.characterName },
      content,
      flags: {
        [MODULE_ID]: {
          isDnDBRoll: true,
          ddbCharacterId: rollInfo.characterId,
          ddbSource: rollInfo.source,
          rollType: rollInfo.rollType,
          action: rollInfo.action
        }
      }
    });
  }

  /**
   * Get the Foundry actor associated with a DnDB character ID
   * @param {string|number} characterId - The DnDB character ID
   * @returns {Actor|null}
   */
  static _getActorForCharacter(characterId) {
    const charIdStr = String(characterId);
    const SETTINGS = getSettings();
    const mappings = SettingsUtil.get(SETTINGS.ddbCharacterMappings.tag) || {};
    const actorId = mappings[charIdStr];

    if (actorId) {
      const actor = game.actors.get(actorId);
      if (actor) {
        return actor;
      }
      LogUtil.warn("DnDBeyondIntegration: Mapped actor not found", [actorId]);
    }

    const actorByDDBFlag = game.actors.find(a => {
      const dndbeyond = a.flags?.ddbimporter?.dndbeyond;
      if (!dndbeyond) return false;
      if (dndbeyond.characterId && String(dndbeyond.characterId) === charIdStr) {
        return true;
      }
      if (dndbeyond.url && dndbeyond.url.includes(`/characters/${charIdStr}`)) {
        return true;
      }
      return false;
    });

    if (actorByDDBFlag) {
      LogUtil.log("DnDBeyondIntegration: Found actor via ddbimporter flag", [actorByDDBFlag.name]);
      return actorByDDBFlag;
    }

    LogUtil.log("DnDBeyondIntegration: No actor found for character", [charIdStr]);
    return null;
  }

  /**
   * Connect to the proxy server
   */
  static async connect() {
    DnDBConnection.setRollEventHandler((data) => this._onRollEvent(data));
    await DnDBConnection.connect();
  }

  /**
   * Disconnect from the proxy server
   */
  static disconnect() {
    DnDBConnection.disconnect();
  }

  /**
   * Manually trigger a reconnection
   */
  static async reconnect() {
    DnDBConnection.setRollEventHandler((data) => this._onRollEvent(data));
    await DnDBConnection.reconnect();
  }

  /**
   * Check if currently connected
   * @returns {boolean}
   */
  static isConnected() {
    return DnDBConnection.isConnected();
  }

  /**
   * Get the current connection status
   * @returns {string} 'connected', 'connecting', or 'disconnected'
   */
  static getStatus() {
    return DnDBConnection.getStatus();
  }

  /**
   * Map a DnDB character ID to a Foundry actor ID
   * @param {string|number} ddbCharacterId - The DnDB character ID
   * @param {string} foundryActorId - The Foundry actor ID
   */
  static async mapCharacter(ddbCharacterId, foundryActorId) {
    const charIdStr = String(ddbCharacterId);
    const SETTINGS = getSettings();
    const mappings = SettingsUtil.get(SETTINGS.ddbCharacterMappings.tag) || {};

    mappings[charIdStr] = foundryActorId;

    await SettingsUtil.set(SETTINGS.ddbCharacterMappings.tag, mappings);
    LogUtil.log("DnDBeyondIntegration: Character mapped", [charIdStr, foundryActorId]);
  }

  /**
   * Remove a character mapping
   * @param {string|number} ddbCharacterId - The DnDB character ID to unmap
   */
  static async unmapCharacter(ddbCharacterId) {
    const charIdStr = String(ddbCharacterId);
    const SETTINGS = getSettings();
    const mappings = SettingsUtil.get(SETTINGS.ddbCharacterMappings.tag) || {};

    delete mappings[charIdStr];

    await SettingsUtil.set(SETTINGS.ddbCharacterMappings.tag, mappings);
    LogUtil.log("DnDBeyondIntegration: Character unmapped", [charIdStr]);
  }

  /**
   * Get all current character mappings
   * @returns {Object} Object mapping DnDB character IDs to Foundry actor IDs
   */
  static getMappings() {
    const SETTINGS = getSettings();
    return SettingsUtil.get(SETTINGS.ddbCharacterMappings.tag) || {};
  }
}
