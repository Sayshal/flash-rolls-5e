import { MODULE, ROLL_TYPES } from "../constants/General.mjs";
import { RollMenuOrchestrationUtil } from "./utils/RollMenuOrchestrationUtil.mjs";
import RollRequestsMenu from "./RollRequestsMenu.mjs";
import { getActorData } from "./helpers/Helpers.mjs";
import { LogUtil } from "./LogUtil.mjs";

/**
 * Public API for Flash Rolls 5e that can be used by other modules
 * Accessible via game.modules.get('flash-rolls-5e').api
 */
export class FlashRollsAPI {
  
  /**
   * Request a roll for specified actors
   * @param {Object} options - Roll request options
   * @param {string} options.requestType - The type of roll request (lowercase from ROLL_TYPES, e.g., 'skill', 'ability', 'savingthrow')
   * @param {string} [options.rollKey=null] - The specific roll key (e.g., 'acr' for Acrobatics, 'str' for Strength)
   * @param {string[]} [options.actorIds=[]] - Array of actor IDs or token IDs to roll for
   * @param {number} [options.dc] - Difficulty Class for the roll
   * @param {string} [options.situationalBonus] - Situational bonus (e.g., '+2', '1d4')
   * @param {boolean} [options.advantage] - Roll with advantage
   * @param {boolean} [options.disadvantage] - Roll with disadvantage
   * @param {boolean} [options.skipRollDialog] - Skip the roll dialog
   * @param {boolean} [options.sendAsRequest] - Send to players instead of rolling locally
   * @returns {Promise<void>}
   */
  static async requestRoll(options = {}) {
    const { requestType, rollKey = null, actorIds = [], dc, situationalBonus, advantage, disadvantage, skipRollDialog, sendAsRequest } = options;
    const config = { dc, situationalBonus, advantage, disadvantage, skipRollDialog, sendAsRequest };
    
    LogUtil.log('FlashRollsAPI.requestRoll', [requestType, rollKey, actorIds, config]);
    
    // Find roll option by either uppercase key or lowercase name
    let rollOption = MODULE.ROLL_REQUEST_OPTIONS[requestType];
    if (!rollOption) {
      // Try finding by lowercase name if not found by key
      const rollRequestOptions = Object.values(MODULE.ROLL_REQUEST_OPTIONS);
      rollOption = rollRequestOptions.find(option => option.name === requestType);
    }
    
    if (!rollOption) {
      throw new Error(`Unknown request type: ${requestType}`);
    }
    
    // Convert uppercase key to lowercase name for internal processing
    const normalizedRequestType = rollOption.name;
    
    // If no actors specified, use currently selected actors from menu
    if (actorIds.length === 0) {
      const menu = RollRequestsMenu.getInstance();
      if (menu && menu.selectedActors) {
        actorIds = Array.from(menu.selectedActors);
      }
    }
    
    if (actorIds.length === 0) {
      ui.notifications.warn("No actors selected for roll request");
      return;
    }
    
    // Create actor data array
    const actorsData = actorIds
      .map(uniqueId => {
        const actor = getActorData(uniqueId);
        if (!actor) return null;
        
        let tokenId = null;
        if (!game.actors.get(uniqueId)) {
          tokenId = uniqueId;
        }
        
        return {
          actor,
          uniqueId,
          tokenId
        };
      })
      .filter(entry => entry !== null);
    
    if (actorsData.length === 0) {
      ui.notifications.error("No valid actors found for roll request");
      return;
    }
    
    // Create a mock menu object with the necessary properties
    const mockMenu = {
      selectedActors: new Set(actorIds),
      selectedRequestType: requestType,
      isLocked: true, // Prevent the close() call since this is API-initiated
      close: () => {} // Provide a no-op close function
    };
    
    // Use orchestration utility to handle the roll request
    return RollMenuOrchestrationUtil.triggerRoll(normalizedRequestType, rollKey, mockMenu, config);
  }
  
  /**
   * Get list of available roll types
   * @returns {Object} Available roll request options
   */
  static getAvailableRollTypes() {
    return MODULE.ROLL_REQUEST_OPTIONS;
  }
  
  /**
   * Get currently selected actors from the roll requests menu
   * @returns {string[]} Array of selected actor/token IDs
   */
  static getSelectedActors() {
    const menu = RollRequestsMenu.getInstance();
    if (menu && menu.selectedActors) {
      return Array.from(menu.selectedActors);
    }
    return [];
  }
  
  /**
   * Check if the roll requests menu is currently open
   * @returns {boolean} True if menu is rendered and visible
   */
  static isMenuOpen() {
    const menu = RollRequestsMenu.getInstance();
    return menu && menu.rendered;
  }
  
  /**
   * Create a macro for a specific roll type and configuration
   * @param {Object} macroData - Macro configuration data
   * @param {string} macroData.requestType - The type of roll request
   * @param {string} macroData.rollKey - The specific roll key (null for non-nested rolls)
   * @param {string[]} macroData.actorIds - Array of actor IDs to include in macro
   * @param {Object} macroData.config - Roll configuration
   * @returns {Promise<Macro>} Created macro document
   */
  static async createMacro(macroData) {
    LogUtil.log('FlashRollsAPI.createMacro', [macroData]);
    
    const { requestType, rollKey = null, actorIds = [], config = {} } = macroData;
    
    // Find roll option by either uppercase key or lowercase name  
    let rollOption = MODULE.ROLL_REQUEST_OPTIONS[requestType];
    if (!rollOption) {
      // Try finding by lowercase name if not found by key
      const rollRequestOptions = Object.values(MODULE.ROLL_REQUEST_OPTIONS);
      rollOption = rollRequestOptions.find(option => option.name === requestType);
    }
    
    if (!rollOption) {
      ui.notifications.error(`Unknown request type: ${requestType}`);
      return;
    }
    
    // Generate macro name using label property
    let macroName = rollOption.label;
    LogUtil.log('FlashRollsAPI.createMacro', [macroName, rollOption.subList]);
    if (rollKey && rollOption.subList && Array.isArray(rollOption.subList)) {
      const subItem = rollOption.subList.find(item => item.id === rollKey);
      if (subItem) {
        macroName = subItem.name;
      }
    }
    
    // Get actor names for macro description
    const actorNames = actorIds
      .map(id => {
        const actor = getActorData(id);
        return actor ? actor.name : null;
      })
      .filter(name => name)
      .slice(0, 3); // Limit to first 3 for readability

    // Generate macro command using normalized lowercase name
    const requestOptions = {
      requestType: rollOption.name,
      ...(rollKey && { rollKey }),
      ...(actorIds.length > 0 && { actorIds }),
      ...config
    };
    
    // Always include advantage/disadvantage properties for user customization
    if (requestOptions.advantage === undefined) requestOptions.advantage = false;
    if (requestOptions.disadvantage === undefined) requestOptions.disadvantage = false;
    
    const command = `// Flash Rolls: ${macroName} - ${rollKey || ''}
FlashRolls5e.requestRoll(${JSON.stringify(requestOptions, null, 2)});`;

    // Create the macro
    const macroDocumentData = {
      name: `Flash Rolls: ${macroName}`,
      type: "script",
      command: command,
      img: "modules/flash-rolls-5e/assets/bolt-circle.svg",
      flags: {
        "flash-rolls-5e": {
          requestType,
          rollKey,
          actorIds,
          config
        }
      }
    };
    
    const macro = await Macro.create(macroDocumentData);
    ui.notifications.info(`Macro "${macro.name}" created successfully`);
    
    // Open the macro configuration sheet for editing
    macro.sheet.render(true);
    
    return macro;
  }
}