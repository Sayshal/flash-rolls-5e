import { ROLL_TYPES } from '../../../constants/General.mjs';
import { getSettings } from '../../../constants/Settings.mjs';
import { SettingsUtil } from '../../utils/SettingsUtil.mjs';
import { LogUtil } from '../../utils/LogUtil.mjs';
import { GMRollConfigDialog, GMSkillToolConfigDialog, GMHitDieConfigDialog } from '../../ui/dialogs/gm-dialogs/index.mjs';
import { CustomRollDialog } from '../../ui/dialogs/CustomRollDialog.mjs';
import { RollHelpers } from '../../helpers/RollHelpers.mjs';

/**
 * Utility class for roll configuration operations in the Roll Requests Menu
 */
export class RollMenuConfig {
  /**
   * Get roll configuration from dialog or create default
   * @param {Actor[]} actors - Actors being rolled for
   * @param {string} rollMethodName - The roll method name
   * @param {string} rollKey - The roll key
   * @param {boolean} skipRollDialog - Whether to skip dialogs
   * @param {Array} pcActors - PC actors with owners
   * @returns {Promise<BasicRollProcessConfiguration|null>} Process configuration or null if cancelled
   */
  static async getRollConfiguration(actors, rollMethodName, rollKey, skipRollDialog, pcActors, configOverrides = {}) {
    const SETTINGS = getSettings();
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    const sendAsRequest = configOverrides.hasOwnProperty('sendAsRequest') ? configOverrides.sendAsRequest : undefined;
    const npcActors = actors.filter(actor => pcActors.includes(actor.id));
    const confirmedSkipDialog = RollHelpers.shouldSkipRollDialog(skipRollDialog, {isPC: pcActors.length > 0, isNPC: npcActors.length > 0});

    LogUtil.log('RollMenuConfig.getRollConfiguration', [
      'sendAsRequest:', sendAsRequest,
      'rollRequestsEnabled:', rollRequestsEnabled,
      'skipRollDialog:', skipRollDialog,
      'confirmedSkipDialog:', confirmedSkipDialog,
      'pcActors.length:', pcActors,
      'npcActors.length:', npcActors,
      'actors:', actors
    ]);
    
    // Show GM configuration dialog (unless skip dialogs is enabled or it's a custom roll)
    if (!confirmedSkipDialog && rollMethodName !== ROLL_TYPES.CUSTOM) {
      // Use appropriate dialog based on roll type
      let DialogClass;
      if ([ROLL_TYPES.SKILL, ROLL_TYPES.TOOL].includes(rollMethodName)) {
        DialogClass = GMSkillToolConfigDialog;
      } else if (rollMethodName === ROLL_TYPES.HIT_DIE) {
        DialogClass = GMHitDieConfigDialog;
      } else {
        DialogClass = GMRollConfigDialog;
      }
      const config = await DialogClass.initConfiguration(actors, rollMethodName, rollKey, { 
        confirmedSkipDialog,
        sendRequest: sendAsRequest===true || (sendAsRequest===undefined && rollRequestsEnabled) || false 
      });
      LogUtil.log('getRollConfiguration', [config]);
      
      return config; // Will be null if cancelled
    } else {
      // Use default BasicRollProcessConfiguration when skipping dialogs
      const config = {
        rolls: [{
          parts: [],
          // parts: configOverrides.situationalBonus ? ["@situational"] : [],
          data: configOverrides.situationalBonus ? { situational: configOverrides.situationalBonus } : {},
          options: configOverrides.dc ? { target: configOverrides.dc } : {}
        }],
        advantage: configOverrides.advantage || false,
        disadvantage: configOverrides.disadvantage || false,
        rollMode: configOverrides.rollMode || game.settings.get("core", "rollMode"),
        chatMessage: true,
        isRollRequest: false,
        skipRollDialog: true,
        sendRequest: configOverrides.hasOwnProperty('sendAsRequest') ? configOverrides.sendAsRequest : (rollRequestsEnabled && pcActors.length > 0)
      };
      
      // Death saves always have DC 10
      if (rollMethodName === ROLL_TYPES.DEATH_SAVE) {
        config.target = 10;
      }
      
      return config;
    }
  }

  /**
   * Handle custom roll dialog
   * @returns {Promise<string|null>} The roll formula or null if cancelled
   */
  static async handleCustomRoll() {
    const formula = await this.showCustomRollDialog();
    return formula; // Will be null if cancelled
  }

  /**
   * Show custom roll dialog
   * @returns {Promise<string|null>} The roll formula or null if cancelled
   */
  static async showCustomRollDialog() {
    LogUtil.log('showCustomRollDialog');
    return CustomRollDialog.prompt({
      formula: "",
      readonly: false
    });
  }
}