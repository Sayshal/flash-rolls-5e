import { ModuleSettingsMenu } from '../components/ui/dialogs/ModuleSettingsMenu.mjs';
import { PremiumFeaturesDialog } from '../components/ui/dialogs/PremiumFeaturesDialog.mjs';

export function getSettingMenus() {
  return {
    moduleSettingsMenu: {
      tab: '',
      tag: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.title"),
      name: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.title"),
      label: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.hint"),
      icon: "fas fa-cog",
      propType: ModuleSettingsMenu,
      restricted: true
    },
    premiumFeatures: {
      tab: '',
      tag: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.label"),
      name: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.label"),
      label: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.buttonLabel"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.premiumFeatures.hint"),
      icon: "fas fa-gem",
      propType: PremiumFeaturesDialog,
      restricted: true
    }
  };
}