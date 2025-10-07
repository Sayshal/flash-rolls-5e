import { getDefaultIconLayout } from "./IconMappings.mjs";

export const SETTING_INPUT = {
  select: "select", 
  checkbox: "checkbox"
}
export const SETTING_SCOPE = {
  client: "client",
  world: "world"
}
const iconsMenuDefault = getDefaultIconLayout();

/**
 * Get all module settings
 * @returns {Object} Module settings
 */
export const getSettings = () => {
  return {
    generalSettings: {
      tag: "flash5e-general-settings", 
      label: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.label"),
      title: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.title"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.hint"),
      propType: Object,
      fields: [
        'showMenuOnLoad',
        'skipRollDialog',
        'skipRollDialogOption',
        'showOnlyPCsWithToken',
        'addMacrosToFolder',
        'templateAutoTarget',
        'removeTemplate',
        'templateRemovalTimeout',
        'tokenMovementSpeed',
        'autoBlockMovementInCombat',
        'tooltipAutoDismiss'
      ],
      default: {
        showMenuOnLoad: false,
        skipRollDialog: false,
        skipRollDialogOption: 1,
        showOnlyPCsWithToken: true,
        addMacrosToFolder: true,
        templateAutoTarget: 1,
        removeTemplate: true,
        tooltipAutoDismiss: 2,
        tokenMovementSpeed: 6,
        templateRemovalTimeout: 5,
        autoBlockMovementInCombat: false
      },
      scope: SETTING_SCOPE.world,
      config: false, 
      requiresReload: false 
    },

    interfaceSettings: {
      tag: "flash5e-interface-settings",
      label: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.label"),
      title: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.title"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.hint"),
      propType: Object,
      fields: [
        'showMenuOnLoad',
        'compactMode',
        'menuLayout',
        'menuIconsLayout',
        'maxIconsPerRow'
      ],
      default: {
        showMenuOnLoad: false,
        compactMode: true,
        menuLayout: "vertical",
        menuIconsLayout: iconsMenuDefault,
        maxIconsPerRow: 5
      },
      scope: SETTING_SCOPE.world,
      config: false,
      requiresReload: false
    },

    groupRollsSettings: {
      tag: "flash5e-group-rolls-settings", 
      label: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.label"),
      title: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.title"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.hint"),
      propType: Object,
      fields: [
        'groupRollsMsgEnabled',
        'groupRollResultMode',
        'showGroupDCToPlayers',
        'groupRollNPCHidden'
      ],
      default: {
        groupRollsMsgEnabled: true,
        groupRollResultMode: 1,
        showGroupDCToPlayers: false,
        groupRollNPCHidden: true
      },
      scope: SETTING_SCOPE.world,
      config: false, 
      requiresReload: false 
    },

    rollRequestsSettings: {
      tag: "flash5e-roll-request-settings", 
      label: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.label"),
      title: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.title"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.moduleSettingsMenu.hint"),
      propType: Object,
      fields: [
        'rollInterceptionEnabled',
        'useGMTargetTokens',
        'consumptionConfigMode',
        'placeTemplateForPlayer',
        'showOfflineNotifications',
        'initiateCombatOnRequest',
        'publicPlayerRolls'
      ],
      default: {
        rollInterceptionEnabled: true,
        useGMTargetTokens: true,
        consumptionConfigMode: 2,
        placeTemplateForPlayer: false,
        showOfflineNotifications: true,
        initiateCombatOnRequest: true,
        publicPlayerRolls: true
      },
      scope: SETTING_SCOPE.world,
      config: false, 
      requiresReload: false 
    },

    showGroupDCToPlayers: {
      tag: "show-group-dc-to-players",
      label: game.i18n.localize("FLASH_ROLLS.settings.showGroupDCToPlayers.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.showGroupDCToPlayers.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    groupRollNPCHidden: {
      tag: "group-roll-npc-hidden",
      label: game.i18n.localize("FLASH_ROLLS.settings.groupRollNPCHidden.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.groupRollNPCHidden.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },
    
    rollRequestsEnabled: {
      tag: "roll-requests-enabled",
      label: game.i18n.localize("FLASH_ROLLS.settings.rollRequestsEnabled.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.rollRequestsEnabled.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: true
    },
    
    groupRollsMsgEnabled: {
      tag: "group-roll-enabled",
      label: game.i18n.localize("FLASH_ROLLS.settings.groupRollsMsgEnabled.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.groupRollsMsgEnabled.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    groupRollResultMode: {
      tag: "group-roll-result-mode",
      label: game.i18n.localize("FLASH_ROLLS.settings.groupRollResultMode.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.groupRollResultMode.hint"),
      propType: Number, 
      inputType: SETTING_INPUT.select,
      choices: {
        1: game.i18n.localize("FLASH_ROLLS.settings.groupRollResultMode.choices.1"),
        2: game.i18n.localize("FLASH_ROLLS.settings.groupRollResultMode.choices.2"),
        3: game.i18n.localize("FLASH_ROLLS.settings.groupRollResultMode.choices.3"),
        4: game.i18n.localize("FLASH_ROLLS.settings.groupRollResultMode.choices.4")
      },
      default: 1,
      scope: SETTING_SCOPE.world,
      config: false
    },

    consumptionConfigMode: {
      tag: "consumption-config",
      label: game.i18n.localize("FLASH_ROLLS.settings.consumptionConfigMode.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.consumptionConfigMode.hint"),
      propType: Number, 
      inputType: SETTING_INPUT.select,
      choices: {
        1: game.i18n.localize("FLASH_ROLLS.settings.consumptionConfigMode.choices.1"),
        2: game.i18n.localize("FLASH_ROLLS.settings.consumptionConfigMode.choices.2"),
        3: game.i18n.localize("FLASH_ROLLS.settings.consumptionConfigMode.choices.3"),
        4: game.i18n.localize("FLASH_ROLLS.settings.consumptionConfigMode.choices.4")
      },
      default: 2,
      scope: SETTING_SCOPE.world,
      config: false
    },
    
    placeTemplateForPlayer: {
      tag: "place-template-for-player",
      label: game.i18n.localize("FLASH_ROLLS.settings.placeTemplateForPlayer.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.placeTemplateForPlayer.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    skipRollDialog: {
      tag: "skip-roll-dialog",
      label: game.i18n.localize("FLASH_ROLLS.settings.skipRollDialog.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.skipRollDialog.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    skipRollDialogOption: {
      tag: "skip-roll-dialog-options",
      label: game.i18n.localize("FLASH_ROLLS.settings.skipRollDialogOption.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.skipRollDialogOption.hint"),
      propType: Number, 
      inputType: SETTING_INPUT.select,
      choices: {
        1: game.i18n.localize("FLASH_ROLLS.settings.skipRollDialogOption.choices.1"),
        2: game.i18n.localize("FLASH_ROLLS.settings.skipRollDialogOption.choices.2"),
        3: game.i18n.localize("FLASH_ROLLS.settings.skipRollDialogOption.choices.3")
      },
      default: 1,
      scope: SETTING_SCOPE.world,
      config: false
    },
    useGMTargetTokens: {
      tag: "use-gm-target-tokens",
      label: game.i18n.localize("FLASH_ROLLS.settings.useGMTargetTokens.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.useGMTargetTokens.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },
    rollInterceptionEnabled: {
      tag: "roll-interception-on",
      label: game.i18n.localize("FLASH_ROLLS.settings.rollInterceptionEnabled.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.rollInterceptionEnabled.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },
    publicPlayerRolls: {
      tag: "public-player-rolls",
      label: game.i18n.localize("FLASH_ROLLS.settings.publicPlayerRolls.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.publicPlayerRolls.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    showOfflineNotifications: {
      tag: "show-offline-notifications",
      label: game.i18n.localize("FLASH_ROLLS.settings.showOfflineNotifications.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.showOfflineNotifications.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    showRequestNotifications: {
      tag: "show-request-notifications",
      label: game.i18n.localize("FLASH_ROLLS.settings.showRequestNotifications.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.showRequestNotifications.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    initiateCombatOnRequest: {
      tag: "initiate-combat-on-request",
      label: game.i18n.localize("FLASH_ROLLS.settings.initiateCombatOnRequest.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.initiateCombatOnRequest.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    showOnlyPCsWithToken: {
      tag: "show-only-pcs-with-token",
      label: game.i18n.localize("FLASH_ROLLS.settings.showOnlyPCsWithToken.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.showOnlyPCsWithToken.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    compactMode: {
      tag: "compact-mode",
      label: game.i18n.localize("FLASH_ROLLS.settings.compactMode.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.compactMode.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    menuLayout: {
      tag: "menu-layout",
      label: game.i18n.localize("FLASH_ROLLS.settings.menuLayout.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.menuLayout.hint"),
      propType: String, 
      inputType: SETTING_INPUT.select,
      choices: {
        "vertical": game.i18n.localize("FLASH_ROLLS.settings.menuLayout.choices.vertical"),
        "horizontal": game.i18n.localize("FLASH_ROLLS.settings.menuLayout.choices.horizontal")
      },
      default: "vertical",
      scope: SETTING_SCOPE.world,
      config: false
    },

    maxIconsPerRow: {
      tag: "max-icons-per-row",
      label: game.i18n.localize("FLASH_ROLLS.settings.maxIconsPerRow.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.maxIconsPerRow.hint"),
      propType: Number,
      default: 5,
      scope: SETTING_SCOPE.world,
      config: false
    },

    showOptionsListOnHover: {
      tag: "show-list-on-hover",
      label: game.i18n.localize("FLASH_ROLLS.settings.showOptionsListOnHover.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.showOptionsListOnHover.hint"),
      propType: Boolean,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    templateAutoTarget: { 
      tag: "template-auto-target", 
      label: game.i18n.localize("FLASH_ROLLS.settings.templateAutoTarget.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.templateAutoTarget.hint"),
      propType: Number,
      choices: {
        1: game.i18n.localize("FLASH_ROLLS.settings.templateAutoTarget.choices.all.label"),
        2: game.i18n.localize("FLASH_ROLLS.settings.templateAutoTarget.choices.notFriendly.label"),
        3: game.i18n.localize("FLASH_ROLLS.settings.templateAutoTarget.choices.none.label"),
      },
      inputType: SETTING_INPUT.select,
      default: 1,
      scope: SETTING_SCOPE.world,
      config: false
    },

    removeTemplate: {
      tag: "remove-template",
      label: game.i18n.localize("FLASH_ROLLS.settings.removeTemplate.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.removeTemplate.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    templateRemovalTimeout: {
      tag: "template-removal-timeout",
      label: game.i18n.localize("FLASH_ROLLS.settings.templateRemovalTimeout.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.templateRemovalTimeout.hint"),
      propType: Number,
      default: 5,
      scope: SETTING_SCOPE.world,
      config: false,
      range: {
        min: 0,
        max: 30,
        step: 1
      }
    },

    debugMode: {
      tag: "debug-mode-on", 
      label: game.i18n.localize("FLASH_ROLLS.settings.debugMode.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.debugMode.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.client,
      config: true
    },

    showMenuOnLoad: {
      tag: "show-menu-on-world-load",
      label: game.i18n.localize("FLASH_ROLLS.settings.showMenuOnLoad.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.showMenuOnLoad.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    addMacrosToFolder: {
      tag: "add-macros-to-folder",
      label: game.i18n.localize("FLASH_ROLLS.settings.addMacrosToFolder.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.addMacrosToFolder.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: true,
      scope: SETTING_SCOPE.world,
      config: false
    },

    menuIconsLayout: {
      tag: "menu-icons-layout",
      label: game.i18n.localize("FLASH_ROLLS.settings.menuIconsLayout.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.menuIconsLayout.hint"),
      propType: Object,
      default: iconsMenuDefault,
      scope: SETTING_SCOPE.world,
      config: false
    },

    autoBlockMovementInCombat: {
      tag: "auto-block-movement-in-combat",
      label: game.i18n.localize("FLASH_ROLLS.settings.autoBlockMovementInCombat.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.autoBlockMovementInCombat.hint"),
      propType: Boolean,
      inputType: SETTING_INPUT.checkbox,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    },

    tokenMovementSpeed: {
      tag: "token-movement-speed",
      label: game.i18n.localize("FLASH_ROLLS.settings.tokenMovementSpeed.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.tokenMovementSpeed.hint"),
      propType: Number,
      default: 6,
      scope: SETTING_SCOPE.world,
      config: false,
      range: {
        min: 1,
        max: 20,
        step: 1
      }
    },

    tooltipAutoDismiss: {
      tag: "tooltip-auto-dismiss",
      label: game.i18n.localize("FLASH_ROLLS.settings.tooltipAutoDismiss.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.tooltipAutoDismiss.hint"),
      propType: Number,
      default: 2,
      scope: SETTING_SCOPE.world,
      config: false,
      range: {
        min: 0,
        max: 10,
        step: 1
      }
    },

    legacyTokenAssociationsMigrated: {
      tag: "legacy-token-associations-migrated",
      label: game.i18n.localize("FLASH_ROLLS.settings.legacyTokenAssociationsMigrated.label"),
      hint: game.i18n.localize("FLASH_ROLLS.settings.legacyTokenAssociationsMigrated.hint"),
      propType: Boolean,
      default: false,
      scope: SETTING_SCOPE.world,
      config: false
    }
  };
};
