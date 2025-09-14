import { MODULE } from '../../constants/General.mjs';
import { LogUtil } from '../LogUtil.mjs';
import { SettingsUtil } from '../SettingsUtil.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import { buildRollTypes } from '../helpers/Helpers.mjs';
import { RollMenuActorUtil } from './RollMenuActorUtil.mjs';
import { ActorStatusUtil } from '../ActorStatusUtil.mjs';
import { RollMenuStatusUtil } from './RollMenuStatusUtil.mjs';

/**
 * Utility class for processing actors for the Roll Requests Menu
 */
export class RollMenuActorProcessor {

  /**
   * Process all actors and build context data for template rendering
   * @param {RollRequestsMenu} menu - Menu instance
   * @param {Object} baseContext - Base context from ApplicationV2
   * @returns {Object} Complete context object for template
   */
  static async prepareActorContext(menu, baseContext) {
    const SETTINGS = getSettings();
    const actors = game.actors.contents;
    const pcActors = [];
    const npcActors = [];
    const currentScene = game.scenes.active;
    
    for (const actor of actors) {
      if (actor.type !== 'character' && actor.type !== 'npc') continue;
      
      const isPlayerOwned = this.isPlayerOwnedActor(actor);
      const actorEntries = await this.processActor(actor, currentScene, menu, isPlayerOwned);
      
      if (isPlayerOwned) {
        pcActors.push(...actorEntries);
      } else {
        npcActors.push(...actorEntries);
      }
    }
    
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const skipRollDialog = SettingsUtil.get(SETTINGS.skipRollDialog.tag);
    const groupRollsMsgEnabled = SettingsUtil.get(SETTINGS.groupRollsMsgEnabled.tag);
    const showOnlyPCsWithToken = SettingsUtil.get(SETTINGS.showOnlyPCsWithToken.tag);
    const showOptionsListOnHover = SettingsUtil.get(SETTINGS.showOptionsListOnHover.tag) ?? SETTINGS.showOptionsListOnHover.default;
    LogUtil.log('Template context showOptionsListOnHover:', [showOptionsListOnHover, typeof showOptionsListOnHover, 'tag:', SETTINGS.showOptionsListOnHover.tag]);
    
    const currentActors = menu.currentTab === 'pc' ? pcActors : npcActors;
    const selectAllOn = currentActors.length > 0 && 
      currentActors.every(actor => menu.selectedActors.has(actor.uniqueId));
    
    const requestTypes = this.buildRequestTypes(menu);
    const rollTypes = buildRollTypes(menu.selectedRequestType, menu.selectedActors);
    const statusEffects = RollMenuStatusUtil.getStatusEffectsForTemplate();
    
    return {
      ...baseContext,
      actors: currentActors,
      currentTab: menu.currentTab,
      isPCTab: menu.currentTab === 'pc',
      isNPCTab: menu.currentTab === 'npc',
      selectedTab: menu.currentTab,
      selectedSubmenu: menu.selectedSubmenu,
      rollRequestsEnabled,
      skipRollDialog,
      groupRollsMsgEnabled,
      showOptionsListOnHover,
      selectAllOn,
      hasSelectedActors: menu.selectedActors.size > 0,
      requestTypes,
      rollTypes,
      statusEffects,
      showNames: true,
      actorsLocked: menu.isLocked,
      optionsExpanded: menu.optionsExpanded,
      isGM: game.user.isGM,
      isCompact: SettingsUtil.get(SETTINGS.compactMode.tag)
    };
  }

  /**
   * Check if an actor is player-owned
   * @param {Actor} actor - The actor to check
   * @returns {boolean} True if player-owned
   */
  static isPlayerOwnedActor(actor) {
    return Object.entries(actor.ownership)
      .some(([userId, level]) => {
        const user = game.users.get(userId);
        return user && !user.isGM && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
      });
  }

  /**
   * Process a single actor and return array of actor entries (including tokens)
   * @param {Actor} actor - The actor to process
   * @param {Scene} currentScene - Current active scene
   * @param {RollRequestsMenu} menu - Menu instance
   * @param {boolean} isPlayerOwned - Whether the actor is player-owned
   * @returns {Array} Array of actor data entries
   */
  static async processActor(actor, currentScene, menu, isPlayerOwned) {
    if (ActorStatusUtil.isBlocked(actor)) {
      return [];
    }

    const SETTINGS = getSettings();
    const showOnlyPCsWithToken = SettingsUtil.get(SETTINGS.showOnlyPCsWithToken?.tag);
    const isFavorite = ActorStatusUtil.isFavorite(actor);
    const tokensInScene = currentScene?.tokens.filter(token => token.actorId === actor.id) || [];
    
    const actorEntries = [];

    if (isPlayerOwned) {
      if (isFavorite) {
        actorEntries.push(...this.processFavoriteActor(actor, tokensInScene, menu));
      } else if (showOnlyPCsWithToken) {
        actorEntries.push(...this.processTokenOnlyActor(actor, tokensInScene, menu));
      } else {
        actorEntries.push(...this.processRegularActor(actor, tokensInScene, menu));
      }
    } else {
      if (isFavorite) {
        actorEntries.push(...this.processFavoriteActor(actor, tokensInScene, menu));
      } else {
        actorEntries.push(...this.processTokenOnlyActor(actor, tokensInScene, menu));
      }
    }

    return actorEntries;
  }

  /**
   * Process a favorite actor (always show, with or without tokens)
   * @param {Actor} actor - The actor
   * @param {TokenDocument[]} tokensInScene - Tokens for this actor in current scene
   * @param {RollRequestsMenu} menu - Menu instance
   * @returns {Array} Array of actor data entries
   */
  static processFavoriteActor(actor, tokensInScene, menu) {
    const actorEntries = [];
    
    if (tokensInScene.length > 0) {
      tokensInScene.forEach(tokenDoc => {
        const actorData = this.createActorData(actor, tokenDoc, menu);
        actorData.isFavorite = true;
        actorEntries.push(actorData);
      });
    } else {
      const actorData = this.createActorData(actor, null, menu);
      actorData.isFavorite = true;
      actorEntries.push(actorData);
    }
    
    return actorEntries;
  }

  /**
   * Process an actor that only shows if it has tokens
   * @param {Actor} actor - The actor
   * @param {TokenDocument[]} tokensInScene - Tokens for this actor in current scene
   * @param {RollRequestsMenu} menu - Menu instance
   * @returns {Array} Array of actor data entries
   */
  static processTokenOnlyActor(actor, tokensInScene, menu) {
    const actorEntries = [];
    
    if (tokensInScene.length > 0) {
      tokensInScene.forEach(tokenDoc => {
        const actorData = this.createActorData(actor, tokenDoc, menu);
        actorEntries.push(actorData);
      });
    }
    
    return actorEntries;
  }

  /**
   * Process a regular actor (show both with and without tokens)
   * @param {Actor} actor - The actor
   * @param {TokenDocument[]} tokensInScene - Tokens for this actor in current scene
   * @param {RollRequestsMenu} menu - Menu instance
   * @returns {Array} Array of actor data entries
   */
  static processRegularActor(actor, tokensInScene, menu) {
    const actorEntries = [];
    
    if (tokensInScene.length > 0) {
      tokensInScene.forEach(tokenDoc => {
        const actorData = this.createActorData(actor, tokenDoc, menu);
        actorEntries.push(actorData);
      });
    } else {
      const actorData = this.createActorData(actor, null, menu);
      actorEntries.push(actorData);
    }
    
    return actorEntries;
  }

  /**
   * Create actor data object for template rendering
   * @param {Actor} actor - The actor
   * @param {TokenDocument|null} token - The token document, if any
   * @param {RollRequestsMenu} menu - Menu instance
   * @returns {Object} Actor data object
   */
  static createActorData(actor, token, menu) {
    const actorForStats = token?.actor || actor;
    const hpData = RollMenuActorUtil.getActorHPData(actorForStats);
    
    return {
      id: actor.id,
      uuid: actor.uuid,
      name: token ? token.name : actor.name,
      img: actor.img,
      selected: menu.selectedActors.has(token?.id || actor.id),
      crlngnStats: RollMenuActorUtil.getActorStats(actorForStats),
      hpPercent: hpData.hpPercent,
      hpColor: hpData.hpColor,
      tokenId: token?.id || null,
      isToken: !!token,
      uniqueId: token?.id || actor.id
    };
  }

  /**
   * Build request types for the accordion
   * @param {RollRequestsMenu} menu - Menu instance
   * @returns {Array} Array of request type objects
   */
  static buildRequestTypes(menu) {
    const requestTypes = [];
    
    for (const [key, option] of Object.entries(MODULE.ROLL_REQUEST_OPTIONS)) {
      const requestType = {
        id: key,
        name: game.i18n.localize(`FLASH_ROLLS.rollTypes.${option.name}`) || option.label,
        rollable: option.subList == null,
        hasSubList: !!option.subList,
        selected: menu.selectedRequestType === key, 
        expanded: menu.accordionStates[key] ?? false,
        subItems: []
      };
      
      if (option.subList) {
        requestType.subItems = buildRollTypes(key, menu.selectedActors);
      }
      
      requestTypes.push(requestType);
    }
    
    return requestTypes;
  }
}