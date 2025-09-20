import { LogUtil } from '../LogUtil.mjs';
import { SettingsUtil } from '../SettingsUtil.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import { RollInterceptor } from '../RollInterceptor.mjs';
import { RollHandlers } from '../RollHandlers.mjs';

/**
 * Utility for handling offline player detection and roll execution
 */
export class OfflinePlayerUtil {
  
  /**
   * Check if a player owner is offline and handle the roll accordingly
   * @param {User} owner - The player owner
   * @param {Actor} actor - The actor to roll for
   * @param {string} rollType - The type of roll
   * @param {Object} originalConfig - Original roll configuration
   * @param {Object} dialogResult - Dialog result configuration
   * @returns {boolean} - Returns true if player is offline and roll was handled, false if player is online
   */
  static async handleOfflinePlayer(owner, actor, rollType, originalConfig, dialogResult = null) {
    LogUtil.log('OfflinePlayerUtil.handleOfflinePlayer', [owner?.name, actor?.name, rollType]);

    if (!owner || !originalConfig) {
      ui.notifications.warn('Flash Rolls: No owner found for actor ' + actor.name);
      return true;
    }
    
    if (!owner.active) {
      const SETTINGS = getSettings();
      if (SettingsUtil.get(SETTINGS.showOfflineNotifications.tag)) {
        ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.playerOffline", { 
          player: owner.name 
        }));
      }
      
      // Execute the roll locally using the RollInterceptor's static method
      const RollInterceptorClass = RollInterceptor;
      await RollInterceptorClass._executeInterceptedRoll(actor, rollType, originalConfig, dialogResult || {
        ...originalConfig,
        sendRequest: false 
      });

      
      return true; // Player was offline and roll was handled
    }
    
    return false; // Player is online, continue normal processing
  }
  
  /**
   * Categorize actors by their owner's online status
   * @param {Array} pcActors - Array of {actor, owner} objects
   * @returns {Object} - Object with onlinePlayerActors and offlinePlayerActors arrays
   */
  static categorizeActorsByOnlineStatus(pcActors) {
    const onlinePlayerActors = [];
    const offlinePlayerActors = [];
    
    // Group actors by ID to check all owners per actor
    const actorMap = new Map();
    for (const { actor, owner } of pcActors) {
      if (!actorMap.has(actor.id)) {
        actorMap.set(actor.id, { actor, owners: [] });
      }
      actorMap.get(actor.id).owners.push(owner);
    }
    
    // Check each actor's owners
    for (const { actor, owners } of actorMap.values()) {
      const onlineNonGMOwner = owners.find(owner => owner.active && !owner.isGM);
      
      if (onlineNonGMOwner) {
        onlinePlayerActors.push({ actor, owner: onlineNonGMOwner });
      } else {
        offlinePlayerActors.push(actor);
      }
    }
    
    return { onlinePlayerActors, offlinePlayerActors };
  }
  
  /**
   * Process offline actors using the unified offline handling
   * @param {Actor[]} offlineActors - Array of actors whose owners are offline
   * @param {string} rollMethodName - The roll method name
   * @param {string} rollKey - The roll key
   * @param {Object} config - Roll configuration
   */
  static async processOfflineActors(offlineActors, rollMethodName, rollKey, config) {
    LogUtil.log('OfflinePlayerUtil.processOfflineActors', [
      offlineActors.map(a => a.name), rollMethodName, rollKey
    ]);
    
    for (const actor of offlineActors) {
      const ownership = actor.ownership || {};
      let owner = null;
      
      for (const [userId, level] of Object.entries(ownership)) {
        if (level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && userId !== "default") {
          const potentialOwner = game.users.get(userId);
          if (potentialOwner && !potentialOwner.isGM) {
            owner = potentialOwner;
            break;
          }
        }
      }
      
      if (!owner) {
        LogUtil.warn('OfflinePlayerUtil.processOfflineActors - No owner found for actor', [actor.name]);
        continue;
      }
      
      // Prepare parameters for RollHandlers
      const requestData = {
        rollKey: rollKey,
        groupRollId: config.groupRollId, // Add groupRollId at top level
        config: {
          ...config,
          // Only set ability for ability checks and saving throws (where rollKey is the ability)
          ...(rollMethodName === 'ability' || rollMethodName === 'abilitycheck' || 
              rollMethodName === 'save' || rollMethodName === 'savingthrow' ? { ability: rollKey } : {}),
          sendRequest: false,
          isGroupRoll: !!config.groupRollId
        }
      };
      
      const rollConfig = {
        parts: [],
        data: config.situational ? { situational: config.situational } : {},
        options: config.dc ? { target: config.dc } : {}
      };
      
      const dialogConfig = {
        configure: false, // Skip dialog for offline rolls
        isRollRequest: true
      };
      
      const messageConfig = {
        rollMode: config.rollMode || game.settings.get("core", "rollMode"),
        create: true,
        isRollRequest: true,
        groupRollId: config.groupRollId
      };
      
      // Execute the roll
      const handler = RollHandlers[rollMethodName.toLowerCase()];
      if (handler) {
        await handler(actor, requestData, rollConfig, dialogConfig, messageConfig);
      }
      // Add delay between rolls to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
}