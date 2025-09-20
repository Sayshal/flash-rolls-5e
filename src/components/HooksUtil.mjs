import { HOOKS_CORE, HOOKS_DND5E, HOOKS_MIDI_QOL } from "../constants/Hooks.mjs";
import { getSettings } from "../constants/Settings.mjs";
import { SettingsUtil } from "./SettingsUtil.mjs";
import { DiceConfigUtil } from "./DiceConfigUtil.mjs";
import { RollInterceptor } from "./RollInterceptor.mjs";
import { updateSidebarClass, isSidebarExpanded, showConsumptionConfig, getConsumptionConfig, getCreateConfig, isPlayerOwned } from "./helpers/Helpers.mjs";
import { SidebarUtil } from "./SidebarUtil.mjs";
import { LogUtil } from "./LogUtil.mjs";
import { ACTIVITY_TYPES, MODULE_ID } from "../constants/General.mjs";
import { GeneralUtil } from "./helpers/GeneralUtil.mjs";
import { ModuleHelpers } from "./helpers/ModuleHelpers.mjs";
import { ChatMessageUtils } from "./ChatMessageUtils.mjs";
import RollRequestsMenu from "./RollRequestsMenu.mjs";
import { ActorStatusUtil } from "./ActorStatusUtil.mjs";
import { ActorDirectoryIconUtil } from "./utils/ActorDirectoryIconUtil.mjs";
import { FlashRollsAPI } from "./FlashRollsAPI.mjs";
import { RollHelpers } from "./helpers/RollHelpers.mjs";
import { RollMenuDragUtil } from "./utils/RollMenuDragUtil.mjs";

/**
 * Utility class for managing all module hooks in one place
 */
export class HooksUtil {
  static registeredHooks = new Map();
  static midiTimeout = null;
  static throttleTimers = {};
  static activityConfigCache = new Map(); // In-memory cache for activity configs
  
  /**
   * Initialize main module hooks
   */
  static initialize() {
    Hooks.once(HOOKS_CORE.INIT, this._onInit.bind(this));
    Hooks.once(HOOKS_CORE.READY, this._onReady.bind(this));
    Hooks.on("flash-rolls-5e.ready", ()=>{
      LogUtil.log("flash-rolls-5e.ready hook", []);
    })
    Hooks.on(HOOKS_CORE.GET_CHAT_MESSAGE_CONTEXT_OPTIONS, (document, contextOptions) => {
      LogUtil.log("getChatMessageContextOptions hook", [document, contextOptions]);
      if (!game.user.isGM) return;
      
      this._addGroupRollContextOptions(document, contextOptions);
    });
    
    Hooks.on(HOOKS_CORE.CLIENT_SETTING_CHANGED, this._onClientSettingChanged.bind(this));
    
    Hooks.once(HOOKS_CORE.GET_ACTOR_CONTEXT_OPTIONS, (html, contextOptions) => {
      LogUtil.log("getActorContextOptions hook", [html, contextOptions]);
      
      if (!game.user.isGM) return;

      contextOptions.push({
        name: game.i18n.localize("FLASH_ROLLS.contextMenu.unblockFromMenu"),
        icon: '<i class="fas fa-bolt"></i>',
        callback: li => {
          const actorId = li.dataset.entryId;
          if (actorId) {
            ActorStatusUtil.toggleBlocked(actorId, false);
          }
          return actorId;
        },
        condition: li => {
          const actorId = li?.dataset?.entryId;
          const isBlocked = ActorStatusUtil.isBlocked(actorId);
          return isBlocked;
        }
      });

      contextOptions.push({
        name: game.i18n.localize("FLASH_ROLLS.contextMenu.blockFromMenu"),
        icon: '<i class="fas fa-bolt-slash"></i>',
        callback: li => {
          const actorId = li.dataset.entryId;
          if (actorId) {
            ActorStatusUtil.toggleBlocked(actorId, true);
          }
          return actorId;
        },
        condition: li => {
          const actorId = li?.dataset?.entryId;
          const isBlocked = ActorStatusUtil.isBlocked(actorId);
          return !isBlocked;
        }
      });
    });
  }

  /**
   * Add context menu options for group roll messages
   * @param {ChatMessage} message - The chat message document
   * @param {Array} contextOptions - Array of context menu options
   */
  static _addGroupRollContextOptions(chatLog, contextOptions) {
    LogUtil.log("_addGroupRollContextOptions", [chatLog, contextOptions]);
    
    // Add "Hide NPCs from Players" option
    contextOptions.push({
      name: game.i18n.localize("FLASH_ROLLS.contextMenu.hideNPCsFromPlayers"),
      icon: '<i class="fas fa-eye-slash"></i>',
      callback: li => {
        const messageId = li.dataset.messageId;
        const message = game.messages.get(messageId);
        if (message) {
          message.setFlag(MODULE_ID, 'npcHiddenOverride', true);
          ui.notifications.info(game.i18n.localize("FLASH_ROLLS.notifications.npcHiddenFromPlayers"));
        }
      },
      condition: li => {
        const messageId = li.dataset.messageId;
        if (!messageId) return false;
        const message = game.messages.get(messageId);
        if (!message || !message.getFlag(MODULE_ID, 'isGroupRoll')) return false;
        
        const SETTINGS = getSettings();
        const globalHidden = SettingsUtil.get(SETTINGS.groupRollNPCHidden.tag);
        const messageHidden = message.getFlag(MODULE_ID, 'npcHiddenOverride');
        const currentlyHidden = messageHidden !== undefined ? messageHidden : globalHidden;
        
        return !currentlyHidden;
      }
    });

    // Add "Show NPCs to Players" option  
    contextOptions.push({
      name: game.i18n.localize("FLASH_ROLLS.contextMenu.showNPCsToPlayers"),
      icon: '<i class="fas fa-eye"></i>',
      callback: li => {
        const messageId = li.dataset.messageId;
        const message = game.messages.get(messageId);
        if (message) {
          const SETTINGS = getSettings();
          const globalHidden = SettingsUtil.get(SETTINGS.groupRollNPCHidden.tag);
          
          if (globalHidden) {
            message.setFlag(MODULE_ID, 'npcHiddenOverride', false);
          } else {
            message.unsetFlag(MODULE_ID, 'npcHiddenOverride');
          }
          ui.notifications.info(game.i18n.localize("FLASH_ROLLS.notifications.npcVisibleToPlayers"));
        }
      },
      condition: li => {
        const messageId = li.dataset.messageId;
        if (!messageId) return false;
        const message = game.messages.get(messageId);
        if (!message || !message.getFlag(MODULE_ID, 'isGroupRoll')) return false;
        
        const SETTINGS = getSettings();
        const globalHidden = SettingsUtil.get(SETTINGS.groupRollNPCHidden.tag);
        const messageHidden = message.getFlag(MODULE_ID, 'npcHiddenOverride');
        const currentlyHidden = messageHidden !== undefined ? messageHidden : globalHidden;
        
        return currentlyHidden;
      }
    });
  }
  
  /**
   * Triggered when Foundry initializes
   */
  static _onInit() {
    const SETTINGS = getSettings();
    document.body.classList.add("flash5e");
    SettingsUtil.registerSettings();
    DiceConfigUtil.initialize();
    
    this._registerHooks();
  }
  
  /**
   * Triggered when Foundry is ready (fully loaded)
   */
  static _onReady() {
    SettingsUtil.registerSettingsMenu();
    ActorDirectoryIconUtil.initialize();
    SidebarUtil.addSidebarControls(ui.sidebar, ui.sidebar?.element);
    
    // Listen for browser color scheme changes
    if (matchMedia) {
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", this._onBrowserColorSchemeChanged.bind(this));
    }
    
    if(ModuleHelpers.isModuleActive("midi-qol")){
      Hooks.once(HOOKS_MIDI_QOL.READY, this._initModule.bind(this));
    }else{
      this._initModule();
    }
    LogUtil.log("HooksUtil.ready", [CONFIG.statusEffects]);
  }

  static async _initModule() {
    const SETTINGS = getSettings();
    const isDebugOn = SettingsUtil.get(SETTINGS.debugMode.tag);
    if (isDebugOn) {
      CONFIG.debug.hooks = true;
    }
    
    await ChatMessageUtils.initialize();

    if (game.user.isGM) {
      RollInterceptor.initialize();
      this._registerGMHooks();
      RollRequestsMenu.showOnLoadIfEnabled();
    }else{
      DiceConfigUtil.getDiceConfig();
      this._registerPlayerHooks();
    }
    updateSidebarClass(isSidebarExpanded());

    // Initialize public API for other modules
    const module = game.modules.get("flash-rolls-5e");
    if (module) {
      module.api = FlashRollsAPI;
    }
    
    // Create global alias for easier access
    globalThis.FlashRolls5e = FlashRollsAPI;

    // Notify other modules that Flash Rolls 5e is ready
    Hooks.call("flash-rolls-5e.ready");
  
  }
  
  /**
   * Register D&D5e specific hooks
   */
  static _registerHooks() {
    this._registerHook(HOOKS_CORE.RENDER_SIDEBAR, this._onRenderSidebar.bind(this));
    // this._registerHook(HOOKS_CORE.PRE_CREATE_CHAT_MESSAGE, this._onPreCreateChatMessage.bind(this));
    this._registerHook(HOOKS_CORE.CREATE_CHAT_MESSAGE, this._onCreateChatMessage.bind(this));
    this._registerHook(HOOKS_CORE.PRE_CREATE_CHAT_MESSAGE, this._onPreCreateChatMessageFlavor.bind(this));
    this._registerHook(HOOKS_CORE.RENDER_CHAT_MESSAGE, this._onRenderChatMessageHTML.bind(this));
    this._registerHook(HOOKS_CORE.RENDER_CHAT_LOG, this._onRenderChatLog.bind(this));
    this._registerHook(HOOKS_CORE.CHANGE_SIDEBAR_TAB, this._onSidebarUpdate.bind(this));
    this._registerHook(HOOKS_CORE.COLLAPSE_SIDE_BAR, this._onSidebarUpdate.bind(this));
    this._registerHook(HOOKS_CORE.REFRESH_MEASURED_TEMPLATE, this.onRefreshTemplate.bind(this)); 
    this._registerHook(HOOKS_DND5E.RENDER_ROLL_CONFIGURATION_DIALOG, this._onRenderRollConfigDialog.bind(this));
    this._registerHook(HOOKS_DND5E.RENDER_SKILL_TOOL_ROLL_DIALOG, this._onRenderSkillToolDialog.bind(this));
    this._registerHook(HOOKS_DND5E.PRE_USE_ACTIVITY, this._onPreUseActivity.bind(this));
    this._registerHook(HOOKS_DND5E.POST_USE_ACTIVITY, this._onPostUseActivity.bind(this));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_HIT_DIE_V2, this._onPreRollHitDieV2.bind(this));
    this._registerHook(HOOKS_DND5E.POST_ROLL_CONFIG, this._onPostRollConfig.bind(this));
    // this._registerHook(HOOKS_DND5E.ROLL_DAMAGE_V2, this._onPostRollDamage.bind(this));
  }
  
  /**
   * Register GM-specific hooks
   */
  static _registerGMHooks() {
    this._registerHook(HOOKS_CORE.USER_CONNECTED, this._onUserConnected.bind(this));
    // this._registerHook(HOOKS_CORE.PRE_CREATE_CHAT_MESSAGE, this._onPreCreateChatMessageGM.bind(this));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_V2, this._onPreRoll.bind(this));
    
    // Token hooks for updating roll requests menu
    this._registerHook(HOOKS_CORE.CREATE_TOKEN, this._onTokenChange.bind(this));
    this._registerHook(HOOKS_CORE.DELETE_TOKEN, this._onTokenChange.bind(this));
    
    // Hooks for updating roll requests menu when data changes
    this._registerHook(HOOKS_CORE.UPDATE_SETTING, this._onSettingUpdate.bind(this));
    this._registerHook(HOOKS_CORE.UPDATE_SCENE, this._onSceneUpdate.bind(this));
    this._registerHook(HOOKS_CORE.UPDATE_ACTOR, this._onActorUpdate.bind(this));
    this._registerHook(HOOKS_CORE.RENDER_CHAT_INPUT, this._onRenderChatInput.bind(this));

    game.users.forEach(user => {
      this._onUserConnected(user);
    });
  }

  static _registerPlayerHooks() {
    this._registerHook(HOOKS_DND5E.PRE_ROLL_INITIATIVE_DIALOG, this._onPreRollInitiativeDialog.bind(this));
    // this._registerHook(HOOKS_DND5E.PRE_CONFIGURE_INITIATIVE, this._onPreConfigureInitiative.bind(this));
    
    this._registerHook(HOOKS_DND5E.PRE_ROLL_ATTACK_V2, this._onPreRollAttackV2.bind(this));
    this._registerHook(HOOKS_DND5E.PRE_ROLL_DAMAGE_V2, this._onPreRollDamageV2.bind(this));
    Hooks.on(HOOKS_DND5E.PRE_ROLL_ABILITY_CHECK, (config, dialog, message) => {
      LogUtil.log("_onPreRollAbilityCheckV2", [config, dialog, message]);
      if (config.isRollRequest) {
        dialog.configure = true;
      }
    });
    
    // this._registerHook(HOOKS_DND5E.RENDER_ROLL_CONFIGURATION_DIALOG, this._onRenderRollConfigDialog.bind(this));
  }

  static _onSidebarUpdate(tab) {
    LogUtil.log("_onSidebarUpdate", [tab]);
    updateSidebarClass(isSidebarExpanded());
  }
  
  /**
   * Handle chat input rendering to sync hotbar offset class with menu
   */
  static _onRenderChatInput() {
    LogUtil.log("_onRenderChatInput - syncing offset and faded-ui classes");
    // Find the menu element directly since we can't access the private instance
    const menuElement = document.querySelector('#flash-rolls-menu');
    if (menuElement && menuElement.classList.contains('docked-bottom')) {
      // Use setTimeout to ensure hotbar class changes have been applied
      setTimeout(async () => {
        // Create a minimal menu-like object with the element
        const menuProxy = { element: menuElement };
        RollMenuDragUtil.syncOffsetClass(menuProxy);
        RollMenuDragUtil.syncFadedUIClass(menuProxy);
      }, 50);
    }
  }
  
  /**
   * Handle data after roll configuration
   */
  static _onPostRollConfig(rolls, config, dialog, message) {
    if (config._showRequestedBy && rolls.length > 0) {
      message.data = message.data || {};
      message.data._showRequestedBy = true;
      message.data._requestedBy = config._requestedBy;
    }
  }

  // static _onPostRollDamage(rolls, config, dialog, message) {
  //   LogUtil.log("_onPostRollDamage", [config]);
  //   setTimeout(() => {
  //     GeneralUtil.removeTemplateForItem(config.subject?.item);
  //   }, 3000); 
  // }
  
  static _onCreateChatMessage(a, b, c, d) {
    LogUtil.log('_onCreateChatMessage', [a, b, c, d]);

    // if(data.isFlashRollRequest){
    //   const originatingMessage = data.getFlag("dnd5e", "originatingMessage");
    //   LogUtil.log("_onCreateChatMessage #2", [originatingMessage]);
    // }
  }

  /**
   * Handle data before creating chat message for requested rolls
   */
  static _onPreCreateChatMessage(chatMessage, data, options, userId) {
    LogUtil.log('_onPreCreateChatMessage', [chatMessage, data, options, userId]);

    // if(data.isFlashRollRequest){
    //   const originatingMessage = data.getFlag("dnd5e", "originatingMessage");
    //   LogUtil.log("_onPreCreateChatMessage #2", [originatingMessage]);
    // }

    /*
    if (!game.user.isGM) {
      // Check if this is a Flash Rolls request by looking for our flags
      const hasFlashRollsFlag = message.flags?.[MODULE_ID]?.isFlashRollRequest || 
                               message.flags?.[MODULE_ID]?.groupRollId ||
                               message.getFlag('dnd5e', 'roll')?._requestedBy;
      
      LogUtil.log("_onPreCreateChatMessage #0", [hasFlashRollsFlag]);
      if (hasFlashRollsFlag) {
        const challengeVisibility = game.settings.get("dnd5e", "challengeVisibility");
        LogUtil.log("_onPreCreateChatMessage #1", [challengeVisibility]);
        
        let showDC = true;
        switch(challengeVisibility) {
          case "none":
            showDC = false;
            break;
          case "all":
            showDC = true;
            break;
          case "player":
            showDC = message.author.id === game.user.id || !message.author.isGM;
            break;
          default:
            showDC = true;
            break;
        }
      }
    }
      */

    if (data._showRequestedBy && data.rolls?.length > 0) {
      const requestedBy = data._requestedBy || 'GM';
      const requestedText = game.i18n.format('FLASH_ROLLS.chat.requestedBy', { gm: requestedBy });
      
      const currentFlavor = data.flavor || '';
      data.flavor = currentFlavor ? `${currentFlavor} ${requestedText}` : requestedText;
    }
    
    if (data.flags?.[MODULE_ID]?.groupRollId) {
      LogUtil.log('_onPreCreateChatMessage - Found groupRollId in data flags', [data]);
    }
    
    if (data.rolls?.length > 0 || data.flags?.core?.initiativeRoll) {
      const speaker = data.speaker;
      const actorId = speaker?.actor;
      
      if (actorId) {
        let actor = game.actors.get(actorId);
        
        if (!actor && speaker?.token) {
          const token = canvas.tokens.get(speaker.token);
          if (token?.actor) {
            actor = token.actor;
            LogUtil.log('_onPreCreateChatMessage - Using token actor from speaker', [actor.name, actor.id]);
          }
        }
        
        if (!actor) {
          LogUtil.log('_onPreCreateChatMessage - No actor found', [actorId, speaker]);
          return;
        }
        
        if (game.user.isGM) {
          const baseActorId = actor.isToken ? actor.actor?.id : actor.id;
          const checkIds = [actorId, baseActorId].filter(id => id);
          
          for (const [groupRollId, pendingData] of ChatMessageUtils.pendingRolls.entries()) {
            const actorEntries = pendingData.actorEntries || (pendingData.actors ? pendingData.actors.map(id => ({ actorId: id })) : []);
            if (checkIds.some(id => actorEntries.some(entry => entry.actorId === id))) {
              // This actor is part of a group roll, add the flag
              data.flags = data.flags || {};
              data.flags[MODULE_ID] = data.flags[MODULE_ID] || {};
              data.flags[MODULE_ID].groupRollId = groupRollId;
              data.flags.rsr5e = { processed: true, quickRoll: false};
              LogUtil.log('_onPreCreateChatMessage - Added groupRollId flag (GM)', [groupRollId, actorId]);
              break;
            }
          }
        } else {
          let storedGroupRollId = actor.getFlag(MODULE_ID, 'tempGroupRollId');
          if (!storedGroupRollId && actor.isToken) {
            const baseActor = game.actors.get(actor.actor?.id);
            if (baseActor) {
              storedGroupRollId = baseActor.getFlag(MODULE_ID, 'tempGroupRollId');
              LogUtil.log('_onPreCreateChatMessage - Checking base actor for tempGroupRollId', [baseActor.id, storedGroupRollId]);
            }
          }
          
          if (storedGroupRollId) {
            actor.unsetFlag(MODULE_ID, 'tempGroupRollId');
            if (actor.isToken) {
              const baseActor = game.actors.get(actor.actor?.id);
              if (baseActor) {
                baseActor.unsetFlag(MODULE_ID, 'tempGroupRollId');
              }
            }
          }
          
          let storedInitConfig = actor.getFlag(MODULE_ID, 'tempInitiativeConfig');
          
          if (!storedInitConfig && actor.isToken) {
            const baseActor = game.actors.get(actor.actor?.id);
            if (baseActor) {
              storedInitConfig = baseActor.getFlag(MODULE_ID, 'tempInitiativeConfig');
            }
          }
          
          if (storedInitConfig?.groupRollId || storedGroupRollId) {
            data.flags = data.flags || {};
            data.flags[MODULE_ID] = data.flags[MODULE_ID] || {};
            data.flags[MODULE_ID].groupRollId = storedGroupRollId || storedInitConfig?.groupRollId || '';
            data.flags.rsr5e = { processed: true, quickRoll: false};
          }
        }
      }
    }
  }
  
  /**
   * Handle flavor data before creating chat message
   */
  static _onPreCreateChatMessageFlavor(message, data, options, userId) {
    if (data.rolls?.length > 0 && data.rolls[0]) {
      try {
        const rollData = data.rolls[0];
        if (rollData.options?._customFlavor) {
          data.flavor = rollData.options._customFlavor;
        }
      } catch (error) {
        LogUtil.error("_onPreCreateChatMessageFlavor", [error]);
      }
    }
  }
  
  /**
   * Triggered whenever roll configuration dialog is rendered. 
   * Used to add custom situational bonus from data, since the default DnD5e dialog does not seem to handle that
   */
  static _onRenderRollConfigDialog(app, html, data) {
    LogUtil.log("_onRenderRollConfigDialog #0", [ app, data ]);
    if (app._flashRollsApplied) return;
    
    // const isDamageRoll = app instanceof dnd5e.applications.dice.DamageRollConfigurationDialog;
    // LogUtil.log("_onRenderRollConfigDialog - isDamageRoll?", [isDamageRoll, app.constructor.name]);
    
    const isInitiativeRoll = app.config?.hookNames?.includes('initiativeDialog') || 
                           app.element?.id?.includes('initiative');
    
    if (isInitiativeRoll) {
      const actor = app.config?.subject;
      if (!actor) return;
      
      if (!app._flashRollsTitleApplied) {
        html.querySelector('.window-title').textContent = game.i18n.localize("DND5E.Initiative");
        html.querySelector('.window-subtitle').textContent = actor.name;
        app._flashRollsTitleApplied = true;
      }
      
      const storedConfig = actor.getFlag(MODULE_ID, 'tempInitiativeConfig');      
      if (storedConfig) {
        app._flashRollsApplied = true;
        const situationalInput = html.querySelector('input[name*="situational"]');
        setTimeout(() => {
          situationalInput.dispatchEvent(new Event('change', {
            bubbles: true,
            cancelable: false
          }));
        }, 50);
      }
      
      return;
    }else{
      const situationalInputs = html.querySelectorAll('input[name*="situational"]');
      
      situationalInputs.forEach((input, index) => { 
        LogUtil.log("_onRenderRollConfigDialog - processing input", [index, input.name, input.value]);
        if (!input.value && app.config?.rolls?.[0]?.data?.situational) {
          input.value = app.config.rolls[0].data.situational;
        }
        
        app.config.scaling = true;
        if (input.value) {
          app._flashRollsApplied = true;

          if (app.config?.rolls?.[0]?.data) {
            delete app.config.rolls[0].data.situational;
          }
          
          setTimeout(() => {

            input.dispatchEvent(new Event('change', {
              bubbles: true,
              cancelable: false
            }));
          }, 150);
        }
      });
    }
    
  }
  
  /**
   * Intercept group roll message creation (GM only) - currently unused
   */
  static _onPreCreateChatMessageGM(message, data, options, userId) {
    LogUtil.log("_onPreCreateChatMessageGM", [message, data, options, userId]);
  }
  
  /**
   * Intercept rendered chat messages to handle group rolls
   */
  static _onRenderChatMessageHTML(message, html, context) {
    // Check if we should hide challenge visibility for Flash Rolls messages
    // This handles the case where the player is the message author but shouldn't see DCs
    LogUtil.log("_onRenderChatMessageHTML #0", [message, html, context]);

    ChatMessageUtils.interceptRollMessage(message, html, context);
    
    // Handle group roll messages
    if (message.getFlag(MODULE_ID, 'isGroupRoll')) {
      // Handle NPC hiding
      const SETTINGS = getSettings();
      const globalHidden = SettingsUtil.get(SETTINGS.groupRollNPCHidden.tag);
      const messageHidden = message.getFlag(MODULE_ID, 'npcHiddenOverride');
      const isGM = game.user.isGM;
      
      // Hide NPCs based on global setting and message override
      // If override exists, use it; otherwise use global setting
      const shouldHideNPCs = (messageHidden !== undefined ? messageHidden : globalHidden) && !isGM;
      
      if (shouldHideNPCs) {
        const flagData = message.getFlag(MODULE_ID, 'rollData');
        if (flagData && flagData.results) {
          const actorResults = html.querySelectorAll('.actor-result');
          actorResults.forEach((element, index) => {
            const result = flagData.results[index];
            if (result) {
              const actor = game.actors.get(result.actorId);
              const shouldHide = actor && !actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
              
              if (shouldHide) {
                element.classList.add('npc-hidden');
              }
            }
          });
        }
      }
      
      // Attach group roll event listeners
      ChatMessageUtils._attachGroupRollListeners(html, message);
    }
    
    this._addSelectTargetsButton(message, html);

    if(game.user.isGM){
      // Try to get item from context first, then from message flags
      let item = context.subject?.item;
      if (!item && message.flags?.dnd5e?.item?.uuid) {
        item = fromUuidSync(message.flags.dnd5e.item.uuid);
      }
      
      LogUtil.log("_onRenderChatMessageHTML - item", [item, context, message.flags?.dnd5e?.item]);
      if (item) {
        // Clear the activity config cache for this item after the message is rendered
        setTimeout(() => {
          HooksUtil.activityConfigCache.delete(item.id);
          LogUtil.log("_onRenderChatMessageHTML - cleared activity config cache", [item.id]);
          GeneralUtil.removeTemplateForItem(item);
        }, 3000); 
      }
    }

    LogUtil.log("_onRenderChatMessageHTML", [message, html, context]);

    if (!game.user.isGM) {
      // Check if this is a Flash Rolls request by looking for our flags
      const hasFlashRollsFlag = message.flags?.[MODULE_ID]?.isFlashRollRequest || 
                               message.flags?.[MODULE_ID]?.groupRollId ||
                               message.getFlag('dnd5e', 'roll')?._requestedBy;
      
      LogUtil.log("_onRenderChatMessageHTML #1", [hasFlashRollsFlag]);
      if (hasFlashRollsFlag) {
        const challengeVisibility = game.settings.get("dnd5e", "challengeVisibility");
        LogUtil.log("_onRenderChatMessageHTML #2", [challengeVisibility]);
        
        let showDC = true;
        switch(challengeVisibility) {
          case "none":
            showDC = false;
            break;
          case "all":
            showDC = true;
            break;
          case "player":
            showDC = message.author.id === game.user.id || !message.author.isGM;
            LogUtil.log("_onRenderChatMessageHTML #3", [message.author.id, game.user.id, showDC]);
            break;
          default:
            showDC = true;
            break;
        }
        
        if (showDC===false) {
          setTimeout(() => {
            const chatCard = html.querySelectorAll("[data-display-challenge]");
            chatCard.forEach((el) => delete el.dataset.displayChallenge);
            
            const diceTotals = html.querySelectorAll(".success, .failure, .critical, .fumble");
            LogUtil.log("_onRenderChatMessageHTML #4", [html, diceTotals]);
            diceTotals?.forEach((el) => {
              LogUtil.log("_onRenderChatMessageHTML #4b", [el]);
              el.classList.remove("success", "failure", "critical", "fumble");
            });
              
            // Remove the success/failure icons
            diceTotals?.forEach((el) => el.querySelector(".icons")?.remove());
            LogUtil.log("_onRenderChatMessageHTML #5", [html]);
            
            // Optionally hide DC values in the message content
            html.querySelectorAll(".save-dc, .dc, .target-dc").forEach((el) => {
              const text = el.textContent;
              if (text && text.includes("DC")) {
                el.textContent = text.replace(/DC\s*\d+/gi, "");
              }
            });
          }, 50);
        }
      }
    }
    return false
    
  }
  
  /**
   * Add "Select Targeted" button to damage roll messages with saves
   * @param {ChatMessage} message - The chat message
   * @param {jQuery} html - The rendered HTML
   */
  static _addSelectTargetsButton(message, html) {
    if(!game.user.isGM) return;
    LogUtil.log("_addSelectTargetsButton #0", [message, html, html.querySelector('.message-content')]);
    if (message.flags?.dnd5e?.roll?.type !== 'damage' || html.querySelector('.select-targeted')) return;
    
    const button = document.createElement('button');
    button.className = 'select-targeted';
    button.type = 'button';
    button.setAttribute("data-tooltip-direction", "LEFT");
    button.setAttribute("data-tooltip", "Select Targeted");
    button.innerHTML = '<i class="fas fa-crosshairs"></i>';
    
    button.addEventListener('click', (event) => {
      event.preventDefault();
      this._selectTargetedTokens(event);
    });
    
    html.querySelector('.message-content').appendChild(button);
    message.update({
      content: html
    });
  }
  
  /**
   * Select all currently targeted tokens as damage targets
   * @param {ChatMessage} message - The chat message
   */
  static _selectTargetedTokens(event) {
    const message = event.currentTarget.closest('.chat-message');
    const targets = message.querySelectorAll("[data-target-uuid]");
    
    if (targets.length === 0) {
      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noTargetedTokens"));
      return;
    }

    for ( let i=0; i < targets.length; i++ ) {
      const target = targets[i];
      const actorId = target.dataset.targetUuid.split('Actor.')[1];
      const tokens = canvas.tokens.placeables.filter(t => {
        return t.document.actor?.id === actorId || t.document.baseActor?.id === actorId;
      });
      tokens.forEach((token, jQuerj) => {
        if(token && token.control){
          token.control({ releaseOthers: i===0 });
        }
      });
    }
  }
  
  /**
   * Request dice configuration from the connected user
   */
  static _onUserConnected(user) {
    if (user.active && user.id !== game.user.id) {
      DiceConfigUtil.requestDiceConfigFromUser(user.id);
    }
  }

  /**
   * Handle token create/delete events to refresh roll requests menu
   * @param {Token} token - The token document
   * @param {Object} options - Creation/deletion options  
   * @param {string} userId - The user ID who performed the action
   */
  static _onTokenChange(token, options, userId) {
    LogUtil.log('HooksUtil._onTokenChange - Re-rendering roll requests menu due to token create/delete');
    RollRequestsMenu.refreshIfOpen();
  }

  static _onSettingUpdate(setting, value, options, userId) {
    const SETTINGS = getSettings();
    const MODULE = { ID: 'flash-rolls-5e' };
    
    if (setting.key === `${MODULE.ID}.${SETTINGS.showOnlyPCsWithToken.tag}` ||
        setting.key === `${MODULE.ID}.${SETTINGS.compactMode.tag}` ||
        setting.key === `${MODULE.ID}.${SETTINGS.menuLayout.tag}`) {
      
      LogUtil.log('HooksUtil._onSettingUpdate - Re-rendering roll requests menu due to setting change', [setting.key]);
      RollRequestsMenu.refreshIfOpen();
    }else if(setting.key === `core.uiConfig`){
      SettingsUtil.updateColorScheme();
      RollRequestsMenu.refreshIfOpen();
    }
  }

  static _onSceneUpdate(scene, changes, options, userId) {
    if (changes.active === true) {
      LogUtil.log('HooksUtil._onSceneUpdate - Re-rendering roll requests menu due to active scene change');
      RollRequestsMenu.refreshIfOpen();
    }
  }

  static _onActorUpdate(actor, changes, options, userId) {
    LogUtil.log("HooksUtil._onActorUpdate", [actor, changes]);
    const ownershipChanged = changes['==ownership'] !== undefined;
    const statsChanged = changes.system?.attributes?.hp || 
                        changes.system?.attributes?.ac || 
                        changes.system?.attributes?.spell?.dc ||
                        changes.system?.skills?.prc ||
                        changes.system?.abilities ||
                        changes.system?.attributes?.prof;

    if (!statsChanged && !ownershipChanged) return;
    
    LogUtil.log("HooksUtil._onActorUpdate - Re-rendering roll requests menu due to actor update", [actor, changes]);
    RollRequestsMenu.refreshIfOpen();
  }

  /**
   * Handle render ApplicationV2
   */
  static _onRenderApplicationV2(app, html, options) {
    LogUtil.log("_onRenderApplicationV2", [app, html, options]);
  }
  
  /**
   * Handle render chat log to attach listeners to existing group roll messages
   */
  static _onRenderChatLog(app, html) {
    const groupRollElements = html.querySelectorAll('.flash5e-group-roll');
    groupRollElements.forEach(element => {
      const messageElement = element.closest('.chat-message');
      if (messageElement) {
        const messageId = messageElement.dataset.messageId;
        const message = game.messages.get(messageId);
        if (message && message.getFlag(MODULE_ID, 'isGroupRoll')) {
          
          // Handle NPC hiding
          const SETTINGS = getSettings();
          const globalHidden = SettingsUtil.get(SETTINGS.groupRollNPCHidden.tag);
          const messageHidden = message.getFlag(MODULE_ID, 'npcHiddenOverride');
          const isGM = game.user.isGM;
          
          // Hide NPCs based on global setting and message override
          // If override exists, use it; otherwise use global setting
          const shouldHideNPCs = (messageHidden !== undefined ? messageHidden : globalHidden) && !isGM;
          
          if (shouldHideNPCs) {
            const flagData = message.getFlag(MODULE_ID, 'rollData');
            if (flagData && flagData.results) {
              const actorResults = element.querySelectorAll('.actor-result');
              actorResults.forEach((actorElement, index) => {
                const result = flagData.results[index];
                if (result) {
                  const actor = game.actors.get(result.actorId);
                  const shouldHide = actor && !actor.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
                  
                  if (shouldHide) {
                    actorElement.classList.add('npc-hidden');
                  }
                }
              });
            }
          }
          
          // Attach group roll listeners
          ChatMessageUtils._attachGroupRollListeners(element, message);
        }
      }
    });
  }
  
  /**
   * Handle render Sidebar
   */
  static _onRenderSidebar(app, html, options) {
    LogUtil.log("_onRenderSidebar", [app, html]);
    if(game.ready){
      SidebarUtil.addSidebarControls(app, html);
    }
  }
  
  /**
   * Register a hook and track it
   * @param {string} hookName - The hook name
   * @param {Function} handler - The handler function
   * @private
   */
  static _registerHook(hookName, handler) {
    const hookId = Hooks.on(hookName, handler);
    this.registeredHooks.set(`${hookName}_${hookId}`, hookId);
    return hookId;
  }
  
  /**
   * Unregister all hooks (for cleanup)
   */
  static unregisterAll() {
    this.registeredHooks.forEach((hookId, key) => {
      const hookName = key.split('_')[0];
      Hooks.off(hookName, hookId);
    });
    this.registeredHooks.clear();
  }
  
  /**
   * Check if a hook is registered
   * @param {string} hookName - The hook name to check
   * @returns {boolean}
   */
  static isRegistered(hookName) {
    for (const key of this.registeredHooks.keys()) {
      if (key.startsWith(`${hookName}_`)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Triggered before a roll is made
   * @param {*} config 
   * @param {*} dialogOptions 
   * @param {*} messageOptions 
   */
  static _onPreRoll(config, dialogOptions, messageOptions, d) {
    LogUtil.log("_onPreRoll #0", [config, dialogOptions, messageOptions, d]);
    
    // For attack rolls, check if there's a stored flag indicating this should skip the dialog
    if (config.subject?.item) {
      const stored = config.subject.item.getFlag(MODULE_ID, 'tempAttackConfig');
      LogUtil.log("_onPreRoll - flag", [stored]);
      if (stored?.skipRollDialog === true) {
        dialogOptions.configure = false;
        LogUtil.log("_onPreRoll - Local GM roll, skipping dialog via stored flag");
      }
    }
  }
  
  /**
   * Actor5e.rollHitDie concatenates our roll data with its own roll data, creating two rolls.
   * We fix this behavior here so situational bonus is added correctly without duplicating rolls
   */
  static _onPreRollHitDieV2(config, dialogOptions, messageOptions) {
    LogUtil.log("_onPreRollHitDieV2 triggered", [config, dialogOptions, messageOptions]);
    
    if (config.rolls && config.rolls.length > 1) {
      const allSituationalBonuses = [];
      
      for(let i = 0; i < config.rolls.length; i++){
        const roll = config.rolls[i];
        if (roll && roll.data && roll.data.situational) {
          allSituationalBonuses.push(roll.data.situational);
        }
      }
      
      if (allSituationalBonuses.length > 0) {
        if (!config.rolls[0].data) {
          config.rolls[0].data = {};
        }
        
        const uniqueBonuses = [...new Set(allSituationalBonuses)];
        
        config.rolls[0].data.situational = uniqueBonuses.map(bonus => {
          const trimmedBonus = bonus.toString().trim();
          if (trimmedBonus.startsWith('-')) {
            return `(${trimmedBonus})`;
          } else if (trimmedBonus.startsWith('+')) {
            return `${trimmedBonus.substring(1)}`;
          } else {
            return `${trimmedBonus}`;
          }
        }).join(' + ');
        
        if(game.user.isGM && !config.rolls[0].parts.find(p => p.includes("@situational"))){
          config.rolls[0].parts.push("@situational");
        }
      }
      
      config.rolls = config.rolls.slice(0, 1);
      LogUtil.log("Cleaned up hit die rolls", config.rolls);
    }
  }
  
  /**
   * Handle pre-roll initiative dialog hook to add situational bonus
   */
  static _onPreRollInitiativeDialog(config, dialogOptions, messageOptions) {
    const actor = config.subject;
    const storedConfig = actor.getFlag(MODULE_ID, 'tempInitiativeConfig');

    LogUtil.log("_onPreRollInitiativeDialog triggered", [config, storedConfig, dialogOptions, messageOptions]);
    config.advantage = storedConfig?.advantage || config.advantage || false;
    config.disadvantage = storedConfig?.disadvantage || config.disadvantage || false;
    
    config.rollMode = storedConfig?.rollMode || config.rollMode || CONST.DICE_ROLL_MODES.PUBLIC;
    messageOptions.rollMode = storedConfig?.rollMode || messageOptions.rollMode || CONST.DICE_ROLL_MODES.PUBLIC;
    
    if (storedConfig.rolls?.[0]?.data?.situational && config.rolls?.[0]?.data) {
      config.rolls[0].data.situational = storedConfig.rolls[0].data.situational;
    }
  
  }
  
  /**
   * Handle pre-roll attack hook to restore GM-configured options
   */
  static _onPreRollAttackV2(config, dialogOptions, messageOptions) {
    LogUtil.log("_onPreRollAttackV2 triggered", [config, dialogOptions, messageOptions]);
    
    const stored = config.subject?.item?.getFlag(MODULE_ID, 'tempAttackConfig');
    if (stored) {
      LogUtil.log("_onPreRollAttackV2 - flag", [stored]);
      
      // Always apply the stored configuration
      if (stored.attackMode) config.attackMode = stored.attackMode;
      if (stored.ammunition) config.ammunition = stored.ammunition;
      if (stored.mastery !== undefined) config.mastery = stored.mastery;
      config.advantage = stored.advantage || false;
      config.disadvantage = stored.disadvantage || false;
      messageOptions.rollMode = stored.rollMode || messageOptions.rollMode || CONST.DICE_ROLL_MODES.PUBLIC;
      
      // If skipRollDialog is true, this is a local GM roll that should skip the dialog
      if(stored.skipRollDialog === true) {
        dialogOptions.configure = false;
        LogUtil.log("_onPreRollAttackV2 - Local GM roll, skipping dialog", [stored]);
        // Don't return early - we still need to apply situational bonus below
      }
      
      if (stored.situational) {
        if (!config.rolls || config.rolls.length === 0) {
          config.rolls = [{
            parts: [],
            data: {},
            options: {}
          }];
        }
        
        if (!config.rolls[0].data) {
          config.rolls[0].data = {};
        }
        config.rolls[0].data.situational = stored.situational;
      }
      LogUtil.log("_onPreRollAttackV2 - Applied stored configuration to attack roll", [config, messageOptions]);
    }
  }

  /**
   * Handle pre-roll damage hook to restore GM-configured options
   */
  static _onPreRollDamageV2(config, dialogOptions, messageOptions) {
    // console.trace("Flash Rolls 5e - _onPreRollDamageV2 triggered #0", [config]);
    const stored = config.subject?.item?.getFlag(MODULE_ID, 'tempDamageConfig');
    LogUtil.log("_onPreRollDamageV2 triggered #0", [config, dialogOptions, messageOptions]);
    
    config.rolls = RollHelpers.consolidateRolls(config.rolls);
    if(config.midiOptions && !game.user.isGM
      && config.subject?.type === ACTIVITY_TYPES.DAMAGE
    ){
      dialogOptions.configure = true;
      // config.midiOptions = {
      //   ...config.midiOptions,
      //   fastForwardDamage: false,
      //   workflowOptions: {
      //     ...config.midiOptions.workflowOptions,
      //     fastForwardDamage: false,
      //     autoRollAttack: false,
      //     autoRollDamage: false,
      //     forceCompletion: false
      //   }
      // }
    }
    if (stored) {
      LogUtil.log("_onPreRollDamageV2 - Found stored request config from flag", [stored, stored.situational]);
      
      // Always apply the stored configuration
      if (stored.critical) config.critical = stored.critical;
      messageOptions.rollMode = stored.rollMode || messageOptions.rollMode || CONST.DICE_ROLL_MODES.PUBLIC;
      
      // If skipRollDialog is true, this is a local GM roll that should skip the dialog
      if(stored.skipRollDialog === true) {
        dialogOptions.configure = false;
        LogUtil.log("_onPreRollDamageV2 - Local GM roll, skipping dialog", [stored]);
        // Don't return early - we still need to apply situational bonus below
      }
      
      LogUtil.log("_onPreRollDamageV2 triggered #1", [config, dialogOptions, messageOptions]);
      
      if (stored.situational) {
        if (!config.rolls || config.rolls.length === 0) {
          config.rolls = [{
            parts: [],
            data: {},
            options: {}
          }];
        }
        
        if (!config.rolls[0].data) {
          config.rolls[0].data = {};
        }
        config.rolls[0].data.situational = stored.situational;
        
        // Store the situational for the render hook to handle
        config._flashRollsSituational = stored.situational;
      }
      LogUtil.log("_onPreRollDamageV2 - Applied stored configuration to damage roll", [config, messageOptions]);
    }
  }
  
  /**
   * Handle pre-use activity hook to prevent usage messages when GM intercepts rolls
   */
  static _onPreUseActivity(activity, config, dialog, message) {
    // console.trace("Flash Rolls 5e - _onPreUseActivity triggered #0", [activity, config, dialog, message]);
    LogUtil.log("_onPreUseActivity #0", [activity, config, dialog, message]);   
    const SETTINGS = getSettings();
    const requestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    if (!requestsEnabled || !rollInterceptionEnabled) return;  

    const actor = activity.actor;
    const actorOwner = GeneralUtil.getActorOwner(actor);
    const isPlayerActor = isPlayerOwned(actor) && actorOwner.active;
    const isLocalRoll = game.users.isGM ? !isPlayerActor || !config.isRollRequest : !config.isRollRequest;

    LogUtil.log("_onPreUseActivity #1 - isLocalRoll", [config.create, isLocalRoll]); 
    activity.item.unsetFlag(MODULE_ID, 'tempAttackConfig'); 
    activity.item.unsetFlag(MODULE_ID, 'tempDamageConfig'); 
    activity.item.unsetFlag(MODULE_ID, 'tempSaveConfig'); 

    if (!actor) return;

    const showConsumptionDialog = showConsumptionConfig();
    dialog.configure = dialog.configure ? showConsumptionDialog : false;
    // dialog.configure = game.user.isGM && config.skipRollDialog!==undefined ? !config.skipRollDialog : showConsumptionDialog;

    config.consume = getConsumptionConfig(config.consume || {}, isLocalRoll);
    config.create = getCreateConfig(config.create || {}, isLocalRoll);

    if(config.midiOptions && 
      (activity.type === ACTIVITY_TYPES.DAMAGE || activity.type === ACTIVITY_TYPES.SAVE)){
      dialog.configure = false;
      activity.midiOptions = {
        ...config.midiOptions,
        fastForwardDamage: false,
        workflowOptions: {
          // ...activity.midiOptions.workflowOptions,
          fastForwardDamage: false,
          autoRollAttack: false,
          autoRollDamage: false,
          forceCompletion: false
        }
      }
      config.midiOptions = {
        ...config.midiOptions,
        fastForwardDamage: false,
        workflowOptions: {
          ...config.midiOptions.workflowOptions,
          fastForwardDamage: false,
          autoRollAttack: false,
          autoRollDamage: false
        }
      }
      // return false;
      LogUtil.log("_onPreUseActivity - activity", [activity]);
    }
    LogUtil.log("_onPreUseActivity - block msg", [config, dialog, message]);
    if(!game.user.isGM) return;
    
    if (actorOwner && actorOwner.active && !actorOwner.isGM) {
     
      if (dialog.configure===true) {
        LogUtil.log("Preventing usage message for player-owned actor", [actor.name]);
        message.create = false;
      }
    }else if(config.isRollRequest !== undefined){
      message.create = false;
    }
  }

  /**
   * 
   * @param {Activity} activity - Activity being used
   * @param {ActivityUseConfiguration} config - Configuration info for the activation
   * @param {ActivityUsageResults} results - Final details on the activation
   * @returns 
   */
  static _onPostUseActivity(activity, config, results) {
    const SETTINGS = getSettings();
    const requestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const rollInterceptionEnabled = SettingsUtil.get(SETTINGS.rollInterceptionEnabled.tag);
    const isGM = game.user.isGM;

    LogUtil.log("_onPostUseActivity #0", [activity, config, results]);

    if(!game.user.isGM && config.midiOptions){
      config.midiOptions = {
        ...config.midiOptions,
        fastForwardDamage: false,
        workflowOptions: {
          ...config.midiOptions.workflowOptions,
          fastForwardDamage: false,
          autoRollAttack: false,
          autoRollDamage: false,
          forceCompletion: false
        }
      }
    }
    if(!requestsEnabled || !rollInterceptionEnabled) return;
    const actorOwner = GeneralUtil.getActorOwner(activity.actor);
    const isOwnerActive = actorOwner && actorOwner.active && actorOwner.id !== game.user.id;
    const skipRollDialog = RollHelpers.shouldSkipRollDialog(isOwnerActive, {isPC: isOwnerActive, isNPC: !isOwnerActive} );
    const isLocalRoll = game.users.isGM ? !isOwnerActive || !config.isRollRequest : !config.isRollRequest;
    results.configure = game.user.isGM && config.skipRollDialog!==undefined ? !config.skipRollDialog : !game.user.isGM ||(isOwnerActive && !skipRollDialog)

    if (config.skipRollDialog===false && (!actorOwner?.active || actorOwner.isGM)) {
      LogUtil.log("Preventing usage message - no owning player for actor", [activity.actor]);
      return;
    }
    
    // Store activity configuration for GM dialogs to access spell/scaling/consume/create data
    if (game.user.isGM && activity.item) {
      const activityConfig = {
        spell: config.spell || {},
        scaling: config.scaling,
        consume: config.consume || {},
        create: config.create || {}
      };
      
      // Use in-memory cache with item ID as key - synchronous and immediate
      const cacheKey = activity.item.id;
      HooksUtil.activityConfigCache.set(cacheKey, activityConfig);
      LogUtil.log('_onPostUseActivity - storing activity config in cache', [cacheKey, activityConfig]);
      
      // Clear old entries after 30 seconds to prevent memory leaks
      setTimeout(() => {
        HooksUtil.activityConfigCache.delete(cacheKey);
        LogUtil.log('_onPostUseActivity - cleared old cache entry', [cacheKey]);
      }, 30000);
    }

    if(activity.type === ACTIVITY_TYPES.SAVE && activity.damage?.parts?.length > 0){
      LogUtil.log("_onPostUseActivity #1 - roll triggered", [activity, config]);
      activity.rollDamage(config, {
        configure: config.skipRollDialog!==undefined ? !config.skipRollDialog : !game.user.isGM ||(isOwnerActive && !skipRollDialog)
        // configure: game.user.isGM && config.skipRollDialog!==undefined ? !config.skipRollDialog : !game.user.isGM ||(isOwnerActive && !skipRollDialog)
      }, {});
    }

  }
  
  /**
   * Handle rendering of skill/tool configuration dialog to fix message flavor
   */
  static _onRenderSkillToolDialog(app, html, data) {
    LogUtil.log("_onRenderSkillToolDialog triggered", [app]);
    if (app._abilityFlavorFixed) return;
    
    const abilitySelect = html.querySelector('select[name="ability"]');
    if (!abilitySelect) return;
    
    if (app.config?.isRollRequest && app.config?.ability) {
      const selectedAbility = abilitySelect.value;
      const configAbility = app.config.ability;

      if (selectedAbility === configAbility) {
        app._abilityFlavorFixed = true;
        
        setTimeout(() => {
          const changeEvent = new Event('change', {
            bubbles: true,
            cancelable: true
          });
          abilitySelect.dispatchEvent(changeEvent);
        }, 50);
      }
    }
  }

  /**
   * TEMPLATES
   */
  static onRefreshTemplate(template, options) {
    if(!template.isOwner){ return; }
    const throttleKey = `refresh-template-${template.id}`;
    const SETTINGS = getSettings();
    const targettingSetting = SettingsUtil.get(SETTINGS.templateAutoTarget.tag);
    
    if (HooksUtil.throttleTimers[throttleKey]) {
      clearTimeout(HooksUtil.throttleTimers[throttleKey]);
    }

    HooksUtil.throttleTimers[throttleKey] = setTimeout(() => {
      let maxDisposition = 3;

      switch(targettingSetting){
        case 1:
          maxDisposition = 3; break;
        case 2: 
          maxDisposition = 0; break;
        default: 
          return;
      }

      game.user.targets.forEach(t => t.setTarget(false, { releaseOthers: false }));
      
      const tokensToTarget = [];
      for(let token of canvas.tokens.placeables){
        if(token.document.disposition <= maxDisposition && template.shape.contains(token.center.x-template.x,token.center.y-template.y)){
          tokensToTarget.push(token);
        }
      }
      
      tokensToTarget.forEach((token, i) => {
        token.setTarget(true, { 
          releaseOthers: i === 0,  // Only release others on first token
          groupSelection: true 
        });
      });
      
      if (tokensToTarget.length > 0) {
        game.user.broadcastActivity({ targets: game.user.targets.ids });
      }
      
      delete HooksUtil.throttleTimers[throttleKey];
    }, 50);
  }

  /**
   * Handle client setting changes (including core.uiConfig)
   * @param {string} key - The setting key that changed
   * @param {*} value - The new value
   * @param {Object} options - Additional options
   */
  static _onClientSettingChanged(key, value, options) {
    LogUtil.log('HooksUtil._onClientSettingChanged', [key, value, options]);
    
    // Check if the UI config changed (includes color scheme)
    if (key === "core.uiConfig") {
      this._updateMenuColorScheme();
    }
  }

  /**
   * Handle browser color scheme changes
   */
  static _onBrowserColorSchemeChanged() {
    LogUtil.log('HooksUtil._onBrowserColorSchemeChanged - Browser color scheme changed');
    
    // Only update if we're using browser default (interface theme is undefined)
    const foundryUiConfig = game.settings.get('core','uiConfig');
    if (!foundryUiConfig?.colorScheme?.interface) {
      this._updateMenuColorScheme();
    }
  }

  /**
   * Update the menu's color scheme classes
   */
  static _updateMenuColorScheme() {
    const oldColorScheme = SettingsUtil.coreColorScheme;
    SettingsUtil.updateColorScheme();
    const newColorScheme = SettingsUtil.coreColorScheme;
    
    // Update the menu if it's open and color scheme changed
    const menuInstance = RollRequestsMenu.getInstance();
    if (menuInstance?.rendered && menuInstance.classList) {
      // Remove old theme class
      if (oldColorScheme) {
        menuInstance.classList.remove(`theme-${oldColorScheme}`);
      }
      // Add new theme class
      if (newColorScheme) {
        menuInstance.classList.add(`theme-${newColorScheme}`);
      }
    }
  }
}