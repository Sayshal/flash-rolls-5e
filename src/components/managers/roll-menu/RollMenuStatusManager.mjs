import { LogUtil } from '../../utils/LogUtil.mjs';
import { getActorData } from '../../helpers/Helpers.mjs';
import { GeneralUtil } from '../../utils/GeneralUtil.mjs';

/**
 * Handles status effects in the Roll Requests Menu
 */
export class RollMenuStatusManager {

  /**
   * Apply a status effect to selected actors
   * @param {string} statusEffectId - The ID of the status effect to apply
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static async applyStatusToSelected(statusEffectId, menu) {
    const statusEffect = CONFIG.statusEffects.find(effect => effect.id === statusEffectId);
    if (!statusEffect) {
      GeneralUtil.notify('warn', `Status effect "${statusEffectId}" not found`);
      return;
    }

    if (menu.selectedActors.size === 0) {
      GeneralUtil.notify('warn', "No actors selected");
      return;
    }

    let successCount = 0;
    let totalCount = 0;

    for (const uniqueId of menu.selectedActors) {
      const actor = getActorData(uniqueId);
      if (!actor) continue;
      
      totalCount++;
      const success = await this.applyStatusToActor(statusEffect, actor);
      if (success) successCount++;
    }

    if (successCount > 0) {
      const statusName = statusEffect.name || statusEffect.label || statusEffect.id;
      GeneralUtil.notify('info', `Applied "${statusName}" to ${successCount}/${totalCount} actors`);
    }
  }

  /**
   * Apply a status effect to a single actor
   * @param {Object} statusEffect - The status effect configuration
   * @param {Actor} actor - The actor to apply the effect to
   * @returns {Promise<boolean>} Success state
   */
  static async applyStatusToActor(statusEffect, actor) {
    try {
      // Check if actor already has this status effect
      const existingEffect = actor.appliedEffects.find(effect => 
        effect.statuses?.has(statusEffect.id) || 
        effect.flags?.core?.statusId === statusEffect.id
      );

      if (existingEffect) {
        LogUtil.log(`RollMenuStatusManager: Actor ${actor.name} already has status effect ${statusEffect.id}`);
        return false;
      }

      // Use the actor's toggleStatusEffect method if available (Foundry v10+)
      if (actor.toggleStatusEffect) {
        const hasEffect = actor.appliedEffects.some(e => e.statuses?.has(statusEffect.id));
        if (!hasEffect) {
          await actor.toggleStatusEffect(statusEffect.id, { active: true });
          LogUtil.log(`RollMenuStatusManager: Applied ${statusEffect.id} to ${actor.name}`);
          return true;
        }
        return false;
      }
      
      const effectData = {
        name: statusEffect.name || statusEffect.label || statusEffect.id,
        icon: statusEffect.icon || statusEffect.img,
        statuses: [statusEffect.id],
        flags: {
          core: {
            statusId: statusEffect.id
          }
        }
      };

      if (statusEffect.changes) {
        effectData.changes = statusEffect.changes;
      }

      await actor.createEmbeddedDocuments('ActiveEffect', [effectData]);
      LogUtil.log(`RollMenuStatusManager: Applied ${statusEffect.id} to ${actor.name}`);
      return true;

    } catch (error) {
      LogUtil.error(`RollMenuStatusManager: Failed to apply status effect to ${actor.name}`, [error]);
      return false;
    }
  }

  /**
   * Remove a status effect from selected actors
   * @param {string} statusEffectId - The ID of the status effect to remove
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static async removeStatusFromSelected(statusEffectId, menu) {
    const statusEffect = CONFIG.statusEffects.find(effect => effect.id === statusEffectId);
    if (!statusEffect) {
      GeneralUtil.notify('warn', `Status effect "${statusEffectId}" not found`);
      return;
    }

    if (menu.selectedActors.size === 0) {
      GeneralUtil.notify('warn', "No actors selected");
      return;
    }

    let successCount = 0;
    let totalCount = 0;

    for (const uniqueId of menu.selectedActors) {
      const actor = getActorData(uniqueId);
      if (!actor) continue;
      
      totalCount++;
      const success = await this.removeStatusFromActor(statusEffect, actor);
      if (success) successCount++;
    }

    if (successCount > 0) {
      const statusName = statusEffect.name || statusEffect.label || statusEffect.id;
      GeneralUtil.notify('info', `Removed "${statusName}" from ${successCount}/${totalCount} actors`);
    }
  }

  /**
   * Remove a status effect from a single actor
   * @param {Object} statusEffect - The status effect configuration
   * @param {Actor} actor - The actor to remove the effect from
   * @returns {Promise<boolean>} Success state
   */
  static async removeStatusFromActor(statusEffect, actor) {
    try {
      if (actor.toggleStatusEffect) {
        const hasEffect = actor.appliedEffects.some(e => e.statuses?.has(statusEffect.id));
        if (hasEffect) {
          await actor.toggleStatusEffect(statusEffect.id, { active: false });
          LogUtil.log(`RollMenuStatusManager: Removed ${statusEffect.id} from ${actor.name}`);
          return true;
        }
        return false;
      }
      
      const existingEffect = actor.appliedEffects.find(effect => 
        effect.statuses?.has(statusEffect.id) || 
        effect.flags?.core?.statusId === statusEffect.id
      );

      if (!existingEffect) {
        LogUtil.log(`RollMenuStatusManager: Actor ${actor.name} does not have status effect ${statusEffect.id}`);
        return false;
      }

      await existingEffect.delete();
      LogUtil.log(`RollMenuStatusManager: Removed ${statusEffect.id} from ${actor.name}`);
      return true;

    } catch (error) {
      LogUtil.error(`RollMenuStatusManager: Failed to remove status effect from ${actor.name}`, [error]);
      return false;
    }
  }

  /**
   * Toggle a status effect on selected actors
   * @param {string} statusEffectId - The ID of the status effect to toggle
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static async toggleStatusOnSelected(statusEffectId, menu) {
    const statusEffect = CONFIG.statusEffects.find(effect => effect.id === statusEffectId);
    if (!statusEffect) {
      GeneralUtil.notify('warn', `Status effect "${statusEffectId}" not found`);
      return;
    }

    if (menu.selectedActors.size === 0) {
      GeneralUtil.notify('warn', "No actors selected");
      return;
    }

    let hasEffect = false;
    for (const uniqueId of menu.selectedActors) {
      const actor = getActorData(uniqueId);
      if (!actor) continue;
      
      const existingEffect = actor.appliedEffects.find(effect => 
        effect.statuses?.has(statusEffect.id) || 
        effect.flags?.core?.statusId === statusEffect.id
      );

      if (existingEffect) {
        hasEffect = true;
        break;
      }
    }

    if (hasEffect) {
      await this.removeStatusFromSelected(statusEffectId, menu);
    } else {
      await this.applyStatusToSelected(statusEffectId, menu);
    }
  }

  /**
   * Get status effects data for template context
   * @returns {Array} Array of status effects with additional UI data
   */
  static getStatusEffectsForTemplate() {
    try {
      if (!CONFIG.statusEffects || !Array.isArray(CONFIG.statusEffects)) {
        LogUtil.warn('RollMenuStatusManager: CONFIG.statusEffects not available or not an array');
        return [];
      }
      
      return CONFIG.statusEffects
        .map(effect => ({
          ...effect,
          displayName: effect.name || effect.label || effect.id,
          iconPath: effect.icon || effect.img || 'icons/svg/aura.svg'
        }))
        .sort((a, b) => {
          // Sort alphabetically by display name
          return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
        });
    } catch (error) {
      LogUtil.error('RollMenuStatusManager: Error getting status effects for template', [error]);
      return [];
    }
  }
}