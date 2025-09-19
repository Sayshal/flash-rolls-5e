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
    const groupActors = [];
    const currentScene = game.scenes.active;
    
    for (const actor of actors) {
      // Process group and encounter actors separately
      if (actor.type === 'group' || actor.type === 'encounter') {
        const groupEntries = await this.processGroupActor(actor, currentScene, menu);
        groupActors.push(...groupEntries);
        continue;
      }
      
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
    
    const currentActors = menu.currentTab === 'pc' ? pcActors : 
                          menu.currentTab === 'npc' ? npcActors : 
                          groupActors;
    const selectAllOn = currentActors.length > 0 && 
      currentActors.every(actor => menu.selectedActors.has(actor.uniqueId));
    
    const requestTypes = this.buildRequestTypes(menu);
    const rollTypes = buildRollTypes(menu.selectedRequestType, menu.selectedActors);
    const statusEffects = RollMenuStatusUtil.getStatusEffectsForTemplate();
    
    return {
      ...baseContext,
      actors: menu.currentTab === 'group' ? [] : currentActors,
      groups: menu.currentTab === 'group' ? currentActors : [],
      currentTab: menu.currentTab,
      isPCTab: menu.currentTab === 'pc',
      isNPCTab: menu.currentTab === 'npc',
      isGroupTab: menu.currentTab === 'group',
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
   * Process a group or encounter actor
   * @param {Actor} actor - The group/encounter actor to process
   * @param {Scene} currentScene - Current active scene
   * @param {RollRequestsMenu} menu - Menu instance
   * @returns {Array} Array of group actor data objects with members
   */
  static async processGroupActor(actor, currentScene, menu) {
    if (ActorStatusUtil.isBlocked(actor)) {
      return [];
    }

    const SETTINGS = getSettings();
    const showOnlyPCsWithToken = SettingsUtil.get(SETTINGS.showOnlyPCsWithToken?.tag);
    
    const tokensInScene = currentScene?.tokens.filter(token => token.actorId === actor.id) || [];
    const groupEntries = [];

    const members = [];
    let hasAnyMemberTokens = false;
    
    if (actor.type === 'group') {
      // Group type: members have direct actor references
      for (const member of actor.system.members || []) {
        if (member.actor && !ActorStatusUtil.isBlocked(member.actor)) {
          // Check for tokens of this member in the scene
          const memberTokens = currentScene?.tokens.filter(token => token.actorId === member.actor.id) || [];
          
          if (memberTokens.length > 0) {
            hasAnyMemberTokens = true;
            // Create entries for each token
            memberTokens.forEach(tokenDoc => {
              const memberData = this.createActorData(member.actor, tokenDoc, menu);
              members.push(memberData);
            });
          } else {
            // No tokens, create base actor entry
            const memberData = this.createActorData(member.actor, null, menu);
            members.push(memberData);
          }
        }
      }
    } else if (actor.type === 'encounter') {
      // Encounter type: members have UUIDs and quantities
      for (const member of actor.system.members || []) {
        try {
          const memberActor = await fromUuid(member.uuid);
          if (memberActor && !ActorStatusUtil.isBlocked(memberActor)) {
            // Check for tokens of this member in the scene
            const memberTokens = currentScene?.tokens.filter(token => token.actorId === memberActor.id) || [];
            
            if (memberTokens.length > 0) {
              hasAnyMemberTokens = true;
              // Create entries for each token
              memberTokens.forEach(tokenDoc => {
                const memberData = this.createActorData(memberActor, tokenDoc, menu);
                memberData.quantity = member.quantity?.value || 1;
                members.push(memberData);
              });
            } else {
              // No tokens, create base actor entry
              const memberData = this.createActorData(memberActor, null, menu);
              memberData.quantity = member.quantity?.value || 1;
              members.push(memberData);
            }
          }
        } catch (error) {
          LogUtil.log(`Failed to resolve member UUID: ${member.uuid}`, [error]);
        }
      }
    }
    
    // Check if group should be filtered out based on showOnlyPCsWithToken setting
    if (showOnlyPCsWithToken) {
      const groupHasTokens = tokensInScene.length > 0;
      if (!groupHasTokens && !hasAnyMemberTokens) {
        // Group has no tokens and no members have tokens, filter it out
        return [];
      }
    }
    
    // Process group similar to regular actors - create entries for tokens if they exist
    if (tokensInScene.length > 0) {
      tokensInScene.forEach(tokenDoc => {
        const groupData = this.createActorData(actor, tokenDoc, menu);
        groupData.members = members;
        groupData.isGroup = true;
        groupData.isExpanded = menu.groupExpansionStates?.[actor.id] ?? false;
        groupData.memberImages = members.slice(0, 4).map(m => m.img);
        
        // Group is considered selected if any of its members are selected
        groupData.selected = members.length > 0 && members.some(member => 
          menu.selectedActors.has(member.uniqueId)
        );
        
        groupEntries.push(groupData);
      });
    } else {
      // No tokens in scene, create base group entry
      const groupData = this.createActorData(actor, null, menu);
      groupData.members = members;
      groupData.isGroup = true;
      groupData.isExpanded = menu.groupExpansionStates?.[actor.id] ?? false;
      groupData.memberImages = members.slice(0, 4).map(m => m.img);
      
      // Group is considered selected if any of its members are selected
      groupData.selected = members.length > 0 && members.some(member => 
        menu.selectedActors.has(member.uniqueId)
      );
      
      groupEntries.push(groupData);
    }
    
    return groupEntries;
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