import { LogUtil } from './LogUtil.mjs';
import { getActorData } from '../helpers/Helpers.mjs';
import { MODULE_ID } from '../../constants/General.mjs';
import { SettingsUtil } from './SettingsUtil.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import RollRequestsMenu from '../ui/RollRequestsMenu.mjs';

/**
 * Manages token movement restrictions for Flash Token Actions 5e
 * Provides player-only movement blocking while preserving GM override capabilities
 */
export class TokenMovementManager {

  /**
   * Toggle movement restriction for selected actors
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static async toggleMovementForSelected(menu) {
    if (menu.selectedActors.size === 0) {
      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noValidActorsSelected"));
      return;
    }

    const tokens = [];

    for (const uniqueId of menu.selectedActors) {
      const actor = getActorData(uniqueId);
      if (!actor) {
        LogUtil.log(`TokenMovementManager: No actor found for uniqueId: ${uniqueId}`);
        continue;
      }

      const actorTokens = this.getTokensForActor(actor.id, uniqueId);
      LogUtil.log(`TokenMovementManager: Found ${actorTokens.length} tokens for actor ${actor.name} (${actor.id})`);
      tokens.push(...actorTokens);
    }

    if (tokens.length === 0) {
      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noTokensForMovementLock"));
      return;
    }

    // Get movement status for all tokens
    const movementStatus = this.getMovementStatus(tokens);

    // Majority rule: if more than half are restricted, unlock all; otherwise lock all
    const shouldLock = movementStatus.restricted < movementStatus.unrestricted;

    LogUtil.log(`TokenMovementManager: Before toggle - ${movementStatus.restricted} restricted, ${movementStatus.unrestricted} unrestricted, shouldLock: ${shouldLock}`);

    await this.setMovementRestriction(tokens, shouldLock);

    RollRequestsMenu.refreshIfOpen();

    const messageKey = shouldLock ? "movementLocked" : "movementUnlocked";
    ui.notifications.info(game.i18n.format(`FLASH_ROLLS.notifications.${messageKey}`, {
      count: tokens.length
    }));

    LogUtil.log(`TokenMovementManager: ${shouldLock ? 'Locked' : 'Unlocked'} movement for ${tokens.length} tokens`);
  }


  /**
   * Set movement restriction for selected actors
   * @param {RollRequestsMenu} menu - The menu instance
   * @param {boolean} restricted - Whether to restrict movement
   * @private
   */
  static async _setMovementForSelected(menu, restricted) {
    if (menu.selectedActors.size === 0) {
      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noValidActorsSelected"));
      return;
    }

    const tokens = [];

    for (const uniqueId of menu.selectedActors) {
      const actor = getActorData(uniqueId);
      if (!actor) continue;

      const actorTokens = this.getTokensForActor(actor.id, uniqueId);
      tokens.push(...actorTokens);
    }

    if (tokens.length === 0) {
      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noTokensForMovementLock"));
      return;
    }

    await this.setMovementRestriction(tokens, restricted);

    const messageKey = restricted ? "movementLocked" : "movementUnlocked";
    ui.notifications.info(game.i18n.format(`FLASH_ROLLS.notifications.${messageKey}`, {
      count: tokens.length
    }));

    LogUtil.log(`TokenMovementManager: ${restricted ? 'Locked' : 'Unlocked'} movement for ${tokens.length} tokens`);
  }

  /**
   * Get tokens for a specific actor
   * @param {string} actorId - The actor ID
   * @param {string} uniqueId - The unique ID (could be token ID or actor ID)
   * @returns {TokenDocument[]} Array of token documents
   */
  static getTokensForActor(actorId, uniqueId) {
    const tokens = [];
    const currentScene = game.scenes.current;

    if (!currentScene) return tokens;

    if (uniqueId !== actorId) {
      const tokenDoc = currentScene.tokens.get(uniqueId);
      if (tokenDoc && tokenDoc.actorId === actorId) {
        tokens.push(tokenDoc);
      }
    } else {
      const actorTokens = currentScene.tokens.filter(token => token.actorId === actorId);
      tokens.push(...actorTokens);
    }

    return tokens;
  }

  /**
   * Set movement restriction on tokens
   * @param {TokenDocument[]} tokens - Array of token documents
   * @param {boolean} restricted - Whether to restrict movement
   */
  static async setMovementRestriction(tokens, restricted) {
    const updates = tokens.map(token => {
      let updateData;

      if (restricted) {
        // Setting restriction
        const movementRestrictionValue = {
          type: "manual",
          enabled: true,
          source: "gm",
          metadata: {
            restrictedAt: Date.now(),
            restrictedBy: game.user.id
          }
        };

        updateData = {
          _id: token.id,
          flags: {
            [MODULE_ID]: {
              movementRestriction: movementRestrictionValue
            }
          }
        };
      } else {
        updateData = {
          _id: token.id,
          [`flags.${MODULE_ID}.-=movementRestriction`]: null
        };
      }

      return updateData;
    });

    if (updates.length > 0) {
      try {
        LogUtil.log(`TokenMovementManager: Updating ${updates.length} tokens with updates:`, updates);
        await game.scenes.current.updateEmbeddedDocuments("Token", updates);
        LogUtil.log(`TokenMovementManager: Successfully updated ${updates.length} tokens with movement restriction: ${restricted}`);

        // Verify the update worked - need to get fresh token documents
        for (const tokenUpdate of updates) {
          const freshToken = game.scenes.current.tokens.get(tokenUpdate._id);
          if (freshToken) {
            const newRestriction = freshToken.getFlag(MODULE_ID, 'movementRestriction');
            LogUtil.log(`TokenMovementManager: After update, token ${freshToken.name} restriction is:`, newRestriction);
          }
        }
      } catch (error) {
        LogUtil.error("TokenMovementManager: Failed to update token movement restrictions", [error]);
        ui.notifications.error("Failed to update token movement restrictions");
      }
    }
  }

  /**
   * Check if a token has movement restrictions
   * @param {TokenDocument} token - The token document
   * @returns {boolean} True if movement is restricted
   */
  static isMovementRestricted(token) {
    const restriction = token.getFlag(MODULE_ID, 'movementRestriction');
    return restriction?.enabled === true;
  }

  /**
   * Check if movement is allowed for a token and user
   * @param {TokenDocument} token - The token document
   * @param {User} user - The user attempting to move the token
   * @param {Object} updateData - The update data containing position changes
   * @returns {boolean} True if movement is allowed
   */
  static isMovementAllowed(token, user, updateData) {
    if (user.isGM) {
      return true;
    }

    const hasPositionChange = updateData.x !== undefined || updateData.y !== undefined;
    if (!hasPositionChange) {
      return true;
    }

    const restriction = token.getFlag(MODULE_ID, 'movementRestriction');
    if (!restriction?.enabled) {
      return true;
    }

    LogUtil.log(`TokenMovementManager: Movement blocked for token ${token.name} by user ${user.name}`);
    return false;
  }

  /**
   * Get movement restriction status for multiple tokens
   * @param {TokenDocument[]} tokens - Array of token documents
   * @returns {Object} Object with counts of restricted/unrestricted tokens
   */
  static getMovementStatus(tokens) {
    let restrictedCount = 0;
    let unrestrictedCount = 0;

    tokens.forEach(token => {
      if (this.isMovementRestricted(token)) {
        restrictedCount++;
      } else {
        unrestrictedCount++;
      }
    });

    return {
      restricted: restrictedCount,
      unrestricted: unrestrictedCount,
      total: tokens.length,
      hasRestricted: restrictedCount > 0,
      hasUnrestricted: unrestrictedCount > 0,
      allRestricted: restrictedCount === tokens.length,
      allUnrestricted: unrestrictedCount === tokens.length
    };
  }

  /**
   * Get the appropriate icon class based on movement status
   * @param {Object} status - Movement status object from getMovementStatus
   * @returns {string} FontAwesome icon class
   */
  static getStatusIcon(status) {
    if (status.allRestricted) {
      return 'fa-user-lock';
    } else if (status.allUnrestricted) {
      return 'fa-person-walking';
    } else {
      return 'fa-user-slash';
    }
  }

  /**
   * Clear all movement restrictions from tokens
   * @param {TokenDocument[]} tokens - Array of token documents
   */
  static async clearAllRestrictions(tokens) {
    await this.setMovementRestriction(tokens, false);
  }

  /**
   * Handle combat start - block movement for all combatants not on their turn
   * @param {Combat} combat - The combat instance
   * @param {object} updateData - Update data
   */
  static async onCombatStart(combat, updateData) {
    const SETTINGS = getSettings();
    const autoBlock = SettingsUtil.get(SETTINGS.autoBlockMovementInCombat?.tag);

    if (!autoBlock) return;

    LogUtil.log('TokenMovementManager: Combat started, applying movement restrictions');

    // Get current combatant
    const currentCombatant = combat.combatant;

    // Block all combatants except the current one
    const tokensToBlock = [];

    for (const combatant of combat.combatants) {
      if (combatant.id === currentCombatant?.id) continue;

      const token = combatant.token;
      if (token) {
        tokensToBlock.push(token);
      }
    }

    if (tokensToBlock.length > 0) {
      await this.setCombatMovementRestriction(tokensToBlock, true);
      LogUtil.log(`TokenMovementManager: Blocked movement for ${tokensToBlock.length} combatants`);
    }
  }

  /**
   * Handle turn change - unblock current combatant, block previous
   * @param {Combat} combat - The combat instance
   * @param {object} prior - The prior turn state
   * @param {object} current - The current turn state
   */
  static async onCombatTurnChange(combat, prior, current) {
    const SETTINGS = getSettings();
    const autoBlock = SettingsUtil.get(SETTINGS.autoBlockMovementInCombat?.tag);

    if (!autoBlock) return;

    LogUtil.log('TokenMovementManager: Combat turn changed',[combat, prior, current]);

    const currentCombatant = combat.combatant;
    LogUtil.log(`TokenMovementManager: Current combatant`, [currentCombatant]);

    // Update all combatants: block everyone except the current one
    for (const combatant of combat.combatants) {
      const token = combatant.token;
      if (!token) continue;

      const isCurrentTurn = combatant.tokenId === currentCombatant?.tokenId;
      const shouldRestrict = !isCurrentTurn;

      LogUtil.log(`TokenMovementManager: ${combatant.name} - isCurrentTurn: ${isCurrentTurn}, shouldRestrict: ${shouldRestrict}`, [combatant]);

      await this.setCombatMovementRestriction([token], shouldRestrict);
    }

    LogUtil.log(`TokenMovementManager: Updated movement restrictions for all combatants`);
  }

  /**
   * Handle combat end - remove all combat-based movement restrictions
   * @param {Combat} combat - The combat instance
   */
  static async onCombatEnd(combat) {
    LogUtil.log('TokenMovementManager: Combat ended, removing movement restrictions');

    const tokensToUnblock = [];

    // Unblock all combatants
    for (const combatant of combat.combatants) {
      const token = combatant.token;
      if (token) {
        // Check if this token has combat-based restriction
        const restriction = token.getFlag(MODULE_ID, 'movementRestriction');
        if (restriction?.type === 'combat') {
          tokensToUnblock.push(token);
        }
      }
    }

    if (tokensToUnblock.length > 0) {
      await this.setCombatMovementRestriction(tokensToUnblock, false);
      LogUtil.log(`TokenMovementManager: Unblocked movement for ${tokensToUnblock.length} combatants`);
    }
  }

  /**
   * Set combat-based movement restriction on tokens
   * @param {TokenDocument[]} tokens - Array of token documents
   * @param {boolean} restricted - Whether to restrict movement
   */
  static async setCombatMovementRestriction(tokens, restricted) {
    const updates = tokens.map(token => {
      let updateData;

      if (restricted) {
        // Setting combat restriction
        const movementRestrictionValue = {
          type: "combat",
          enabled: true,
          source: "system",
          metadata: {
            restrictedAt: Date.now(),
            combatId: game.combat?.id
          }
        };
        updateData = {
          _id: token.id,
          flags: {
            [MODULE_ID]: {
              movementRestriction: movementRestrictionValue
            }
          }
        };
      } else {
        // Check if this is a combat restriction before removing
        const currentRestriction = token.getFlag(MODULE_ID, 'movementRestriction');

        // Only remove if it's a combat-based restriction
        if (currentRestriction?.type === 'combat') {
          updateData = {
            _id: token.id,
            [`flags.${MODULE_ID}.-=movementRestriction`]: null
          };
        } else {
          return null;
        }
      }

      return updateData;
    }).filter(update => update !== null);

    if (updates.length > 0) {
      try {
        await game.scenes.current.updateEmbeddedDocuments("Token", updates);
        LogUtil.log(`TokenMovementManager: Updated ${updates.length} tokens with combat movement restriction: ${restricted}`);
      } catch (error) {
        LogUtil.error("TokenMovementManager: Failed to update combat movement restrictions", [error]);
      }
    }
  }

  /**
   * Handle combatant creation - block movement if auto-block is enabled and combat is active
   * @param {Combatant} combatant - The combatant document
   * @param {object} options - Creation options
   * @param {string} userId - The user ID who created the combatant
   */
  static async onCreateCombatant(combatant, options, userId) {
    const SETTINGS = getSettings();
    const autoBlock = SettingsUtil.get(SETTINGS.autoBlockMovementInCombat?.tag);

    if (!autoBlock) return;

    const combat = combatant.combat;
    if (!combat?.started) return;

    const token = combatant.token;
    if (!token) return;

    const currentCombatant = combat.combatant;
    if (combatant.id === currentCombatant?.id) {
      LogUtil.log(`TokenMovementManager: New combatant ${combatant.name} is current turn, allowing movement`);
      return;
    }

    LogUtil.log(`TokenMovementManager: Blocking movement for newly added combatant ${combatant.name}`);
    await this.setCombatMovementRestriction([token], true);
  }

  /**
   * Initialize movement restrictions for active combat on page load
   * Called when the module initializes to handle existing active combat
   */
  static async initializeCombatMovementRestrictions() {
    const SETTINGS = getSettings();
    const autoBlock = SettingsUtil.get(SETTINGS.autoBlockMovementInCombat?.tag);

    if (!autoBlock) return;

    const activeCombat = game.combat;
    if (!activeCombat?.started) return;

    LogUtil.log('TokenMovementManager: Initializing movement restrictions for active combat');

    const currentCombatant = activeCombat.combatant;
    LogUtil.log(`TokenMovementManager: Current combatant on init`, [currentCombatant]);

    // Apply restrictions to all combatants except the current one
    for (const combatant of activeCombat.combatants) {
      const token = combatant.token;
      if (!token) continue;

      const isCurrentTurn = combatant.id === currentCombatant?.id;
      const shouldRestrict = !isCurrentTurn;

      LogUtil.log(`TokenMovementManager: Init - ${combatant.name} - isCurrentTurn: ${isCurrentTurn}, shouldRestrict: ${shouldRestrict}`);

      await this.setCombatMovementRestriction([token], shouldRestrict);
    }

    LogUtil.log(`TokenMovementManager: Initialized movement restrictions for active combat`);
  }
}