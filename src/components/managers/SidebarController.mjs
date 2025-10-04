import { getSettings } from "../../constants/Settings.mjs";
import { SettingsUtil } from "../utils/SettingsUtil.mjs";
import RollRequestsMenu from "../ui/RollRequestsMenu.mjs";
import { LogUtil } from "../utils/LogUtil.mjs";

/**
 * Utility class for managing sidebar controls
 */
export class SidebarController {
  /**
   * Add the roll request bolt icon to sidebar
   * @param {SidebarTab} app - The sidebar tab application
   * @param {jQuery} html - The rendered HTML
   */
  static addSidebarControls(app, html) {
    LogUtil.log("addSidebarControls",[app, html]);
    if (!game.user.isGM || !app || app.id !== "sidebar") return;
    
    const chatControls = document.querySelector("#roll-privacy");

    if (!chatControls || chatControls.querySelector('.flash-rolls-icon')) {
      return;
    }
    
    const SETTINGS = getSettings();
    const rollRequestsEnabled = SettingsUtil.get(SETTINGS.rollRequestsEnabled.tag);
    
    const rollRequestIcon = document.createElement('button');
    rollRequestIcon.id = "flash-rolls-icon"; 
    rollRequestIcon.setAttribute("data-tooltip-direction", "RIGHT");
    rollRequestIcon.className = `ui-control icon chat-control-icon flash-rolls-icon${rollRequestsEnabled ? ' active' : ''}`;
    rollRequestIcon.title = game.i18n.localize('FLASH_ROLLS.ui.menus.rollRequestsTitle');
    rollRequestIcon.innerHTML = `<i class="fas fa-bolt${rollRequestsEnabled ? '' : '-slash'}"></i>`;
    
    const firstChatControlIcon = chatControls.firstChild;
    if (firstChatControlIcon) {
      firstChatControlIcon.parentNode.insertBefore(rollRequestIcon, firstChatControlIcon);
    } else {
      chatControls.insertBefore(rollRequestIcon, chatControls.firstChild);
    }

    LogUtil.log("addSidebarControls",[firstChatControlIcon, rollRequestIcon]);
    
    rollRequestIcon.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      RollRequestsMenu.toggle();
    });
  }
  
  /**
   * Update the roll requests icon based on enabled state
   * @param {boolean} enabled - Whether roll requests are enabled
   */
  static updateRollRequestsIcon(enabled) {
    const icon = document.querySelector('#flash-rolls-icon i');
    if (icon) {
      icon.className = `fas fa-bolt${enabled ? '' : '-slash'}`;
    }
  }
}