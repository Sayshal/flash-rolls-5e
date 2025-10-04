import { MODULE_ID } from '../../constants/General.mjs';
import { LogUtil } from '../utils/LogUtil.mjs';
import { HOOKS_CORE } from '../../constants/Hooks.mjs';

/**
 * Tracks token placement from group actors and maintains tokenAssociations.
 * This manager handles the association between group/encounter actors and their member tokens
 * when placed on the scene via the "Place Members" button.
 */
export class GroupTokenTracker {
  /**
   * Track of pending group token placements
   * @type {Map<string, {groupActor: Actor, memberActorIds: string[]}>}
   */
  static pendingPlacements = new Map();

  /**
   * Cache for associations being built during active placement operations
   * Prevents race conditions when multiple tokens are created simultaneously
   * @type {Map<string, Object>}
   */
  static activeAssociations = new Map();

  /**
   * Initialize the group token tracker by setting up hooks and wrapping necessary methods.
   * This should be called once during module initialization.
   */
  static initialize() {
    LogUtil.log('GroupTokenTracker.initialize');

    this.setupPlaceMembersTracking();

    Hooks.on(HOOKS_CORE.CREATE_TOKEN, this.onCreateToken.bind(this));
    Hooks.on(HOOKS_CORE.DELETE_TOKEN, this.onDeleteToken.bind(this));

    if (game.user.isGM) {
      this.migrateLegacyAssociationsForAllGroups();
    }
  }

  /**
   * Migrate legacy associations for all group actors
   */
  static async migrateLegacyAssociationsForAllGroups() {
    // Check if migration has already been completed (with fallback if setting doesn't exist yet)
    let migrationCompleted = false;
    try {
      migrationCompleted = game.settings.get(MODULE_ID, 'legacyTokenAssociationsMigrated');
    } catch (error) {
      LogUtil.log('GroupTokenTracker: Migration setting not yet registered, proceeding with migration check');
    }

    if (migrationCompleted) {
      LogUtil.log('GroupTokenTracker: Legacy migration already completed globally');
      return;
    }

    const hasLegacyActors = game.actors.some(actor =>
      (actor.type === 'group' || actor.type === 'encounter') &&
      actor.getFlag(MODULE_ID, 'tokenAssociations') &&
      !actor.getFlag(MODULE_ID, 'tokenAssociationsByScene')
    );

    if (!hasLegacyActors) {
      LogUtil.log('GroupTokenTracker: No legacy associations to migrate, setting global flag');
      try {
        await game.settings.set(MODULE_ID, 'legacyTokenAssociationsMigrated', true);
      } catch (error) {
        LogUtil.log('GroupTokenTracker: Could not set migration flag, setting may not be registered yet');
      }
      return;
    }

    const groupActors = game.actors.filter(actor =>
      (actor.type === 'group' || actor.type === 'encounter') &&
      actor.getFlag(MODULE_ID, 'tokenAssociations') &&
      !actor.getFlag(MODULE_ID, 'tokenAssociationsByScene')
    );

    for (const groupActor of groupActors) {
      await this.migrateLegacyAssociations(groupActor);
    }

    try {
      await game.settings.set(MODULE_ID, 'legacyTokenAssociationsMigrated', true);
      LogUtil.log(`GroupTokenTracker: Migrated legacy associations for ${groupActors.length} group actors and set global completion flag`);
    } catch (error) {
      LogUtil.log(`GroupTokenTracker: Migrated legacy associations for ${groupActors.length} group actors but could not set completion flag`);
    }
  }

  /**
   * Set up tracking for when the placeMembers action is triggered from group sheets.
   * This hooks into both the button clicks and token creation to track tokens that are
   * specifically created from the placeMembers operation, not manual token placement.
   */
  static setupPlaceMembersTracking() {
    Hooks.on(HOOKS_CORE.PRE_CREATE_TOKEN, (tokenDoc, data, options, userId) => {
      if (userId !== game.user.id || !game.user.isGM) return;
      LogUtil.log('preCreateToken',[tokenDoc, data, options, userId])

      for (const [groupId, placement] of this.pendingPlacements.entries()) {
        if (placement.memberActorIds.includes(data.actorId) && placement.isPlacing) {
          tokenDoc.updateSource({
            flags: {
              [MODULE_ID]: {
                groupId: groupId,
                fromGroupPlacement: true
              }
            }
          });
        }
      }
    });

    Hooks.on(HOOKS_CORE.RENDER_APPLICATION_V2, (app, element, options) => {
      if (!app.document || (app.document.type !== 'group' && app.document.type !== 'encounter')) return;

      const placeMembersButton = element.querySelector('[data-action="placeMembers"]');
      if (!placeMembersButton) return;

      placeMembersButton.removeEventListener('click', this._handlePlaceMembersClick);
      placeMembersButton._groupActor = app.document;
      placeMembersButton.addEventListener('click', this._handlePlaceMembersClick.bind(this));
    });

    Hooks.on(HOOKS_CORE.RENDER_APPLICATION, (app, html, data) => {
      if (!app.actor || (app.actor.type !== 'group' && app.actor.type !== 'encounter')) return;

      const placeMembersButton = html.find('[data-action="placeMembers"]');
      if (placeMembersButton.length === 0) return;

      placeMembersButton.off('click.groupTokenTracker');
      placeMembersButton.on('click.groupTokenTracker', async () => {
        await this._trackPlaceMembers(app.actor);
      });
    });
  }

  /**
   * Handle the placeMembers button click event.
   * Tracks which group is placing tokens so we can associate them when they're created.
   *
   * @param {Event} event - The click event
   */
  static async _handlePlaceMembersClick(event) {
    const groupActor = event.currentTarget._groupActor;
    LogUtil.log('GroupTokenTracker: placeMembers clicked', [groupActor.name, groupActor, event]);
    if (!groupActor) return;
    await this._trackPlaceMembers(groupActor);
  }

  /**
   * Track a placeMembers operation for a group actor.
   * Stores information about which actors will be placed so we can associate the tokens when created.
   * Sets isPlacing flag to true initially, which gets set to false once TokenPlacement starts.
   * Only tokens created while isPlacing=true will be associated with the group.
   *
   * @param {Actor} groupActor - The group actor placing members
   */
  static async _trackPlaceMembers(groupActor) {
    LogUtil.log('GroupTokenTracker: placeMembers clicked for', groupActor.name);

    const members = await groupActor.system.getPlaceableMembers();
    const memberActorIds = members.map(m => m.actor.id);
    const expectedTokenCount = members.reduce((sum, m) => {
      const quantity = m.quantity?.value || 1;
      return sum + quantity;
    }, 0);

    this.pendingPlacements.set(groupActor.id, {
      groupActor: groupActor,
      memberActorIds: memberActorIds,
      expectedTokenCount: expectedTokenCount,
      placedTokenCount: 0,
      timestamp: Date.now(),
      isPlacing: true  // Flag to track active placement phase
    });

    const currentFlag = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {};
    this.activeAssociations.set(groupActor.id, JSON.parse(JSON.stringify(currentFlag)));

    setTimeout(() => {
      const placement = this.pendingPlacements.get(groupActor.id);
      if (placement) {
        placement.isPlacing = true;
        LogUtil.log(`GroupTokenTracker: Token placement phase active for group ${groupActor.name}`);
      }
    }, 100);
    
    setTimeout(() => {
      const placement = this.pendingPlacements.get(groupActor.id);
      if (placement && placement.timestamp === this.pendingPlacements.get(groupActor.id)?.timestamp) {
        LogUtil.log(`GroupTokenTracker: Timeout reached for group ${groupActor.name}, cleaning up`);
        this.pendingPlacements.delete(groupActor.id);
        this.activeAssociations.delete(groupActor.id); // Clean up the cache
      }
    }, 120000); // 2 minutes
  }

  /**
   * Handle token creation to associate with groups.
   * Only processes tokens that have the fromGroupPlacement flag, which indicates they were
   * created from the placeMembers operation, not from manual drag-and-drop.
   * Tracks placed token count and removes pending placement when all expected tokens are placed.
   *
   * @param {TokenDocument} tokenDoc - The created token document
   * @param {object} options - Creation options
   * @param {string} userId - User who created the token
   */
  static async onCreateToken(tokenDoc, options, userId) {

    if (userId !== game.user.id) return;
    await this.cleanupCopiedTokenFlags(tokenDoc);
    if (!game.user.isGM) return;

    const fromGroupPlacement = tokenDoc.getFlag(MODULE_ID, 'fromGroupPlacement');
    const groupId = tokenDoc.getFlag(MODULE_ID, 'groupId');


    if (!fromGroupPlacement || !groupId) {
      await this.cleanupDanglingAssociations();
      return;
    }

    const placement = this.pendingPlacements.get(groupId);
    if (!placement) return;

    const actorId = tokenDoc.actorId;
    const sceneId = tokenDoc.parent.id;
    const tokenUuid = tokenDoc.uuid;
    const currentAssociations = this.activeAssociations.get(groupId) || {};

    if (!currentAssociations[sceneId]) {
      currentAssociations[sceneId] = {};
    }

    if (!currentAssociations[sceneId][actorId]) {
      currentAssociations[sceneId][actorId] = [];
    }

    const existingUuids = [...currentAssociations[sceneId][actorId]]; // Create a copy to avoid race conditions

    if (!existingUuids.includes(tokenUuid)) {
      existingUuids.push(tokenUuid);
      currentAssociations[sceneId][actorId] = existingUuids;

      this.activeAssociations.set(groupId, currentAssociations);
      await placement.groupActor.setFlag(MODULE_ID, 'tokenAssociationsByScene', currentAssociations);
      await tokenDoc.unsetFlag(MODULE_ID, 'fromGroupPlacement');

      placement.placedTokenCount++;
      
      if (placement.placedTokenCount >= placement.expectedTokenCount) {
        placement.isPlacing = false;  // Stop marking new tokens as from this placement
        LogUtil.log(`GroupTokenTracker: All tokens placed for group ${placement.groupActor.name}, cleaning up`);
        this.pendingPlacements.delete(groupId);
        this.activeAssociations.delete(groupId); // Clean up the cache
      }
    } else {
    }

    await this.cleanupDanglingAssociations();
  }

  /**
   * Handle token deletion to remove it from group associations.
   * When a token is deleted, check if it has a groupId flag indicating it belongs to a group.
   * If so, remove it from the group's tokenAssociationsByScene to keep the associations clean.
   *
   * @param {TokenDocument} tokenDoc - The deleted token document
   * @param {object} options - Deletion options
   * @param {string} userId - User who deleted the token
   */
  static async onDeleteToken(tokenDoc, options, userId) {
    const groupId = tokenDoc.getFlag(MODULE_ID, 'groupId');
    if (!groupId) return;

    const groupActor = game.actors.get(groupId);
    if (!groupActor) return;

    const actorId = tokenDoc.actorId;
    const sceneId = tokenDoc.parent.id;
    const tokenUuid = tokenDoc.uuid;

    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene');
    if (!associations || !associations[sceneId] || !associations[sceneId][actorId]) return;

    const tokenIndex = associations[sceneId][actorId].indexOf(tokenUuid);
    if (tokenIndex === -1) return;

    LogUtil.log(`GroupTokenTracker: Removing deleted token ${tokenUuid} from group ${groupId}`);

    associations[sceneId][actorId].splice(tokenIndex, 1);

    if (associations[sceneId][actorId].length === 0) {
      delete associations[sceneId][actorId];
    }

    if (Object.keys(associations[sceneId]).length === 0) {
      delete associations[sceneId];
    }

    if (Object.keys(associations).length === 0) {
      await groupActor.unsetFlag(MODULE_ID, 'tokenAssociationsByScene');
    } else {
      await groupActor.setFlag(MODULE_ID, 'tokenAssociationsByScene', associations);
    }

    // Also trigger cleanup of dangling associations
    await this.cleanupDanglingAssociations();
  }

  /**
   * Clean up old pending placements that are older than the timeout period.
   * This prevents memory leaks from placement operations that were started but never completed.
   * Called automatically after successful placement operations.
   */
  static cleanupOldPendingPlacements() {
    const now = Date.now();
    const timeout = 5000;

    for (const [groupId, placement] of this.pendingPlacements.entries()) {
      if (now - placement.timestamp > timeout) {
        LogUtil.log(`GroupTokenTracker: Cleaning up old pending placement for group ${groupId}`);
        this.pendingPlacements.delete(groupId);
      }
    }
  }

  /**
   * Clear associations for tokens that no longer exist in their respective scenes.
   * This maintenance function ensures the tokenAssociationsByScene flag doesn't contain
   * references to tokens that have been deleted or moved to other scenes.
   * Should be called periodically or when switching scenes.
   *
   * @param {Actor} groupActor - The group actor to clean
   */
  static async cleanupInvalidTokens(groupActor) {
    if (groupActor.type !== 'group' && groupActor.type !== 'encounter') return;

    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene');
    if (!associations) return;

    let hasChanges = false;
    const cleanedAssociations = {};

    for (const [sceneId, sceneAssociations] of Object.entries(associations)) {
      const scene = game.scenes.get(sceneId);
      if (!scene) {
        LogUtil.log(`GroupTokenTracker: Scene ${sceneId} no longer exists, removing associations`);
        hasChanges = true;
        continue;
      }

      const cleanedSceneAssociations = {};

      for (const [actorId, tokenUuids] of Object.entries(sceneAssociations)) {
        const validTokenUuids = tokenUuids.filter(tokenUuid => {
          try {
            const token = fromUuidSync(tokenUuid);
            return token && token.actorId === actorId && token.parent.id === sceneId;
          } catch (error) {
            LogUtil.log(`GroupTokenTracker: Invalid token UUID ${tokenUuid}, removing`);
            return false;
          }
        });

        if (validTokenUuids.length > 0) {
          cleanedSceneAssociations[actorId] = validTokenUuids;
        }

        if (validTokenUuids.length !== tokenUuids.length) {
          hasChanges = true;
        }
      }

      if (Object.keys(cleanedSceneAssociations).length > 0) {
        cleanedAssociations[sceneId] = cleanedSceneAssociations;
      }
    }

    if (hasChanges) {
      if (Object.keys(cleanedAssociations).length === 0) {
        await groupActor.unsetFlag(MODULE_ID, 'tokenAssociationsByScene');
      } else {
        await groupActor.setFlag(MODULE_ID, 'tokenAssociationsByScene', cleanedAssociations);
      }
      LogUtil.log(`GroupTokenTracker: Cleaned invalid tokens for group ${groupActor.name}`);
    }
  }

  /**
   * Clean up dangling token associations across all group actors.
   * This method checks all group/encounter actors and removes associations to tokens that no longer exist.
   * Called automatically when tokens are created or deleted to maintain data integrity.
   */
  static async cleanupDanglingAssociations() {
    const groupActors = game.actors.filter(actor =>
      (actor.type === 'group' || actor.type === 'encounter') &&
      actor.getFlag(MODULE_ID, 'tokenAssociationsByScene')
    );

    for (const groupActor of groupActors) {
      await this.cleanupInvalidTokens(groupActor);
    }

    LogUtil.log(`GroupTokenTracker: Cleaned dangling associations for ${groupActors.length} group actors`);
  }

  /**
   * Check if a token is associated with a group.
   * Utility method to determine if a given token belongs to a group actor.
   *
   * @param {TokenDocument} tokenDoc - The token to check
   * @returns {Actor|null} The group actor if the token is associated, null otherwise
   */
  static getGroupForToken(tokenDoc) {
    const groupId = tokenDoc.getFlag(MODULE_ID, 'groupId');
    if (!groupId) return null;

    return game.actors.get(groupId) || null;
  }

  /**
   * Get all tokens associated with a group actor in the specified scene.
   * Returns a map of actor IDs to their associated token documents.
   *
   * @param {Actor} groupActor - The group actor
   * @param {Scene} [scene] - The scene to get tokens from (defaults to active scene)
   * @returns {Map<string, TokenDocument[]>} Map of actor IDs to token documents
   */
  static getGroupTokens(groupActor, scene = null) {
    const targetScene = scene || game.scenes.active;
    const result = new Map();

    if (!targetScene) return result;

    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {};
    const sceneAssociations = associations[targetScene.id];

    if (!sceneAssociations) return result;

    for (const [actorId, tokenUuids] of Object.entries(sceneAssociations)) {
      const tokens = tokenUuids
        .map(uuid => {
          try {
            return fromUuidSync(uuid);
          } catch (error) {
            LogUtil.log(`GroupTokenTracker: Invalid token UUID ${uuid}`);
            return null;
          }
        })
        .filter(token => token && token.actorId === actorId && token.parent.id === targetScene.id);

      if (tokens.length > 0) {
        result.set(actorId, tokens);
      }
    }

    return result;
  }

  /**
   * Get all tokens associated with a group actor across all scenes.
   * Returns a map of scene IDs to maps of actor IDs to token documents.
   *
   * @param {Actor} groupActor - The group actor
   * @returns {Map<string, Map<string, TokenDocument[]>>} Map of scene IDs to actor token maps
   */
  static getAllGroupTokens(groupActor) {
    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene') || {};
    const result = new Map();

    for (const [sceneId, sceneAssociations] of Object.entries(associations)) {
      const scene = game.scenes.get(sceneId);
      if (!scene) continue;

      const sceneTokens = new Map();

      for (const [actorId, tokenUuids] of Object.entries(sceneAssociations)) {
        const tokens = tokenUuids
          .map(uuid => {
            try {
              return fromUuidSync(uuid);
            } catch (error) {
              return null;
            }
          })
          .filter(token => token && token.actorId === actorId);

        if (tokens.length > 0) {
          sceneTokens.set(actorId, tokens);
        }
      }

      if (sceneTokens.size > 0) {
        result.set(sceneId, sceneTokens);
      }
    }

    return result;
  }

  /**
   * Validate and clean up Flash Rolls 5e module flags from tokens that shouldn't have them.
   * This handles cases where tokens have inherited flags but aren't properly associated,
   * including copy-pasted tokens and orphaned associations.
   *
   * @param {TokenDocument} tokenDoc - The newly created token document
   */
  static async cleanupCopiedTokenFlags(tokenDoc) {
    const moduleFlags = tokenDoc.getFlag(MODULE_ID);
    if (!moduleFlags) return;

    const groupId = moduleFlags.groupId;
    const fromGroupPlacement = moduleFlags.fromGroupPlacement;

    // Skip validation if this is a legitimate group placement in progress
    if (fromGroupPlacement) return;

    let shouldCleanup = false;
    const reasons = [];

    // Check if token has groupId but isn't in any group's associations
    if (groupId) {
      const groupActor = game.actors.get(groupId);
      const sceneId = tokenDoc.parent.id;
      const tokenUuid = tokenDoc.uuid;

      if (!groupActor) {
        shouldCleanup = true;
        reasons.push('group actor no longer exists');
      } else {
        const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene');
        const isAssociated = associations?.[sceneId]?.[tokenDoc.actorId]?.includes(tokenUuid);

        if (!isAssociated) {
          shouldCleanup = true;
          reasons.push('not in group associations');
        }
      }
    }

    // Check for movement restrictions that might be inherited
    if (moduleFlags.movementRestriction && !groupId) {
      // Token has movement restriction but no group association
      // This suggests it inherited the flag from a copy operation
      shouldCleanup = true;
      reasons.push('orphaned movement restriction');
    }

    if (shouldCleanup) {
      LogUtil.log(`GroupTokenTracker: Cleaning up invalid module flags from token ${tokenDoc.name} (${tokenDoc.id})`);
      LogUtil.log(`GroupTokenTracker: Cleanup reasons:`, reasons);
      LogUtil.log(`GroupTokenTracker: Removing flags:`, Object.keys(moduleFlags));

      await tokenDoc.unsetFlag(MODULE_ID);
    }
  }

  /**
   * Add legacy support for migration from old tokenAssociations format
   * This method migrates old tokenAssociations data to the new tokenAssociationsByScene format
   * Searches all scenes to preserve tokens that may exist in inactive scenes
   *
   * @param {Actor} groupActor - The group actor to migrate
   */
  static async migrateLegacyAssociations(groupActor) {
    const legacyAssociations = groupActor.getFlag(MODULE_ID, 'tokenAssociations');
    const newAssociations = groupActor.getFlag(MODULE_ID, 'tokenAssociationsByScene');

    if (!legacyAssociations || newAssociations) return;

    LogUtil.log(`GroupTokenTracker: Migrating legacy associations for group ${groupActor.name}`);

    const migratedAssociations = {};
    let totalMigrated = 0;

    // Search all scenes for tokens matching the legacy token IDs
    for (const scene of game.scenes) {
      const sceneAssociations = {};

      for (const [actorId, tokenIds] of Object.entries(legacyAssociations)) {
        const validUuids = tokenIds
          .map(tokenId => {
            const token = scene.tokens.get(tokenId);
            return token && token.actorId === actorId ? token.uuid : null;
          })
          .filter(uuid => uuid !== null);

        if (validUuids.length > 0) {
          sceneAssociations[actorId] = validUuids;
          totalMigrated += validUuids.length;
        }
      }

      if (Object.keys(sceneAssociations).length > 0) {
        migratedAssociations[scene.id] = sceneAssociations;
      }
    }

    // Only save if we found tokens to migrate
    if (Object.keys(migratedAssociations).length > 0) {
      await groupActor.setFlag(MODULE_ID, 'tokenAssociationsByScene', migratedAssociations);
      LogUtil.log(`GroupTokenTracker: Migrated ${totalMigrated} tokens across ${Object.keys(migratedAssociations).length} scenes for group ${groupActor.name}`);
    } else {
      LogUtil.log(`GroupTokenTracker: No valid tokens found to migrate for group ${groupActor.name}`);
    }

    // Always remove legacy flag after migration attempt
    await groupActor.unsetFlag(MODULE_ID, 'tokenAssociations');
  }
}