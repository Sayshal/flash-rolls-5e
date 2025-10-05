import { LogUtil } from '../utils/LogUtil.mjs';
import { ROLL_TYPES, MODULE_ID, ACTIVITY_TYPES } from '../../constants/General.mjs';
import { ModuleHelpers } from '../helpers/ModuleHelpers.mjs';
import { SettingsUtil } from '../utils/SettingsUtil.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import { getConsumptionConfig, getCreateConfig, isPlayerOwned, showConsumptionConfig } from '../helpers/Helpers.mjs';
import { RollHelpers } from '../helpers/RollHelpers.mjs';
import { GeneralUtil } from '../utils/GeneralUtil.mjs';
import { HOOKS_DND5E } from '../../constants/Hooks.mjs';
import { HooksManager } from '../core/HooksManager.mjs';

/**
 * @typedef {Object} ActivityUseConfiguration
 * @property {object|false} create
 * @property {boolean} create.measuredTemplate - Should this item create a template?
 * @property {object} concentration
 * @property {boolean} concentration.begin - Should this usage initiate concentration?
 * @property {string|null} concentration.end - ID of an active effect to end concentration on.
 * @property {object|false} consume
 * @property {boolean} consume.action - Should action economy be tracked? Currently only handles legendary actions.
 * @property {boolean|number[]} consume.resources - Set to `true` or `false` to enable or disable all resource
 *                                                   consumption or provide a list of consumption target indexes
 *                                                   to only enable those targets.
 * @property {boolean} consume.spellSlot - Should this spell consume a spell slot?
 * @property {Event} event - The browser event which triggered the item usage, if any.
 * @property {boolean|number} scaling - Number of steps above baseline to scale this usage, or `false` if
 *                                      scaling is not allowed.
 * @property {object} spell
 * @property {number} spell.slot - The spell slot to consume.
 * @property {boolean} [subsequentActions=true] - Trigger subsequent actions defined by this activity.
 * @property {object} [cause]
 * @property {string} [cause.activity] - Relative UUID to the activity that caused this one to be used.
 *                                       Activity must be on the same actor as this one.
 * @property {boolean|number[]} [cause.resources] - Control resource consumption on linked item.
 * @property {BasicRollConfiguration[]} [rolls] - Roll configurations for this activity
 */

/**
 * Handles D&D5e 4.x activities
 */
export class ActivityManager {

  // ========================================
  // GM-ONLY METHODS
  // ========================================

  /**
   * Handle pre-use activity hook on GM side
   * Prevents usage message on GM side when sending activity requests for player-owned actors
   * @param {Activity} activity - The activity being used
   * @param {ActivityUseConfiguration} config - Configuration for the activity use
   * @param {Object} dialog - Dialog configuration
   * @param {Object} message - Message configuration
   */
  static onPreUseActivityGM(activity, config, dialog, message) {
    const SETTINGS = getSettings();
    const requestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    const isMidiOn = GeneralUtil.isModuleOn('midi-qol');
    if (!requestsEnabled || !rollInterceptionEnabled) return;

    const actor = activity.actor;
    const actorOwner = GeneralUtil.getActorOwner(actor);
    const isPlayerActor = isPlayerOwned(actor) && actorOwner.active;
    const isLocalRoll = !isPlayerActor || config.isRollRequest===false;

    activity.item.unsetFlag(MODULE_ID, 'tempAttackConfig');
    activity.item.unsetFlag(MODULE_ID, 'tempDamageConfig');
    activity.item.unsetFlag(MODULE_ID, 'tempSaveConfig');

    if (isMidiOn && isLocalRoll) return;
    if (!actor) return;
    LogUtil.log("ActivityManager.onPreUseActivityGM #1", [config, isLocalRoll]);
    
    // Store original configs before processing if this will be sent as a roll request
    if (actorOwner && actorOwner.active && !actorOwner.isGM) {
      config._originalConsume = structuredClone(config.consume || {});
      config._originalCreate = structuredClone(config.create || {});
    }
    
    const showConsumptionDialog = showConsumptionConfig();
    dialog.configure = dialog.configure ? showConsumptionDialog : false;

    config.consume = getConsumptionConfig(config.consume || {}, isLocalRoll);
    config.create = getCreateConfig(config.create || {}, isLocalRoll);

    if (actorOwner && actorOwner.active && !actorOwner.isGM) {
      LogUtil.log("ActivityManager.onPreUseActivityGM - Preventing usage message for player-owned actor", [actor.name]);
      message.create = false;
    }
  }

  /**
   * Handle post-use activity hook on GM side
   * Triggers damage rolls for save activities and stores activity configuration for caching
   * @param {Activity} activity - Activity that was used
   * @param {ActivityUseConfiguration} config - Configuration that was used
   * @param {Object} results - Results of the activity use
   */
  static onPostUseActivityGM(activity, config, results) {
    const SETTINGS = getSettings();
    const requestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    const isMidiOn = GeneralUtil.isModuleOn('midi-qol');
    const actor = activity.actor;
    LogUtil.log("ActivityManager.onPostUseActivityGM", [activity, config, results]);

    if (!requestsEnabled || !rollInterceptionEnabled || !actor) return;

    const actorOwner = GeneralUtil.getActorOwner(actor);
    const isOwnerActive = actorOwner && actorOwner.active && actorOwner.id !== game.user.id;
    // const isPlayerActor = isPlayerOwned(actor) && actorOwner.active;
    const isLocalRoll = !isOwnerActive || config.isRollRequest===false;

    if (isMidiOn && isLocalRoll) return;
    const skipRollDialog = RollHelpers.shouldSkipRollDialog(isOwnerActive, {isPC: isOwnerActive, isNPC: !isOwnerActive});
    results.configure = config.skipRollDialog !== undefined ? !config.skipRollDialog : (isOwnerActive && !skipRollDialog);

    LogUtil.log("ActivityManager.onPostUseActivityGM - skipRollDialog", [skipRollDialog, config.skipRollDialog]);
    if (config.skipRollDialog === false && (!actorOwner?.active || actorOwner.isGM)) {
      LogUtil.log("ActivityManager.onPostUseActivityGM - Preventing usage message - no owning player for actor", [activity.actor]);
      return;
    }

    // Store activity configuration for GM dialogs to access spell/scaling/consume/create data
    if (activity.item) {
      const activityConfig = {
        spell: config.spell || {},
        scaling: config.scaling,
        consume: config._originalConsume || config.consume || {},
        create: config._originalCreate || config.create || {}
      };

      const cacheKey = activity.item.id;
      const cacheEntry = {
        config: activityConfig,
        timestamp: Date.now()
      };
      HooksManager.activityConfigCache.set(cacheKey, cacheEntry);
      LogUtil.log('ActivityManager.onPostUseActivityGM - storing activity config in cache', [cacheKey, activityConfig]);
    }

    if (isMidiOn){
      LogUtil.log("ActivityManager.onPostUseActivityGM -  MIDI QOL is active", [activity]);

      activity.midiOptions = {
        workflowOptions: {
          autoFastForward: 'none',
          fastForwardSpells: false,
          autoFastDamage: false,
          autoRollAttack: false,
          autoRollDamage: 'none'
        }
      }
    } 

    if (activity.type === ACTIVITY_TYPES.SAVE && activity.damage?.parts?.length > 0 && !isMidiOn) {
      LogUtil.log("ActivityManager.onPostUseActivityGM - triggering save damage roll", [activity, config]);

      const shouldShowDialog = config.skipRollDialog !== undefined ? !config.skipRollDialog : (isOwnerActive && !skipRollDialog);

      activity.rollDamage(config, {
        configure: shouldShowDialog
      }, {});
    }
  }

  // ========================================
  // PLAYER-ONLY METHODS
  // ========================================

  /**
   * Handle pre-use activity hook on player side
   * Configures Midi-QOL options for Flash Token Actions compatibility
   * @param {Activity} activity - The activity being used
   * @param {ActivityUseConfiguration} config - Configuration for the activity use
   * @param {Object} dialog - Dialog configuration
   * @param {Object} message - Message configuration
   */
  static onPreUseActivityPlayer(activity, config, dialog, message) {
    const SETTINGS = getSettings();
    const requestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    if (!requestsEnabled || !rollInterceptionEnabled) return;
    const isMidiActive = GeneralUtil.isModuleOn('midi-qol');

    LogUtil.log("ActivityManager.onPreUseActivityPlayer", [activity, config, dialog, message]);

    const actor = activity.actor;

    // Clear any existing flags
    activity.item.unsetFlag(MODULE_ID, 'tempAttackConfig');
    activity.item.unsetFlag(MODULE_ID, 'tempDamageConfig');
    activity.item.unsetFlag(MODULE_ID, 'tempSaveConfig');

    if (!actor) return;

    const showConsumptionDialog = showConsumptionConfig();
    dialog.configure = dialog.configure ? showConsumptionDialog : false;

    config.consume = getConsumptionConfig(config.consume || {}, true);
    config.create = getCreateConfig(config.create || {}, true);
  }

  /**
   * Handle post-use activity hook on player side
   * Also configures Midi-QOL options for Flash Token Actions compatibility
   * @param {Activity} activity - Activity that was used
   * @param {ActivityUseConfiguration} config - Configuration that was used
   * @param {Object} results - Results of the activity use
   */
  static onPostUseActivityPlayer(activity, config, results) {
    const isMidiActive = GeneralUtil.isModuleOn('midi-qol');

    // Configure Midi-QOL options for Flash Token Actions compatibility
    if (activity.midiOptions) {
      activity.midiOptions = {
        ...activity.midiOptions,
        fastForwardDamage: true,
        autoRollAttack: false,
        autoRollDamage: true
      }
    }
    LogUtil.log("ActivityManager.onPostUseActivityPlayer", [activity, config, results, isMidiActive, activity.target?.template.count]);
    const hasTemplate = activity.target?.template.count > 0;
    const templateNotPlaced = config.create.measuredTemplate !== true;
    const isEmanation = activity.target?.template?.type === "radius";
    const shouldTriggerDamageRoll = (!isMidiActive || (isMidiActive && hasTemplate && templateNotPlaced && !isEmanation))
    
    // Trigger damage roll for save activities
    // If Midi-QoL is active, only trigger if template is not placed, in which case Midi does not trigger damage
    if (shouldTriggerDamageRoll && (activity.type === ACTIVITY_TYPES.SAVE && activity.damage?.parts?.length > 0)) {
      LogUtil.log("ActivityManager.onPostUseActivityPlayer - triggering save damage roll", [activity, config]);
      const shouldShowDialog = config.skipRollDialog !== undefined ? !config.skipRollDialog : true;

      activity.rollDamage(config, {
        configure: shouldShowDialog
      }, {
        create: true
      });
    }
  }

  
  /**
   * Find the appropriate activity for a given roll type on an item
   * @param {Item5e} item - The item to search for activities
   * @param {string} rollType - The type of roll (attack, damage)
   * @returns {Activity5e|null} - The found activity or null
   */
  static findActivityForRoll(item, rollType) {
    if (!item?.system?.activities) return null;
    
    const activities = item.system.activities;
    const normalizedRollType = rollType?.toLowerCase();
    
    switch (normalizedRollType) {
      case ROLL_TYPES.ATTACK:
        const attackActivities = activities.getByType("attack");
        return attackActivities?.[0] || null;
        
      case ROLL_TYPES.DAMAGE:
        const damageAttackActivities = activities.getByType("attack");
        if (damageAttackActivities?.length > 0) return damageAttackActivities[0];
        
        const damageActivities = activities.getByType("damage");
        if (damageActivities?.length > 0) return damageActivities[0];
        
        const saveActivities = activities.getByType("save");
        if (saveActivities?.length > 0) return saveActivities[0];
        
        return null;
        
      case ROLL_TYPES.ITEM_SAVE:
        const itemSaveActivities = activities.getByType("save");
        return itemSaveActivities?.[0] || null;
        
      default:
        return null;
    }
  }
  
  /**
   * Get all activities of a specific type from an item
   * @param {Item5e} item - The item to search
   * @param {string} activityType - The activity type (attack, damage, save, etc.)
   * @returns {Activity5e[]} - Array of activities
   */
  static getActivitiesByType(item, activityType) {
    if (!item?.system?.activities) return [];
    return item.system.activities.getByType(activityType);
  }
  
  /**
   * Check if an item has activities suitable for a given roll type
   * @param {Item5e} item - The item to check
   * @param {string} rollType - The type of roll
   * @returns {boolean} - Whether the item has suitable activities
   */
  static hasActivityForRoll(item, rollType) {
    LogUtil.log('hasActivityForRoll', [item, rollType]);
    return !!this.findActivityForRoll(item, rollType);
  }
  
  /**
   * GM LOCAL ROLL OR PLAYER SIDE ROLL
   * Execute a roll using the appropriate activity method
   * As a workaround for _triggerSubsequentActions stripping off usage config, 
   * we store request configuration in flags (e.g. tempAttackConfig) 
   * and retrieve it in the respective preRoll hook callback
   * Template placement: GM always gets prompted when executing. 
   * Player gets prompted if 'placeTemplateForPlayer' setting is false
   * 
   * @param {Actor5e} actor - The actor performing the roll
   * @param {string} rollType - The type of roll
   * @param {string} itemId - The item ID
   * @param {string} activityId - The activity ID (optional)
   * @param {Object} config - Roll configuration
   * @param {ActivityUseConfiguration} config.usage - Activity usage configuration
   * @param {BasicRollDialogConfiguration} config.dialog - Dialog configuration
   * @param {BasicRollMessageConfiguration} config.message - Message configuration
   */
  static async executeActivityRoll(actor, rollType, itemId, activityId, config) {
    LogUtil.log('executeActivityRoll #0', [actor, rollType, itemId, activityId, config]);
    const SETTINGS = getSettings();
    const promptForTemplate = game.user.isGM || SettingsUtil.get(SETTINGS.placeTemplateForPlayer.tag) === false;
    const isMidiActive = GeneralUtil.isModuleOn('midi-qol');
    const item = actor.items.get(itemId);
    if (!item) {
      LogUtil.error(`Item not found on actor`, [actor, itemId]);
      return;
    }
    
    let activity = (activityId ? item.system.activities?.get(activityId) : this.findActivityForRoll(item, rollType)) || null;
    let damageConfig = null;

    if (!activity) {
      LogUtil.error(`Activity not found on item`, [item, activityId, rollType]);
      return;
    }
    const normalizedRollType = rollType?.toLowerCase();
    
    if (activity) {
      switch (normalizedRollType) {
        case ROLL_TYPES.ATTACK:
          await this.executeAttackActivity(actor, activity, config);
          break;
        case ROLL_TYPES.DAMAGE:
          LogUtil.log('executeActivityRoll - damage roll #0', [activity, config]);
          damageConfig = {
            critical: config.usage.critical || {},
            situational: config.usage.rolls[0].data.situational || "",
            rollMode: config.message?.rollMode,
            create: config.message?.create !== false,
            scaling: config.usage.scaling,
            skipRollDialog: config.usage.skipRollDialog,
            consume: config.usage.consume
          };
          config.usage = {
            ...config.usage,
            consume: getConsumptionConfig(config.usage.consume || {}, true),
            create: getCreateConfig(config.usage.create || {}, true)
          }
          await activity.item.setFlag(MODULE_ID, 'tempDamageConfig', damageConfig);
          LogUtil.log('executeActivityRoll - flag set', [damageConfig]);

          const isDamageOnlyActivity = activity.type === ACTIVITY_TYPES.DAMAGE || activity.type === ACTIVITY_TYPES.SAVE || !activity?.attack;
          const isSaveActivity = activity.type === ACTIVITY_TYPES.SAVE;
          const isAttackActivity = activity.type === ACTIVITY_TYPES.ATTACK;

          switch(activity.type){
            case ACTIVITY_TYPES.DAMAGE:
              await this.executeDamageActivity(actor, activity, config);
              break;
            case ACTIVITY_TYPES.SAVE:
              await this.executeSaveActivity(actor, activity, config);
              break;
            case ACTIVITY_TYPES.HEAL:
              await this.executeHealActivity(actor, activity, config);
              break;
            case ACTIVITY_TYPES.ATTACK:
              await this.executeDamagefromAttack(actor, activity, config, damageConfig);
              break;
            default:
              LogUtil.error('executeActivityRoll | untracked activity type', [activity.type]);
              break;
          }

      }
      return;
    }
      
    throw new Error(`No suitable method found for ${normalizedRollType} on item ${item.name}`);
  }


  /**
   * Calls activity use for attack requests 
   * or for local GM activity use if player is offline
   * Stores tempAttackConfig flag so full config data can be retrieved in preRoll hook
   */
  static async executeAttackActivity(actor, activity, config){
    const isMidiActive = GeneralUtil.isModuleOn('midi-qol');
    LogUtil.log('executeAttackActivity', [config]);
          
    const rollRequestConfig = {
      attackMode: config.usage.attackMode,
      ammunition: config.usage.ammunition,
      mastery: config.usage.mastery,
      situational: config.usage.rolls?.[0]?.data?.situational,
      advantage: config.usage.advantage,
      disadvantage: config.usage.disadvantage,
      rollMode: config.message?.rollMode,
      skipRollDialog: config.usage.skipRollDialog,
      consume: config.usage.consume,
      create: config.usage.create
    };
    config.message.create = true;
    await activity.item.setFlag(MODULE_ID, 'tempAttackConfig', rollRequestConfig);
    
    try {
      if(isMidiActive){
        config.usage.consume = getConsumptionConfig(config.usage.consume || {}, true);
        await this.midiActivityRoll(activity, config.usage);
      }else{
        await activity.use(config.usage, config.dialog, config.message);
      }
    } catch (error) {
      LogUtil.error('executeAttackActivity - attack roll error', [error]);
    } finally {
      await activity.item.unsetFlag(MODULE_ID, 'tempAttackConfig');
    }
  }

  static async executeSaveActivity(actor, activity, config, damageConfig){
    const isMidiActive = GeneralUtil.isModuleOn('midi-qol');
    try {
      
      if(isMidiActive){
        config.usage.consume = getConsumptionConfig(config.usage.consume || {}, true);
        await this.midiActivityRoll(activity, config.usage);
      }else{
        LogUtil.log('executeSaveActivity - calling activity use', [activity, config]);
        await activity.use(config.usage, config.dialog, config.message);
      }
    } catch (error) {
      LogUtil.error('executeSaveActivity - save roll error', [error]);
    } finally {
      await activity.item.unsetFlag(MODULE_ID, 'tempDamageConfig');
      await activity.item.unsetFlag(MODULE_ID, 'tempSaveConfig');
    }
  }

  static async executeDamageActivity(actor, activity, config){
    const isMidiActive = GeneralUtil.isModuleOn('midi-qol');
    try {
      if(isMidiActive){
        config.usage.consume = getConsumptionConfig(config.usage.consume || {}, true);
        await this.midiActivityRoll(activity, config.usage);
      }else{
        LogUtil.log('executeDamageActivity - calling damage use', [activity, config]);
        await activity.use(config.usage, config.dialog, config.message);
      }
    } catch (error) {
      LogUtil.error('executeDamageActivity - roll error', [error]);
    } finally {
      await activity.item.unsetFlag(MODULE_ID, 'tempDamageConfig');
    }
  }

  static async executeHealActivity(actor, activity, config){
    const isMidiActive = GeneralUtil.isModuleOn('midi-qol');
    try {
      if(isMidiActive){
        config.usage.consume = getConsumptionConfig(config.usage.consume || {}, true);
        await this.midiActivityRoll(activity, config.usage);
      }else{
        LogUtil.log('executeHealActivity - calling use', [activity, config]);
        await activity.use(config.usage, config.dialog, config.message);
      }
    } catch (error) {
      LogUtil.error('executeHealActivity - roll error', [error]);
    } finally {
      await activity.item.unsetFlag(MODULE_ID, 'tempDamageConfig');
    }
  }

  static async executeDamagefromAttack(actor, activity, config, damageConfig){
    await activity.rollDamage(damageConfig, config.dialog, config.message);
  }
  
  /**
   * Get display information for an activity
   * @param {Activity5e} activity - The activity
   * @returns {Object} - Display information
   */
  static getActivityDisplayInfo(activity) {
    LogUtil.log('getActivityDisplayInfo', [activity]);
    if (!activity) return null;
    
    return {
      name: activity.name || activity.constructor.metadata.label,
      type: activity.type,
      icon: activity.constructor.metadata.icon,
      canAttack: activity.type === 'attack',
      canDamage: ['attack', 'damage', 'save'].includes(activity.type),
      canSave: activity.type === 'save'
    };
  }
  
  /**
   * Get damage formula string from an activity
   * @param {Activity5e} activity - The activity
   * @returns {string|null} - Combined damage formula or null
   */
  static getDamageFormula(activity) {
    LogUtil.log('getDamageFormula', [activity]);
    if (!activity?.damage?.parts?.length) return null;
    
    const formulas = activity.damage.parts.map(part => part.formula).filter(f => f);
    return formulas.length > 0 ? formulas.join(' + ') : null;
  }

  static async midiActivityRoll(activity, config = {}) {
    LogUtil.log('midiActivityRoll', [activity, config]);
    
    const MidiQOL = ModuleHelpers.getMidiQOL();
    if (!MidiQOL) {
      LogUtil.warn('MidiQOL is not active');
      return;
    }
    
    let defaultConfig = {
      consume: {
        action: false,
        resources: [],
        spellSlot: false
      }
    };
    let defaultOptions = {
      consume: {
        action: false,
        resources: [],
        spellSlot: false
      },
      fastForward: false,
      fastForwardAttack: false,
      dialogOptions: {
        fastForward: false,
        fastForwardAttack: false,
        fastForwardDamage: false
      },
      configureDialog: true,
      midiOptions: {
        autoRollAttack: false,
        autoFastAttack: false,
        autoRollDamage: 'none',
        autoFastDamage: false,
        fastForward: false,
        fastForwardAttack: false,
        fastForwardDamage: false,
      }
    };
    activity.midiProperties = {
      ...activity.midiProperties,
      forceDamageDialog: "always"
    }

    config = {...defaultOptions, ...config};

    LogUtil.log('midiActivityRoll - config', [config]);

    return await MidiQOL.completeActivityUse(activity, config, {});
  }

}