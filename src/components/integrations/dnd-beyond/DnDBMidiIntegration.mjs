import { MODULE_ID } from "../../../constants/General.mjs";
import { LogUtil } from "../../utils/LogUtil.mjs";
import { GeneralUtil } from "../../utils/GeneralUtil.mjs";
import { ModuleHelpers } from "../../helpers/ModuleHelpers.mjs";
import { DnDBRollUtil } from "./DnDBRollUtil.mjs";

/**
 * Handles DnDB roll integration with Midi-QOL workflows
 * Uses dnd5e roll configuration hooks to inject DDB dice values into Midi workflows
 */
export class DnDBMidiIntegration {

  static _pendingDnDBRoll = null;

  /**
   * Check if Midi-QOL is active
   * @returns {boolean}
   */
  static isActive() {
    return GeneralUtil.isModuleOn('midi-qol');
  }

  /**
   * Store a pending DnDB roll for injection into the next Foundry roll
   * @param {Object} rollInfo - Parsed roll info from DnDBRollParser
   */
  static setPendingRoll(rollInfo) {
    this._pendingDnDBRoll = rollInfo;
    LogUtil.log("DnDBMidiIntegration.setPendingRoll", [rollInfo]);
  }

  /**
   * Clear any pending DnDB roll
   */
  static clearPendingRoll() {
    this._pendingDnDBRoll = null;
  }

  /**
   * Get and consume the pending DnDB roll
   * @returns {Object|null} The pending roll info or null
   */
  static consumePendingRoll() {
    const roll = this._pendingDnDBRoll;
    this._pendingDnDBRoll = null;
    return roll;
  }

  /**
   * Check if there's a pending DnDB roll
   * @returns {boolean}
   */
  static hasPendingRoll() {
    return this._pendingDnDBRoll !== null;
  }

  static _waitingForDnDBDamage = false;

  /**
   * Register hooks for roll configuration injection
   * Called during module initialization
   */
  static registerHooks() {
    Hooks.on("dnd5e.preRollAttack", this._onPreRollAttack.bind(this));
    Hooks.on("dnd5e.preRollDamage", this._onPreRollDamage.bind(this));
    Hooks.on("dnd5e.postAttackRollConfiguration", this._onPostAttackRollConfiguration.bind(this));
    Hooks.on("dnd5e.postDamageRollConfiguration", this._onPostDamageRollConfiguration.bind(this));
    Hooks.on("midi-qol.preDamageRoll", this._onMidiPreDamageRoll.bind(this));
    LogUtil.log("DnDBMidiIntegration: Registered roll configuration hooks");
  }

  /**
   * Handle Midi preDamageRoll hook - block auto-damage when waiting for DDB damage
   * Returns false to cancel the roll if we're waiting for DDB damage
   */
  static _onMidiPreDamageRoll(workflow, activity, config, dialog, message) {
    if (this._waitingForDnDBDamage && !this.hasPendingRoll()) {
      LogUtil.log("DnDBMidiIntegration._onMidiPreDamageRoll - Blocking auto-damage, waiting for DDB damage roll");
      return false;
    }
    return true;
  }

  /**
   * Handle pre-roll attack hook to force skip dialog for DDB rolls
   * This runs before the roll dialog would show
   */
  static _onPreRollAttack(config, dialog, message) {
    if (!this.hasPendingRoll()) return;
    dialog.configure = false;
    LogUtil.log("DnDBMidiIntegration._onPreRollAttack - Forcing dialog.configure = false");
  }

  /**
   * Handle pre-roll damage hook to force skip dialog for DDB rolls
   * This runs before the roll dialog would show
   */
  static _onPreRollDamage(config, dialog, message) {
    if (!this.hasPendingRoll()) return;
    dialog.configure = false;
    LogUtil.log("DnDBMidiIntegration._onPreRollDamage - Forcing dialog.configure = false");
  }

  /**
   * Handle post attack roll configuration hook
   * Injects DnDB dice values into the attack roll before evaluation
   * @param {Roll[]} rolls - The constructed but unevaluated rolls
   * @param {Object} config - Roll configuration
   * @param {Object} dialog - Dialog configuration
   * @param {Object} message - Message configuration
   */
  static _onPostAttackRollConfiguration(rolls, config, dialog, message) {
    if (!this.hasPendingRoll()) return;

    const pendingRoll = this._pendingDnDBRoll;
    const ddbRoll = pendingRoll?.rawRolls?.[0];
    if (!ddbRoll || !rolls?.length) return;

    LogUtil.log("DnDBMidiIntegration._onPostAttackRollConfiguration - Injecting DDB values", [rolls, ddbRoll]);

    for (const roll of rolls) {
      this._injectDiceValuesPreEval(roll, ddbRoll);
    }

    this._addDnDBFlags(message, pendingRoll);
    this.clearPendingRoll();
  }

  /**
   * Handle post damage roll configuration hook
   * Injects DnDB dice values into the damage roll before evaluation
   * @param {Roll[]} rolls - The constructed but unevaluated rolls
   * @param {Object} config - Roll configuration
   * @param {Object} dialog - Dialog configuration
   * @param {Object} message - Message configuration
   */
  static _onPostDamageRollConfiguration(rolls, config, dialog, message) {
    if (!this.hasPendingRoll()) return;

    const pendingRoll = this._pendingDnDBRoll;
    const ddbRoll = pendingRoll?.rawRolls?.[0];
    if (!ddbRoll || !rolls?.length) return;

    LogUtil.log("DnDBMidiIntegration._onPostDamageRollConfiguration - Injecting DDB values", [rolls, ddbRoll]);

    for (const roll of rolls) {
      this._injectDiceValuesPreEval(roll, ddbRoll);
    }

    this._addDnDBFlags(message, pendingRoll);
    this.clearPendingRoll();
  }

  /**
   * Inject DnDB dice values into a roll BEFORE evaluation
   * Modifies the roll terms to include pre-determined values that will be used during evaluate()
   * @param {Roll} roll - The unevaluated Foundry roll
   * @param {Object} ddbRoll - The DnDB roll data
   */
  static _injectDiceValuesPreEval(roll, ddbRoll) {
    const notation = ddbRoll.diceNotation;
    if (!notation) return;

    const allDnDBDice = [];
    for (const set of notation.set || []) {
      for (const die of set.dice || []) {
        allDnDBDice.push(die.dieValue);
      }
    }

    let ddbDiceIndex = 0;
    const Die = foundry.dice.terms.Die;

    for (const term of roll.terms) {
      if (term instanceof Die) {
        term.results = [];
        for (let i = 0; i < term.number; i++) {
          if (ddbDiceIndex < allDnDBDice.length) {
            term.results.push({
              result: allDnDBDice[ddbDiceIndex],
              active: true
            });
            ddbDiceIndex++;
          }
        }
        term._evaluated = true;
      }
    }

    LogUtil.log("DnDBMidiIntegration._injectDiceValuesPreEval - Injected values", [roll.formula, allDnDBDice]);
  }

  /**
   * Add DnDB identification flags to the message configuration
   * @param {Object} message - Message configuration object
   * @param {Object} rollInfo - The DnDB roll info
   */
  static _addDnDBFlags(message, rollInfo) {
    if (!message?.data) {
      message.data = {};
    }
    if (!message.data.flags) {
      message.data.flags = {};
    }

    message.data.flags[MODULE_ID] = {
      isDnDBRoll: true,
      ddbCharacterId: rollInfo.characterId,
      ddbSource: rollInfo.source,
      rollType: rollInfo.rollType,
      action: rollInfo.action
    };
    message.data.flags.rsr5e = { processed: true, quickRoll: false };
  }

  /**
   * Execute an attack through Midi-QOL workflow with DnDB dice values
   * Does NOT auto-roll damage - waits for separate DDB damage event
   * @param {Actor} actor - The Foundry actor
   * @param {Activity} activity - The attack activity
   * @param {Object} rollInfo - Parsed DnDB roll info
   * @param {Object} options - Additional options
   * @returns {Promise<boolean>} Success status
   */
  static async executeAttackWithMidi(actor, activity, rollInfo, options = {}) {
    const MidiQOL = ModuleHelpers.getMidiQOL();
    if (!MidiQOL) {
      LogUtil.warn("DnDBMidiIntegration: MidiQOL not available");
      return false;
    }

    this.setPendingRoll(rollInfo);
    this._waitingForDnDBDamage = true;

    const usageConfig = {
      consume: { resources: false, spellSlot: false },
      midiOptions: {
        fastForwardAttack: true,
        fastForwardDamage: true,
        autoRollAttack: true,
        autoRollDamage: 'none',
        workflowOptions: {
          fastForwardAttack: true,
          fastForwardDamage: true,
          autoRollAttack: true,
          autoRollDamage: 'none'
        }
      }
    };

    const dialogConfig = { configure: false };
    const messageConfig = { create: true };

    try {
      const result = await MidiQOL.completeActivityUse(activity, usageConfig, dialogConfig, messageConfig);
      const item = activity.item;
      const workflow = this._findWorkflowWaitingForDamage(MidiQOL, item);
      LogUtil.log("DnDBMidiIntegration.executeAttackWithMidi - After completeActivityUse", [
        "result:", result,
        "workflowFound:", !!workflow,
        "workflowState:", workflow?.currentAction,
        "isGM:", game.user.isGM,
        "_waitingForDnDBDamage:", this._waitingForDnDBDamage
      ]);
      return true;
    } catch (error) {
      LogUtil.error("DnDBMidiIntegration.executeAttackWithMidi failed", [error]);
      this.clearPendingRoll();
      this._waitingForDnDBDamage = false;
      return false;
    }
  }

  /**
   * Execute damage through Midi-QOL workflow with DnDB dice values
   * Implements A/B/C routing logic:
   * A - Activity has attack + existing workflow waiting for damage → use that Midi workflow
   * B - Activity is damage-only (no attack, e.g., save spell or auto-hit) → use new Midi workflow
   * C - Activity has attack but NO existing workflow → return false to fall back to vanilla flow
   * @param {Actor} actor - The Foundry actor
   * @param {Activity} activity - The damage activity
   * @param {Object} rollInfo - Parsed DnDB roll info
   * @param {Object} options - Additional options
   * @returns {Promise<boolean>} Success status, false means caller should use vanilla flow
   */
  static async executeDamageWithMidi(actor, activity, rollInfo, options = {}) {
    const MidiQOL = ModuleHelpers.getMidiQOL();
    if (!MidiQOL) {
      LogUtil.warn("DnDBMidiIntegration: MidiQOL not available");
      return false;
    }

    LogUtil.log("DnDBMidiIntegration.executeDamageWithMidi - Entry", [
      "wasWaitingForDnDBDamage:", this._waitingForDnDBDamage,
      "isGM:", game.user.isGM
    ]);

    this._waitingForDnDBDamage = false;

    const item = activity.item;
    const itemRequiresAttack = item?.hasAttack ?? false;
    const workflow = this._findWorkflowWaitingForDamage(MidiQOL, item);

    LogUtil.log("DnDBMidiIntegration.executeDamageWithMidi - Routing decision", [
      "itemRequiresAttack:", itemRequiresAttack,
      "hasWorkflow:", !!workflow,
      "workflowWaitingForDamage:", workflow ? (workflow.currentAction === workflow.WorkflowState_WaitForDamageRoll) : false,
      "item:", item?.name,
      "activity:", activity.name
    ]);

    if (itemRequiresAttack) {
      if (workflow) {
        LogUtil.log("DnDBMidiIntegration: Case A - Item requires attack + existing workflow waiting for damage, using Midi");
        return await this._executeDamageExistingWorkflow(activity, rollInfo, workflow);
      } else {
        LogUtil.log("DnDBMidiIntegration: Case C - Item requires attack but NO workflow waiting for damage, falling back to vanilla");
        return false;
      }
    } else {
      LogUtil.log("DnDBMidiIntegration: Case B - Damage-only item, creating new Midi workflow");
      return await this._executeDamageNewWorkflow(actor, activity, rollInfo, options);
    }
  }

  /**
   * Find a Midi workflow for the given item that is waiting for a damage roll
   * @param {Object} MidiQOL - The MidiQOL module
   * @param {Item} item - The item to find a workflow for
   * @returns {Object|null} The workflow if found and waiting for damage, null otherwise
   */
  static _findWorkflowWaitingForDamage(MidiQOL, item) {
    if (!item || !MidiQOL?.Workflow?.workflows) {
      LogUtil.log("DnDBMidiIntegration._findWorkflowWaitingForDamage - No item or workflows", [
        "item:", item?.name,
        "hasWorkflows:", !!MidiQOL?.Workflow?.workflows
      ]);
      return null;
    }

    const workflows = MidiQOL.Workflow.workflows;
    LogUtil.log("DnDBMidiIntegration._findWorkflowWaitingForDamage - Searching workflows", [
      "itemUuid:", item.uuid,
      "workflowCount:", workflows.size
    ]);

    for (const [key, workflowRef] of workflows.entries()) {
      const workflow = workflowRef instanceof WeakRef ? workflowRef.deref() : workflowRef;
      if (!workflow) continue;

      LogUtil.log("DnDBMidiIntegration._findWorkflowWaitingForDamage - Checking workflow", [
        workflow.id,
        "workflowItemUuid:", workflow.item?.uuid,
        "targetItemUuid:", item.uuid,
        "currentAction:", workflow.currentAction,
        "waitForDamageState:", workflow.WorkflowState_WaitForDamageRoll
      ]);

      if (workflow.item?.uuid === item.uuid &&
          workflow.currentAction === workflow.WorkflowState_WaitForDamageRoll) {
        LogUtil.log("DnDBMidiIntegration._findWorkflowWaitingForDamage - Found workflow", [
          workflow.id,
          "item:", workflow.item?.name,
          "state:", workflow.currentAction
        ]);
        return workflow;
      }
    }

    LogUtil.log("DnDBMidiIntegration._findWorkflowWaitingForDamage - No matching workflow found");
    return null;
  }

  /**
   * Execute damage within an existing Midi workflow (Case A)
   * @param {Activity} activity - The damage activity
   * @param {Object} rollInfo - Parsed DnDB roll info
   * @param {Object} workflow - The existing Midi workflow
   * @returns {Promise<boolean>} Success status
   */
  static async _executeDamageExistingWorkflow(activity, rollInfo, workflow) {
    this.setPendingRoll(rollInfo);

    const rollConfig = {
      workflow: workflow,
      midiOptions: {
        fastForwardDamage: true,
        isCritical: workflow.isCritical,
        workflowOptions: {
          fastForwardDamage: true,
          autoRollDamage: 'always'
        },
        ...workflow.rollOptions
      }
    };

    const dialogConfig = { configure: false };
    const messageConfig = { create: false };

    try {
      await activity.rollDamage(rollConfig, dialogConfig, messageConfig);
      return true;
    } catch (error) {
      LogUtil.error("DnDBMidiIntegration._executeDamageExistingWorkflow failed", [error]);
      this.clearPendingRoll();
      return false;
    }
  }

  /**
   * Execute damage with a new Midi workflow (no existing attack workflow)
   * Used for save spells and other damage-only activities
   * For spells with templates, prompts the user to place the template first
   * @param {Actor} actor - The Foundry actor
   * @param {Activity} activity - The damage activity
   * @param {Object} rollInfo - Parsed DnDB roll info
   * @param {Object} options - Additional options
   * @returns {Promise<boolean>} Success status
   */
  static async _executeDamageNewWorkflow(actor, activity, rollInfo, options = {}) {
    const MidiQOL = ModuleHelpers.getMidiQOL();

    this.setPendingRoll(rollInfo);

    const hasTemplate = activity.target?.template?.type;
    LogUtil.log("DnDBMidiIntegration._executeDamageNewWorkflow", [
      "activity:", activity.name,
      "hasTemplate:", hasTemplate,
      "templateType:", activity.target?.template?.type
    ]);

    const usageConfig = {
      consume: { resources: true, spellSlot: true },
      create: { measuredTemplate: !!hasTemplate, _isDnDBRoll: true },
      midiOptions: {
        fastForwardAttack: true,
        fastForwardDamage: true,
        autoRollDamage: 'always',
        workflowOptions: {
          fastForwardAttack: true,
          fastForwardDamage: true,
          autoRollDamage: 'always'
        }
      }
    };

    const dialogConfig = { configure: false };
    const messageConfig = { create: true };

    try {
      await MidiQOL.completeActivityUse(activity, usageConfig, dialogConfig, messageConfig);
      return true;
    } catch (error) {
      LogUtil.error("DnDBMidiIntegration._executeDamageNewWorkflow failed", [error]);
      this.clearPendingRoll();
      return false;
    }
  }

  /**
   * Execute healing through Midi-QOL workflow with DnDB dice values
   * Similar to damage workflow but for heal activities
   * @param {Actor} actor - The Foundry actor
   * @param {Activity} activity - The heal activity
   * @param {Object} rollInfo - Parsed DnDB roll info
   * @returns {Promise<boolean>} Success status
   */
  static async executeHealingWithMidi(actor, activity, rollInfo) {
    const MidiQOL = ModuleHelpers.getMidiQOL();
    if (!MidiQOL) {
      LogUtil.warn("DnDBMidiIntegration: MidiQOL not available for healing");
      return false;
    }

    this.setPendingRoll(rollInfo);

    LogUtil.log("DnDBMidiIntegration.executeHealingWithMidi", [
      "activity:", activity.name,
      "item:", activity.item?.name
    ]);

    const usageConfig = {
      consume: { resources: true, spellSlot: true },
      midiOptions: {
        fastForwardAttack: true,
        fastForwardDamage: true,
        autoRollDamage: 'always',
        workflowOptions: {
          fastForwardAttack: true,
          fastForwardDamage: true,
          autoRollDamage: 'always'
        }
      }
    };

    const dialogConfig = { configure: false };
    const messageConfig = { create: true };

    try {
      await MidiQOL.completeActivityUse(activity, usageConfig, dialogConfig, messageConfig);
      return true;
    } catch (error) {
      LogUtil.error("DnDBMidiIntegration.executeHealingWithMidi failed", [error]);
      this.clearPendingRoll();
      return false;
    }
  }
}
