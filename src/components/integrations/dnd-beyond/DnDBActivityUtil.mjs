import { MODULE_ID } from "../../../constants/General.mjs";
import { LogUtil } from "../../utils/LogUtil.mjs";

/**
 * Utility functions for working with DnD5e Activities
 * Provides modified activity.use() that skips subsequent actions
 */
export class DnDBActivityUtil {

  /**
   * Activate an activity without triggering automatic subsequent rolls
   * Based on ActivityMixin.use() but with subsequentActions control
   * @param {Activity} activity - The activity to use
   * @param {ActivityUseConfiguration} usage - Configuration for activation
   * @param {ActivityDialogConfiguration} dialog - Configuration for dialog
   * @param {ActivityMessageConfiguration} message - Configuration for message
   * @returns {Promise<ActivityUsageResults|void>}
   */
  static async ddbUse(activity, usage = {}, dialog = {}, message = {}) {
    if (!activity) {
      ui.notifications.error("No activity found", { localize: false });
      return;
    }
    if (!activity.item.isEmbedded || activity.item.pack) return;
    if (!activity.item.isOwner) {
      ui.notifications.error("DND5E.DocumentUseWarn", { localize: true });
      return;
    }
    if (!activity.canUse) {
      ui.notifications.error("DND5E.ACTIVITY.Warning.UsageNotAllowed", { localize: true });
      return;
    }

    let item = activity.item.clone({}, { keepId: true });

    const usageConfig = activity._prepareUsageConfig(usage);

    if (usage.create?._isDnDBRoll) {
      usageConfig.create = usageConfig.create || {};
      usageConfig.create._isDnDBRoll = true;
    }
    LogUtil.log("DnDBActivityUtil.ddbUse - usageConfig after _prepareUsageConfig", ["_isDnDBRoll:", usageConfig.create?._isDnDBRoll, usageConfig.create]);

    if (usageConfig.create?.measuredTemplate) {
      ui.notifications?.info(game.i18n.localize("FLASH_ROLLS.notifications.clickMapToPlaceTemplate"));
    }

    const dialogConfig = foundry.utils.mergeObject({
      configure: true,
      applicationClass: activity.metadata.usage.dialog
    }, dialog);

    const messageConfig = foundry.utils.mergeObject({
      create: true,
      data: {
        flags: {
          dnd5e: {
            ...activity.messageFlags,
            messageType: "usage",
            use: {
              effects: activity.applicableEffects?.map(e => e.id)
            }
          },
          rsr5e: { processed: true, quickRoll: false }
        }
      },
      hasConsumption: usageConfig.hasConsumption
    }, message);

    if (Hooks.call("dnd5e.preUseActivity", activity, usageConfig, dialogConfig, messageConfig) === false) return;

    if (dialogConfig.configure && activity._requiresConfigurationDialog(usageConfig)) {
      try {
        await dialogConfig.applicationClass.create(activity, usageConfig, dialogConfig.options);
      } catch (err) {
        return;
      }
    }

    await activity._prepareUsageScaling(usageConfig, messageConfig, item);
    activity = item.system.activities.get(activity.id);

    const updates = await activity.consume(usageConfig, messageConfig);
    if (updates === false) return;
    const results = { effects: [], templates: [], updates };

    if (usageConfig.concentration?.begin) {
      const effect = await item.actor.beginConcentrating(activity, { "flags.dnd5e.scaling": usageConfig.scaling });

      if (effect) {
        results.effects ??= [];
        results.effects.push(effect);
        foundry.utils.setProperty(messageConfig.data, "flags.dnd5e.use.concentrationId", effect.id);
      }
      if (usageConfig.concentration?.end) {
        const deleted = await item.actor.endConcentration(usageConfig.concentration.end);
        results.effects.push(...deleted);
      }
    }

    messageConfig.data.rolls = (messageConfig.data.rolls ?? []).concat(updates.rolls);

    activity._finalizeMessageConfig(usageConfig, messageConfig, results);
    results.message = await activity._createUsageMessage(messageConfig);

    await activity._finalizeUsage(usageConfig, results);

    LogUtil.log("DnDBActivityUtil.ddbUse - About to call postUseActivity hook", ["_isDnDBRoll:", usageConfig.create?._isDnDBRoll]);
    if (Hooks.call("dnd5e.postUseActivity", activity, usageConfig, results) === false) return results;

    if (usageConfig.subsequentActions !== false) {
      activity._triggerSubsequentActions(usageConfig, results);
    }

    return results;
  }

  /**
   * Create a chat message for activity usage
   * @param {Activity} activity - The activity
   * @param {Object} messageConfig - Message configuration
   * @returns {Promise<ChatMessage5e|object>}
   */
  static async _createUsageMessage(activity, messageConfig) {
    let context = await activity._usageChatContext(messageConfig);
    const rollData = await this._buildRollData(messageConfig.data.rolls, activity);

    context = {
      ...context,
      rolls: rollData
    };

    LogUtil.log("DnDBActivityUtil._createUsageMessage", [activity.metadata.usage.chatCard, context]);

    const config = foundry.utils.mergeObject({
      rollMode: game.settings.get("core", "rollMode"),
      data: {
        content: await foundry.applications.handlebars.renderTemplate(activity.metadata.usage.chatCard, context),
        speaker: ChatMessage.getSpeaker({ actor: activity.item.actor }),
        flags: {
          core: { canPopout: true },
          rsr5e: { processed: true }
        }
      }
    }, messageConfig);

    Hooks.callAll("dnd5e.preCreateUsageMessage", activity, config);

    ChatMessage.applyRollMode(config.data, config.rollMode);
    const card = config.create === false ? config.data : await ChatMessage.create(config.data);

    Hooks.callAll("dnd5e.postCreateUsageMessage", activity, card);

    return card;
  }

  /**
   * Build roll data for template rendering
   * @param {Array} rolls - Array of Roll objects
   * @param {Activity} activity - The activity
   * @returns {Promise<Array>}
   */
  static async _buildRollData(rolls, activity) {
    if (!rolls || rolls.length === 0) return [];

    const rollData = await Promise.all(rolls.map(async (r) => {
      const tooltipHtml = await r.getTooltip();
      const hasTarget = Number.isNumeric(r.options?.target);
      const isSuccess = hasTarget && r.total >= r.options.target;
      const isFailure = hasTarget && r.total < r.options.target;

      return {
        ...r,
        formula: r.formula,
        total: r.total,
        tooltipHtml: tooltipHtml,
        isSuccess: isSuccess,
        isFailure: isFailure,
        hasTarget: hasTarget
      };
    }));

    return rollData;
  }

  /**
   * Get activity from item by type
   * @param {Item} item - The item
   * @param {string} activityType - Type of activity (attack, damage, heal, save)
   * @returns {Activity|null}
   */
  static getActivityByType(item, activityType) {
    if (!item) return null;
    const activities = item.system?.activities;
    if (!activities) return null;

    const activity = activities.find(act => act.type === activityType);
    return activity || null;
  }

  /**
   * Get the first activity from an item
   * @param {Item} item - The item
   * @returns {Activity|null}
   */
  static getFirstActivity(item) {
    if (!item) return null;
    const activities = item.system?.activities;
    if (!activities) return null;
    return Array.from(activities.values())[0] || null;
  }
}
