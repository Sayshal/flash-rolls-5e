import { LogUtil } from "../../LogUtil.mjs";
import { MODULE_ID } from "../../../constants/General.mjs";
import { HOOKS_CORE } from "../../../constants/Hooks.mjs";
import { GeneralUtil } from "../../helpers/GeneralUtil.mjs";

// Check if required D&D5e classes exist
Hooks.once(HOOKS_CORE.READY, () => {
  if (!dnd5e.applications.dice.DamageRollConfigurationDialog) {
    LogUtil.warn("DamageRollConfigurationDialog not found in dnd5e.applications.dice");
  }
});

/**
 * Mixin that provides GM-specific functionality for roll configuration dialogs
 * @param {Class} Base - The base dialog class to extend
 * @returns {Class} The extended class with GM functionality
 */
export function GMRollConfigMixin(Base) {
  return class extends Base {
    constructor(config = {}, message = {}, options = {}) {
      super(config, message, options);
      
      this.actors = options.actors || [];
      this.sendRequest = options.sendRequest ?? options.sendRequest ?? true;
      this.showDC = options.showDC || false;
      this.dcValue = options.dcValue || null;
      
      this.rollKey = options.rollKey || config.skill || config.ability || null;
      this.rollTypeString = options.rollTypeString || null;
      
      this.windowTitle = options.window?.title || "";
      this.windowSubtitle = options.window?.subtitle || "";
    }
    
    /**
     * Build a roll configuration from form data.
     * Handles situational bonuses, ability selection, and DC values.
     * @param {BasicRollConfiguration} config - Individual roll configuration from the rolls array
     * @param {FormDataExtended} formData - Data from the dialog form
     * @param {number} index - Index of this roll in the rolls array
     * @returns {BasicRollConfiguration} The modified individual roll configuration
     * @protected
     * @override
     */
    _buildConfig(config, formData, index) {
      const abilityFromForm = formData?.get("ability");
      const dcFromForm = formData?.get("dc");
      
      const situational = formData?.get(`rolls.${index}.situational`);
      LogUtil.log('_buildConfig', [situational, formData, config]);
      if (situational) {
        if (!config.parts) config.parts = [];
        config.parts.push("@situational");
        if (!config.data) config.data = {};
        config.data.situational = situational;
      }else if (config.parts) {
        const idx = config.parts.indexOf("@situational");
        if (idx !== -1) config.parts.splice(idx, 1);
      }
      
      if (abilityFromForm) {
        config.ability = abilityFromForm;
        this.config.ability = abilityFromForm;
      }
      
      const result = super._buildConfig(config, formData, index);
      
      if (dcFromForm) {
        const dcValue = parseInt(dcFromForm);
        if (!isNaN(dcValue)) {
          result.options = result.options || {};
          result.options.target = dcValue;
        }
      } else if (this.dcValue !== undefined && this.dcValue !== null) {
        result.options = result.options || {};
        result.options.target = this.dcValue;
      }
      
      LogUtil.log(`${this.constructor.name}._buildConfig`, [this.config, formData, result]);
      return result;
    }
    
    /**
     * Handle form changes to capture GM-specific fields.
     * @param {Object} formConfig - The form configuration object
     * @param {Event} event - The change event
     * @protected
     * @override
     */
    _onChangeForm(formConfig, event) {
      LogUtil.log(`_onChangeForm`, [event.target.value]);
      super._onChangeForm(formConfig, event);

      const sendRequestCheckbox = this.element.querySelector('input[name="flash5e-send-request"]');
      if (sendRequestCheckbox) {
        this.sendRequest = sendRequestCheckbox.checked;
      }
      
      const dcInput = this.element.querySelector('input[name="dc"]');
      if (dcInput && dcInput.value) {
        this.dcValue = parseInt(dcInput.value) || null;
      }
      
    }
    
    /**
     * Finalize rolls based on the action button clicked.
     * @param {string} action - The action button that was clicked
     * @returns {D20Roll[]} Array of finalized rolls ready for execution
     * @protected
     * @override
     */
    _finalizeRolls(action) {
      const finalizedRolls = super._finalizeRolls(action);
      LogUtil.log(`_finalizeRolls #1`, [finalizedRolls, this.sendRequest]);
      
      if (this.dcValue !== undefined && this.dcValue !== null) {
        for (const roll of finalizedRolls) {
          roll.options.target = this.dcValue;
        }
      }
      
      this.config.sendRequest = this.sendRequest;
      
      return finalizedRolls;
    }
    
    /**
     * Handle macro button click to create a macro with current dialog configuration
     * @param {Event} event - The click event
     * @protected
     */
    async _onCreateMacroClick(event) {
      event.preventDefault();
      event.stopPropagation();
      
      LogUtil.log('_onCreateMacroClick', [this]);
      
      if (!this.rollTypeString) {
        ui.notifications.error("Cannot create macro: roll type not defined");
        return;
      }
      
      const formData = new FormDataExtended(this.form);
      const situational = formData.get('roll.0.situational') || formData.get('rolls.0.situational') || '';
      const dc = formData.get('dc');
      const sendRequest = formData.get('flash5e-send-request');
      const rollMode = formData.get('rollMode') || game.settings.get("core", "rollMode");
      const ability = formData.get('ability'); 
      
      const actorIds = this.actors?.map(actor => actor.id) || [];
      const macroData = {
        requestType: this.rollTypeString,
        rollKey: this.rollKey,
        actorIds: actorIds,
        config: {
          ...(situational && { situationalBonus: situational }),
          ...(dc && { dc: parseInt(dc) }),
          ...(rollMode !== game.settings.get("core", "rollMode") && { rollMode }),
          ...(ability && { ability }), // Include selected ability for skill/tool rolls
          sendAsRequest: !!sendRequest,
          skipRollDialog: true, // Always skip roll dialog for macros
          advantage: false, // added for users to edit if needed
          disadvantage: false // added for users to edit if needed
        }
      };
      
      try {
        // Import FlashRollsAPI dynamically to avoid circular imports
        const { FlashRollsAPI } = await import("../../FlashRollsAPI.mjs");
        await FlashRollsAPI.createMacro(macroData);
        
        // Close the dialog after successful macro creation
        this.close();
      } catch (error) {
        LogUtil.error('Failed to create macro:', [error]);
        ui.notifications.error(`Failed to create macro: ${error.message}`);
      }
    }
    
    /**
     * Handle post-render actions for the dialog.
     * Triggers initial formula rebuild if there's a situational bonus.
     * @param {ApplicationRenderContext} context - The render context.
     * @param {HandlebarsRenderOptions} options - Rendering options.
     * @returns {Promise<void>}
     * @protected
     * @override
     */
    async _onRender(context, options) {
      await super._onRender(context, options);
      
      if (this.config.rolls?.[0]?.data?.situational || this.config.situational) {
        LogUtil.log(`${this.constructor.name}._onRender`, ['Triggering rebuild for initial situational bonus']);
        setTimeout(() => {
          this.rebuild();
        }, 100);
      }
    }
  };
}