import { MODULE_ID, ROLL_TYPES, ROLL_REQUEST_OPTIONS } from '../../constants/General.mjs';
import { LogUtil } from '../utils/LogUtil.mjs';
import { FlashAPI } from '../core/FlashAPI.mjs';

/**
 * Integration with Monk's Active Tiles module
 * Registers Flash Rolls 5e actions for use in tile triggers
 */
export class MonksActiveTilesIntegration {

  /**
   * Initialize the integration with Monk's Active Tiles
   * Registers tile group and single unified roll request action
   */
  static initialize() {
    if (!game.modules.get('monks-active-tiles')?.active) {
      LogUtil.log('MonksActiveTilesIntegration: Monk\'s Active Tiles not active, skipping integration');
      return;
    }

    Hooks.on("setupTileActions", (app) => {
      LogUtil.log('MonksActiveTilesIntegration: Registering Flash Rolls 5e tile actions');

      app.registerTileGroup(MODULE_ID, 'Flash Rolls 5e');
      this._registerRequestRollAction(app);

      LogUtil.log('MonksActiveTilesIntegration: Flash Rolls action registered successfully');
    });
  }

  /**
   * Register unified Request Roll tile action
   */
  static _registerRequestRollAction(app) {
    app.registerTileAction(MODULE_ID, 'request-roll', {
      name: 'Request Roll',
      group: MODULE_ID,
      ctrls: [
        {
          id: 'entity',
          name: 'Actors',
          type: 'select',
          subtype: 'entity',
          options: { show: ['token', 'within', 'players', 'previous'] },
          restrict: (entity) => {
            return entity instanceof foundry.canvas.placeables.Token;
          },
          defaultType: 'tokens'
        },
        {
          id: 'requestType',
          name: 'Roll Type',
          type: 'list',
          list: () => {
            const options = {};
            for (const [key, option] of Object.entries(ROLL_REQUEST_OPTIONS)) {
              options[option.name] = option.label;
            }
            return options;
          },
          required: true,
          defvalue: ROLL_TYPES.SKILL,
          onChange: async (app, field, action, data) => {
            const requestType = $(field).val();
            const option = Object.values(ROLL_REQUEST_OPTIONS).find(opt => opt.name === requestType);

            const rollKeySelect = $('select[name="data.rollKey"]', app.element);
            if (rollKeySelect.length > 0) {
              rollKeySelect.empty();

              if (requestType === ROLL_TYPES.CUSTOM) {
                const diceOptions = {
                  'd4': 'd4',
                  'd6': 'd6',
                  'd8': 'd8',
                  'd10': 'd10',
                  'd12': 'd12',
                  'd20': 'd20',
                  'd100': 'd100'
                };
                for (const [key, label] of Object.entries(diceOptions)) {
                  rollKeySelect.append($('<option>', { value: key, text: label }));
                }
              } else if (option && option.subList) {
                const configKey = option.subList;
                let options = {};

                if (configKey === 'abilities') {
                  options = CONFIG.DND5E?.abilities || {};
                  for (const [key, value] of Object.entries(options)) {
                    rollKeySelect.append($('<option>', { value: key, text: value.label }));
                  }
                } else if (configKey === 'skills') {
                  options = CONFIG.DND5E?.skills || {};
                  for (const [key, value] of Object.entries(options)) {
                    rollKeySelect.append($('<option>', { value: key, text: value.label }));
                  }
                } else if (configKey === 'tools') {
                  options = CONFIG.DND5E?.tools || {};
                  for (const [key, toolConfig] of Object.entries(options)) {
                    const toolName = await this._getToolName(key, toolConfig);
                    rollKeySelect.append($('<option>', { value: key, text: toolName }));
                  }
                }
              }
            }

            app.checkConditional();
          }
        },
        {
          id: 'rollKey',
          name: 'Roll Name',
          type: 'list',
          list: async (app) => {
            const requestType = app.element?.querySelector('select[name="data.requestType"]')?.value;
            if (!requestType) return {};

            if (requestType === ROLL_TYPES.CUSTOM) {
              return {
                'd4': 'd4',
                'd6': 'd6',
                'd8': 'd8',
                'd10': 'd10',
                'd12': 'd12',
                'd20': 'd20',
                'd100': 'd100'
              };
            }

            const option = Object.values(ROLL_REQUEST_OPTIONS).find(opt => opt.name === requestType);
            if (!option || !option.subList) return {};

            const configKey = option.subList;
            const options = {};

            if (configKey === 'abilities') {
              for (const [key, value] of Object.entries(CONFIG.DND5E?.abilities || {})) {
                options[key] = value.label;
              }
            } else if (configKey === 'skills') {
              for (const [key, value] of Object.entries(CONFIG.DND5E?.skills || {})) {
                options[key] = value.label;
              }
            } else if (configKey === 'tools') {
              for (const [key, toolConfig] of Object.entries(CONFIG.DND5E?.tools || {})) {
                options[key] = await MonksActiveTilesIntegration._getToolName(key, toolConfig);
              }
            }

            return options;
          },
          conditional: (app) => {
            const requestType = app.element?.querySelector('select[name="data.requestType"]')?.value;
            if (!requestType) return false;

            if (requestType === ROLL_TYPES.CUSTOM) return true;

            const option = Object.values(ROLL_REQUEST_OPTIONS).find(opt => opt.name === requestType);
            return option && option.subList !== null;
          }
        },
        {
          id: 'dc',
          name: 'Difficulty Class (DC)',
          type: 'number',
          defvalue: 10,
          min: 0,
          max: 50
        },
        {
          id: 'advantage',
          name: 'Advantage/Disadvantage',
          type: 'list',
          list: () => {
            return {
              'normal': 'Normal',
              'advantage': 'Advantage',
              'disadvantage': 'Disadvantage'
            };
          },
          defvalue: 'normal'
        },
        {
          id: 'bonus',
          name: 'Situational Bonus',
          type: 'text',
          help: "Enter a bonus/penalty (e.g., '+2', '-1', '1d4')"
        },
        {
          id: 'skipRollDialog',
          name: 'Skip Roll Dialog',
          type: 'checkbox',
          defvalue: false
        }
      ],
      fn: async (args) => {
        const { action, tokens, tile } = args;

        let entities = tokens;

        if (action.data?.entity?.id === 'within' && tile && typeof tile.entitiesWithin === 'function') {
          const withinEntities = tile.entitiesWithin({ collection: 'tokens' });
          if (Array.isArray(withinEntities) && withinEntities.length > 0) {
            entities = withinEntities;
          }
        }

        const actorIds = this._resolveActorIds(null, entities);

        if (!actorIds || actorIds.length === 0) {
          ui.notifications.warn(game.i18n.localize('FLASH_ROLLS.notifications.noActorsSelected'));
          return {};
        }

        const options = {
          requestType: action.data.requestType,
          actorIds: actorIds,
          dc: action.data.dc,
          advantage: action.data.advantage === 'advantage' ? true : false,
          disadvantage: action.data.advantage === 'disadvantage' ? true : false,
          skipRollDialog: action.data.skipRollDialog || false,
          sendAsRequest: true
        };

        if (action.data.rollKey) {
          options.rollKey = action.data.rollKey;
        }

        if (action.data.bonus) {
          options.situationalBonus = action.data.bonus;
        }

        LogUtil.log("MonksActiveTilesIntegration - options", [options]);

        await FlashAPI.requestRoll(options);
        return {};
      },
      content: async (trigger, action) => {
        const requestType = action.data?.requestType;
        const rollOption = Object.values(ROLL_REQUEST_OPTIONS).find(opt => opt.name === requestType);
        const typeName = rollOption?.label || requestType || 'Unknown';

        let rollKeyName = '';
        if (action.data?.rollKey) {
          if (action.data.rollKey.length === 3) {
            rollKeyName = ` (${this._getSkillName(action.data.rollKey) || this._getAbilityName(action.data.rollKey) || action.data.rollKey})`;
          } else {
            rollKeyName = ` (${action.data.rollKey})`;
          }
        }

        const dc = action.data?.dc ? ` DC ${action.data.dc}` : '';
        const advType = action.data?.advantage || 'normal';
        const advLabel = this._getAdvantageLabel(advType);
        const bonus = action.data?.bonus ? ` (${action.data.bonus})` : '';
        const skipDialog = action.data?.skipRollDialog ? ' [Skip Dialog]' : '';

        return `<div>Request <span class="value">${typeName}${rollKeyName}</span>${dc}${advLabel ? ' ' + advLabel : ''}${bonus}${skipDialog}</div>`;
      }
    });
  }

  /**
   * Resolve actor IDs from token documents
   */
  static _resolveActorIds(entityData, entities) {
    const actorIds = [];

    LogUtil.log("_resolveActorIds - entities:", [entities]);
    LogUtil.log("_resolveActorIds - entities type:", [typeof entities]);
    LogUtil.log("_resolveActorIds - entities length:", [entities?.length]);

    if (!entities || entities.length === 0) {
      LogUtil.log("_resolveActorIds - No entities provided");
      return actorIds;
    }

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      LogUtil.log(`_resolveActorIds - Processing entity ${i}:`, [entity, entity?.constructor?.name]);

      let actorId = null;

      if (entity instanceof Token || entity instanceof TokenDocument) {
        actorId = entity.actor?.id;
        LogUtil.log(`_resolveActorIds - Token/TokenDocument actor ID:`, [actorId]);
      } else if (entity instanceof Actor) {
        actorId = entity.id;
        LogUtil.log(`_resolveActorIds - Actor ID:`, [actorId]);
      } else if (entity?.actorId) {
        actorId = entity.actorId;
        LogUtil.log(`_resolveActorIds - entity.actorId:`, [actorId]);
      } else if (entity?.actor?.id) {
        actorId = entity.actor.id;
        LogUtil.log(`_resolveActorIds - entity.actor.id:`, [actorId]);
      } else {
        LogUtil.log(`_resolveActorIds - Could not resolve actor from entity:`, [entity]);
      }

      if (actorId && !actorIds.includes(actorId)) {
        actorIds.push(actorId);
        LogUtil.log("_resolveActorIds - Added actorId:", [actorId]);
      } else if (actorId) {
        LogUtil.log("_resolveActorIds - Skipped duplicate actorId:", [actorId]);
      }
    }

    LogUtil.log("_resolveActorIds - Final actorIds:", [actorIds]);
    return actorIds;
  }

  /**
   * Get localized skill name from skill ID
   */
  static _getSkillName(skillId) {
    if (!skillId) return null;
    return CONFIG.DND5E?.skills?.[skillId]?.label || null;
  }

  /**
   * Get localized ability name from ability ID
   */
  static _getAbilityName(abilityId) {
    if (!abilityId) return null;
    return CONFIG.DND5E?.abilities?.[abilityId]?.label || null;
  }

  /**
   * Get tool name from tool ID and config
   */
  static async _getToolName(toolId, toolConfig) {
    if (!toolId) return toolId;

    const actors = game.actors?.contents || [];
    for (const actor of actors) {
      const tool = actor.system?.tools?.[toolId];
      if (tool?.label) {
        return tool.label;
      }
    }

    if (toolConfig?.id) {
      try {
        const item = await fromUuid(toolConfig.id);
        if (item?.name) return item.name;
      } catch (error) {
        LogUtil.log(`MonksActiveTilesIntegration: Failed to fetch tool name for ${toolId}`, error);
      }
    }

    const capitalizedId = toolId.charAt(0).toUpperCase() + toolId.slice(1);
    return capitalizedId;
  }

  /**
   * Get human-readable advantage label
   */
  static _getAdvantageLabel(advType) {
    switch (advType) {
      case 'advantage':
        return 'with Advantage';
      case 'disadvantage':
        return 'with Disadvantage';
      default:
        return '';
    }
  }
}
