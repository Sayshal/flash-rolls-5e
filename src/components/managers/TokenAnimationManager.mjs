import { MODULE_ID } from '../../constants/General.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import { SettingsUtil } from '../utils/SettingsUtil.mjs';

/**
 * Manager for customizing token animation behavior
 */
export class TokenAnimationManager {
  /**
   * Initialize token animation customization by wrapping the Token.prototype.animate method
   */
  static initialize() {
    const TokenClass = foundry.canvas.placeables.Token;
    const originalAnimate = TokenClass.prototype.animate;

    TokenClass.prototype.animate = async function(to, options = {}) {
      const SETTINGS = getSettings();
      const customMovementSpeed = SettingsUtil.get(SETTINGS.tokenMovementSpeed.tag);

      if (customMovementSpeed && !options.movementSpeed) {
        options.movementSpeed = customMovementSpeed;
      }

      return originalAnimate.call(this, to, options);
    };
  }
}
