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
   * Initialize the group token tracker by setting up hooks and wrapping necessary methods.
   * This should be called once during module initialization.
   */
  static initialize() {
    LogUtil.log('GroupTokenTracker.initialize');

    this.setupPlaceMembersTracking();

    Hooks.on('createToken', this.onCreateToken.bind(this));
    Hooks.on('deleteToken', this.onDeleteToken.bind(this));
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

    // Monitor for when token placement UI starts (when tokens start being placed)
    // After a short delay, set isPlacing to true to capture the placement operation
    setTimeout(() => {
      const placement = this.pendingPlacements.get(groupActor.id);
      if (placement) {
        placement.isPlacing = true;
        LogUtil.log(`GroupTokenTracker: Token placement phase active for group ${groupActor.name}`);
      }
    }, 100);

    // Set a longer timeout for cleanup in case user takes time placing tokens
    setTimeout(() => {
      const placement = this.pendingPlacements.get(groupActor.id);
      if (placement && placement.timestamp === this.pendingPlacements.get(groupActor.id)?.timestamp) {
        LogUtil.log(`GroupTokenTracker: Timeout reached for group ${groupActor.name}, cleaning up`);
        this.pendingPlacements.delete(groupActor.id);
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
    if (userId !== game.user.id || !game.user.isGM) return;

    // Only process tokens that were marked as coming from group placement
    const fromGroupPlacement = tokenDoc.getFlag(MODULE_ID, 'fromGroupPlacement');
    const groupId = tokenDoc.getFlag(MODULE_ID, 'groupId');

    if (!fromGroupPlacement || !groupId) return;

    const placement = this.pendingPlacements.get(groupId);
    if (!placement) return;

    const actorId = tokenDoc.actorId;
    LogUtil.log(`GroupTokenTracker: Associating token ${tokenDoc.id} with group ${groupId}`);

    const currentAssociations = placement.groupActor.getFlag(MODULE_ID, 'tokenAssociations') || {};

    if (!currentAssociations[actorId]) {
      currentAssociations[actorId] = [];
    }

    if (!currentAssociations[actorId].includes(tokenDoc.id)) {
      currentAssociations[actorId].push(tokenDoc.id);

      await placement.groupActor.setFlag(MODULE_ID, 'tokenAssociations', currentAssociations);

      // Remove the temporary fromGroupPlacement flag, keep only groupId
      await tokenDoc.unsetFlag(MODULE_ID, 'fromGroupPlacement');

      placement.placedTokenCount++;

      LogUtil.log(`GroupTokenTracker: Updated tokenAssociations for group ${placement.groupActor.name}`, {
        associations: currentAssociations,
        placedCount: placement.placedTokenCount,
        expectedCount: placement.expectedTokenCount
      });

      // Check if all expected tokens have been placed
      if (placement.placedTokenCount >= placement.expectedTokenCount) {
        placement.isPlacing = false;  // Stop marking new tokens as from this placement
        LogUtil.log(`GroupTokenTracker: All tokens placed for group ${placement.groupActor.name}, cleaning up`);
        this.pendingPlacements.delete(groupId);
      }
    }
  }

  /**
   * Handle token deletion to remove it from group associations.
   * When a token is deleted, check if it has a groupId flag indicating it belongs to a group.
   * If so, remove it from the group's tokenAssociations to keep the associations clean.
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
    const tokenId = tokenDoc.id;

    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociations');
    if (!associations || !associations[actorId]) return;

    const tokenIndex = associations[actorId].indexOf(tokenId);
    if (tokenIndex === -1) return;

    LogUtil.log(`GroupTokenTracker: Removing deleted token ${tokenId} from group ${groupId}`);

    associations[actorId].splice(tokenIndex, 1);

    if (associations[actorId].length === 0) {
      delete associations[actorId];
    }

    if (Object.keys(associations).length === 0) {
      await groupActor.unsetFlag(MODULE_ID, 'tokenAssociations');
    } else {
      await groupActor.setFlag(MODULE_ID, 'tokenAssociations', associations);
    }
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
   * Clear associations for tokens that no longer exist in the current scene.
   * This maintenance function ensures the tokenAssociations flag doesn't contain
   * references to tokens that have been deleted or moved to other scenes.
   * Should be called periodically or when switching scenes.
   *
   * @param {Actor} groupActor - The group actor to clean
   */
  static async cleanupInvalidTokens(groupActor) {
    if (groupActor.type !== 'group' && groupActor.type !== 'encounter') return;

    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociations');
    if (!associations) return;

    const scene = game.scenes.active;
    if (!scene) return;

    let hasChanges = false;
    const cleanedAssociations = {};

    for (const [actorId, tokenIds] of Object.entries(associations)) {
      const validTokenIds = tokenIds.filter(tokenId => {
        const token = scene.tokens.get(tokenId);
        return token && token.actorId === actorId;
      });

      if (validTokenIds.length > 0) {
        cleanedAssociations[actorId] = validTokenIds;
      }

      if (validTokenIds.length !== tokenIds.length) {
        hasChanges = true;
      }
    }

    if (hasChanges) {
      await groupActor.setFlag(MODULE_ID, 'tokenAssociations', cleanedAssociations);
      LogUtil.log(`GroupTokenTracker: Cleaned invalid tokens for group ${groupActor.name}`);
    }
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
   * Get all tokens associated with a group actor in the current scene.
   * Returns a map of actor IDs to their associated token documents.
   *
   * @param {Actor} groupActor - The group actor
   * @returns {Map<string, TokenDocument[]>} Map of actor IDs to token documents
   */
  static getGroupTokens(groupActor) {
    const associations = groupActor.getFlag(MODULE_ID, 'tokenAssociations') || {};
    const scene = game.scenes.active;
    const result = new Map();

    if (!scene) return result;

    for (const [actorId, tokenIds] of Object.entries(associations)) {
      const tokens = tokenIds
        .map(id => scene.tokens.get(id))
        .filter(token => token && token.actorId === actorId);

      if (tokens.length > 0) {
        result.set(actorId, tokens);
      }
    }

    return result;
  }
}