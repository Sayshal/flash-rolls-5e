import { MODULE, MODULE_ID } from '../../constants/General.mjs';
import { LogUtil } from '../LogUtil.mjs';
import { SettingsUtil } from '../SettingsUtil.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import { buildRollTypes } from '../helpers/Helpers.mjs';
import { RollMenuActorUtil } from './RollMenuActorUtil.mjs';
import { ActorStatusUtil } from '../ActorStatusUtil.mjs';
import { RollMenuStatusUtil } from './RollMenuStatusUtil.mjs';
import { RollMenuStateUtil } from './RollMenuStateUtil.mjs';

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

    // Apply actor filters if any are active
    const actorFilters = menu.actorFilters || {};
    if (actorFilters.inCombat || actorFilters.visible || actorFilters.notDead) {
      // Filter PC actors
      const filteredPCActors = pcActors.filter(actorData => {
        const actor = game.actors.get(actorData.id);
        if (!actor) return false;

        // Get token document if this is a token-based entry
        const token = actorData.tokenId ? currentScene?.tokens.get(actorData.tokenId) : null;
        return RollMenuStateUtil.doesActorPassFilters(actor, actorFilters, token);
      });
      pcActors.length = 0;
      pcActors.push(...filteredPCActors);

      // Filter NPC actors
      const filteredNPCActors = npcActors.filter(actorData => {
        const actor = game.actors.get(actorData.id);
        if (!actor) return false;

        // Get token document if this is a token-based entry
        const token = actorData.tokenId ? currentScene?.tokens.get(actorData.tokenId) : null;
        return RollMenuStateUtil.doesActorPassFilters(actor, actorFilters, token);
      });
      npcActors.length = 0;
      npcActors.push(...filteredNPCActors);

      // Filter group actors (both the groups themselves and their members)
      const filteredGroupActors = groupActors.filter(groupData => {
        if (groupData.isGroup) {
          // For groups, check if the group itself or any of its members pass the filter
          const groupActor = game.actors.get(groupData.id);
          const groupToken = groupData.tokenId ? currentScene?.tokens.get(groupData.tokenId) : null;
          const groupPasses = groupActor && RollMenuStateUtil.doesActorPassFilters(groupActor, actorFilters, groupToken);

          // Also check if any members pass the filter
          if (groupData.members) {
            groupData.members = groupData.members.filter(memberData => {
              const memberActor = game.actors.get(memberData.id);
              if (!memberActor) return false;

              // Get member token document if this is a token-based entry
              const memberToken = memberData.tokenId ? currentScene?.tokens.get(memberData.tokenId) : null;
              return RollMenuStateUtil.doesActorPassFilters(memberActor, actorFilters, memberToken);
            });

            // Show group if either the group itself passes or it has members that pass
            return groupPasses || groupData.members.length > 0;
          }

          return groupPasses;
        } else {
          // Regular actor processing for non-group entries
          const actor = game.actors.get(groupData.id);
          if (!actor) return false;

          // Get token document if this is a token-based entry
          const token = groupData.tokenId ? currentScene?.tokens.get(groupData.tokenId) : null;
          return RollMenuStateUtil.doesActorPassFilters(actor, actorFilters, token);
        }
      });
      groupActors.length = 0;
      groupActors.push(...filteredGroupActors);
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
    let selectAllOn = false;
    if (currentActors.length > 0) {
      if (menu.currentTab === 'group') {
        // For groups tab, check if all visible group members are selected
        const allMembers = [];
        currentActors.forEach(groupActor => {
          if (groupActor.isGroup && groupActor.members) {
            allMembers.push(...groupActor.members);
          }
        });
        selectAllOn = allMembers.length > 0 && 
          allMembers.every(member => menu.selectedActors.has(member.uniqueId));
      } else {
        // For PC/NPC tabs, use the original logic
        selectAllOn = currentActors.every(actor => menu.selectedActors.has(actor.uniqueId));
      }
    }
    
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
   * Process a group or encounter actor for display in the Flash Rolls menu.
   *
   * This method converts a D&D 5e group/encounter actor into Flash Rolls menu data.
   * The result is an array of group data objects that can be displayed in the Flash Rolls menu,
   * with each group containing its member actors properly associated with specific tokens.
   *
   * @param {Actor} actor - The group/encounter actor to process
   * @param {Scene} currentScene - Current active scene
   * @param {RollRequestsMenu} menu - Menu instance for state and settings
   * @returns {Array} Array of group actor data objects with members for menu display
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
      // Check if we have stored token associations
      const tokenAssociations = actor.getFlag(MODULE_ID, 'tokenAssociations') || {};

      for (const member of actor.system.members || []) {
        if (member.actor && !ActorStatusUtil.isBlocked(member.actor)) {
          const memberActorId = member.actor.id;
          const associatedTokenIds = tokenAssociations[memberActorId] || [];

          if (associatedTokenIds.length > 0) {
            // Use specific tokens from associations by finding them in current scene
            for (const tokenId of associatedTokenIds) {
              const tokenDoc = currentScene?.tokens.get(tokenId);
              if (tokenDoc && tokenDoc.actorId === member.actor.id) {
                hasAnyMemberTokens = true;
                const memberData = this.createActorData(member.actor, tokenDoc, menu);
                members.push(memberData);
              } else {
                // Token not found in current scene, use base actor
                const memberData = this.createActorData(member.actor, null, menu);
                members.push(memberData);
              }
            }
          } else {
            // No token associations, fall back to original behavior
            const memberTokens = currentScene?.tokens.filter(token => token.actorId === member.actor.id) || [];

            if (memberTokens.length > 0) {
              hasAnyMemberTokens = true;
              memberTokens.forEach(tokenDoc => {
                const memberData = this.createActorData(member.actor, tokenDoc, menu);
                members.push(memberData);
              });
            } else {
              const memberData = this.createActorData(member.actor, null, menu);
              members.push(memberData);
            }
          }
        }
      }
    } else if (actor.type === 'encounter') {
      // Encounter type: members have UUIDs and quantities
      // Check if we have stored token associations
      const tokenAssociations = actor.getFlag(MODULE_ID, 'tokenAssociations') || {};

      for (const member of actor.system.members || []) {
        try {
          const memberActor = await fromUuid(member.uuid);
          if (memberActor && !ActorStatusUtil.isBlocked(memberActor)) {
            const memberActorId = memberActor.id;
            const associatedTokenIds = tokenAssociations[memberActorId] || [];

            if (associatedTokenIds.length > 0) {
              // Use specific tokens from associations by finding them in current scene
              for (const tokenId of associatedTokenIds) {
                const tokenDoc = currentScene?.tokens.get(tokenId);
                if (tokenDoc && tokenDoc.actorId === memberActor.id) {
                  hasAnyMemberTokens = true;
                  const memberData = this.createActorData(memberActor, tokenDoc, menu);
                  memberData.quantity = 1; // Each specific token has quantity 1
                  members.push(memberData);
                } else {
                  // Token not found in current scene, use base actor
                  const memberData = this.createActorData(memberActor, null, menu);
                  memberData.quantity = 1;
                  members.push(memberData);
                }
              }
            } else {
              // No token associations, fall back to original behavior
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
        
        // Calculate group selection state: true (all), false (none), partial (some)
        const selectedMembers = members.filter(member => menu.selectedActors.has(member.uniqueId));
        if (selectedMembers.length === 0) {
          groupData.selected = 'false';
        } else if (selectedMembers.length === members.length) {
          groupData.selected = 'true';
        } else {
          groupData.selected = 'partial';
        }
        
        groupEntries.push(groupData);
      });
    } else {
      // No tokens in scene, create base group entry
      const groupData = this.createActorData(actor, null, menu);
      groupData.members = members;
      groupData.isGroup = true;
      groupData.isExpanded = menu.groupExpansionStates?.[actor.id] ?? false;
      groupData.memberImages = members.slice(0, 4).map(m => m.img);
      
      // Calculate group selection state: true (all), false (none), partial (some)
      const selectedMembers = members.filter(member => menu.selectedActors.has(member.uniqueId));
      if (selectedMembers.length === 0) {
        groupData.selected = 'false';
      } else if (selectedMembers.length === members.length) {
        groupData.selected = 'true';
      } else {
        groupData.selected = 'partial';
      }
      
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