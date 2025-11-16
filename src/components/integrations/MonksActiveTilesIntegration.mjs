import { MODULE_ID, ROLL_TYPES, ROLL_REQUEST_OPTIONS } from '../../constants/General.mjs';
import { LogUtil } from '../utils/LogUtil.mjs';
import { FlashAPI } from '../core/FlashAPI.mjs';
import { getActorData } from '../helpers/Helpers.mjs';

/**
 * Integration with Monk's Active Tiles module
 * Registers Flash Rolls 5e actions for use in tile triggers
 */
export class MonksActiveTilesIntegration {

  static _pendingGroupRolls = new Map();

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
      this._registerHealAllAction(app);
      this._registerKillAllAction(app);
      this._registerOpenSheetsAction(app);
      this._registerToggleMovementAction(app);
      this._registerTeleportTokensAction(app);
      this._registerTransformActorsAction(app);

      LogUtil.log('MonksActiveTilesIntegration: Flash Rolls actions registered successfully');
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

        const groupRollId = this._generateGroupRollId(tile, action);

        if (this._pendingGroupRolls.has(groupRollId)) {
          const pending = this._pendingGroupRolls.get(groupRollId);
          for (const actorId of actorIds) {
            if (!pending.actorIds.includes(actorId)) {
              pending.actorIds.push(actorId);
            }
          }
          LogUtil.log("MonksActiveTilesIntegration - Added actors to pending group roll", [groupRollId, pending.actorIds]);
          return {};
        }

        this._pendingGroupRolls.set(groupRollId, {
          actorIds: [...actorIds],
          action: action,
          tile: tile
        });

        await new Promise(resolve => setTimeout(resolve, 50));

        const pending = this._pendingGroupRolls.get(groupRollId);
        this._pendingGroupRolls.delete(groupRollId);

        const options = {
          requestType: action.data.requestType,
          actorIds: pending.actorIds,
          dc: action.data.dc,
          advantage: action.data.advantage === 'advantage' ? true : false,
          disadvantage: action.data.advantage === 'disadvantage' ? true : false,
          skipRollDialog: action.data.skipRollDialog || false,
          sendAsRequest: true,
          groupRollId: groupRollId
        };

        if (action.data.rollKey) {
          options.rollKey = action.data.rollKey;
        }

        if (action.data.bonus) {
          options.situationalBonus = action.data.bonus;
        }

        LogUtil.log("MonksActiveTilesIntegration - Requesting group roll", [groupRollId, pending.actorIds, options]);

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
   * Register Heal All tile action
   */
  static _registerHealAllAction(app) {
    app.registerTileAction(MODULE_ID, 'heal-all', {
      name: 'Heal All',
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

        await FlashAPI.healAll(actorIds);
        return {};
      },
      content: async (trigger, action) => {
        return `<div>Heal all actors</div>`;
      }
    });
  }

  /**
   * Register Kill All tile action
   */
  static _registerKillAllAction(app) {
    app.registerTileAction(MODULE_ID, 'kill-all', {
      name: 'Kill All',
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

        await FlashAPI.killAll(actorIds);
        return {};
      },
      content: async (trigger, action) => {
        return `<div>Kill all actors</div>`;
      }
    });
  }

  /**
   * Register Open Sheets tile action
   */
  static _registerOpenSheetsAction(app) {
    app.registerTileAction(MODULE_ID, 'open-sheets', {
      name: 'Open Character Sheets',
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

        await FlashAPI.openSheets(actorIds);
        return {};
      },
      content: async (trigger, action) => {
        return `<div>Open character sheets</div>`;
      }
    });
  }

  /**
   * Register Toggle Movement tile action
   */
  static _registerToggleMovementAction(app) {
    app.registerTileAction(MODULE_ID, 'toggle-movement', {
      name: 'Toggle Movement',
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

        await FlashAPI.toggleMovement(actorIds);
        return {};
      },
      content: async (trigger, action) => {
        return `<div>Toggle movement</div>`;
      }
    });
  }

  /**
   * Register Teleport Tokens tile action
   */
  static _registerTeleportTokensAction(app) {
    app.registerTileAction(MODULE_ID, 'teleport-tokens', {
      name: 'Teleport Tokens',
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
          id: 'location',
          name: 'Select Coordinates',
          type: 'select',
          subtype: 'either',
          options: { show: ['token', 'previous', 'tagger', 'origin'] },
          restrict: (entity, document) => {
            return (entity instanceof foundry.canvas.placeables.Tile && document.parent.id == entity.parent.id) || document.parent.id == entity.id;
          },
          required: true
        },
        {
          id: 'snap',
          name: 'Snap to Grid',
          type: 'checkbox',
          defvalue: true
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

        const tokenIds = [];
        for (const entity of entities) {
          if (entity instanceof Token || entity instanceof TokenDocument) {
            tokenIds.push(entity.id);
          } else if (entity?.id) {
            tokenIds.push(entity.id);
          }
        }

        if (!tokenIds || tokenIds.length === 0) {
          ui.notifications.warn(game.i18n.localize('FLASH_ROLLS.notifications.noActorsSelected'));
          return {};
        }

        const snap = action.data?.snap ?? true;
        const location = action.data?.location;

        await FlashAPI.teleportTokens({ tokenIds, snap, location });
        return {};
      },
      content: async (trigger, action) => {
        const location = action.data?.location;
        let locationText = 'coordinates';

        if (location?.id === 'previous') {
          locationText = 'previous location';
        } else if (location?.id === 'origin') {
          locationText = 'trigger origin';
        } else if (location?.id) {
          locationText = location.id;
        }

        const snap = action.data?.snap ?? true;
        return `<div>Teleport tokens to <span class="value">${locationText}</span>${snap ? ' (snap to grid)' : ''}</div>`;
      }
    });
  }

  /**
   * Register Transform Actors tile action
   */
  static _registerTransformActorsAction(app) {
    app.registerTileAction(MODULE_ID, 'transform-actors', {
      name: game.i18n.localize('FLASH_ROLLS.ui.dialogs.transformation.matt.action'),
      group: MODULE_ID,
      ctrls: [
        {
          id: 'entity',
          name: game.i18n.localize('FLASH_ROLLS.ui.dialogs.transformation.matt.actors'),
          type: 'select',
          subtype: 'entity',
          options: { show: ['token', 'within', 'players', 'previous'] },
          restrict: (entity) => {
            return entity instanceof foundry.canvas.placeables.Token;
          },
          defaultType: 'tokens'
        },
        {
          id: 'targetActorUuid',
          name: game.i18n.localize('FLASH_ROLLS.ui.dialogs.transformation.matt.targetCreature'),
          type: 'select',
          subtype: 'entity',
          options: { show: ['actor'] },
          restrict: (entity) => {
            return entity instanceof Actor;
          },
          required: false,
          help: game.i18n.localize('FLASH_ROLLS.ui.dialogs.transformation.matt.targetCreatureHelp')
        },
        {
          id: 'preset',
          name: game.i18n.localize('FLASH_ROLLS.ui.dialogs.transformation.matt.preset'),
          type: 'list',
          list: () => {
            return {
              'polymorph': game.i18n.localize('FLASH_ROLLS.ui.dialogs.transformation.presets.polymorph'),
              'wildshape': game.i18n.localize('FLASH_ROLLS.ui.dialogs.transformation.presets.wildshape'),
              'appearance': game.i18n.localize('FLASH_ROLLS.ui.dialogs.transformation.presets.appearance'),
              'custom': game.i18n.localize('FLASH_ROLLS.ui.dialogs.transformation.presets.custom')
            };
          },
          defvalue: 'polymorph'
        },
        {
          id: 'revert',
          name: game.i18n.localize('FLASH_ROLLS.ui.dialogs.transformation.matt.revert'),
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

        const actors = actorIds.map(id => getActorData(id)).filter(a => a);

        if (action.data?.revert) {
          const transformedActorIds = actors
            .filter(a => a.getFlag("dnd5e", "isPolymorphed"))
            .map(a => {
              const token = canvas.tokens.placeables.find(t => t.actor === a);
              return token ? token.document.id : a.id;
            });

          if (transformedActorIds.length > 0) {
            await FlashAPI.revertTransformation(transformedActorIds);
          }
        } else {
          const nonTransformedActorIds = actors
            .filter(a => !a.getFlag("dnd5e", "isPolymorphed"))
            .map(a => {
              const token = canvas.tokens.placeables.find(t => t.actor === a);
              return token ? token.document.id : a.id;
            });

          if (nonTransformedActorIds.length === 0) {
            return {};
          }

          let targetUuid = null;
          if (action.data?.targetActorUuid) {
            if (typeof action.data.targetActorUuid === 'string') {
              targetUuid = action.data.targetActorUuid.trim() || null;
            } else if (action.data.targetActorUuid.id) {
              const entity = await fromUuid(action.data.targetActorUuid.id);
              targetUuid = entity?.uuid || null;
            }
          }
          const preset = action.data?.preset || 'polymorph';
          const skipRevertCheck = true;

          await FlashAPI.transformActors(nonTransformedActorIds, targetUuid, { preset, skipRevertCheck });
        }

        return {};
      },
      content: async (trigger, action) => {
        const isRevert = action.data?.revert;

        if (isRevert) {
          return `<div>Revert Transformation</div>`;
        }

        const targetUuid = action.data?.targetActorUuid?.trim();
        const preset = action.data?.preset || 'polymorph';

        let targetText = 'selection dialog';
        if (targetUuid) {
          try {
            const targetActor = await fromUuid(targetUuid);
            targetText = targetActor?.name || 'Unknown Actor';
          } catch (e) {
            targetText = 'Invalid UUID';
          }
        }

        return `<div>Transform to <span class="value">${targetText}</span> (${preset})</div>`;
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

      let actorId = null;

      if (entity instanceof TokenDocument || entity?.documentName === 'Token') {
        actorId = entity.actor?.id;
      } else if (entity instanceof foundry.canvas.placeables.Token) {
        actorId = entity.document?.actor?.id || entity.actor?.id;
      } else if (entity instanceof Actor) {
        actorId = entity.id;
      } else if (entity?.actorId) {
        actorId = entity.actorId;
      } else if (entity?.actor?.id) {
        actorId = entity.actor.id;
      } else {
        LogUtil.log(`_resolveActorIds - Could not resolve actor from entity:`, [entity]);
      }

      if (actorId && !actorIds.includes(actorId)) {
        actorIds.push(actorId);
      } else if (actorId) {
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

  /**
   * Generate a stable groupRollId for tile actions to combine simultaneous triggers
   * @param {Object} tile - The triggering tile
   * @param {Object} action - The action being executed
   * @returns {string} Stable groupRollId
   */
  static _generateGroupRollId(tile, action) {
    if (!tile?.id) {
      return foundry.utils.randomID();
    }
    const timestamp = Math.floor(Date.now() / 100);
    return `matt-${tile.id}-${action._id || 'action'}-${timestamp}`;
  }
}
