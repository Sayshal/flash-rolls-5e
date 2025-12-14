import { MODULE_ID } from '../../constants/General.mjs';
import { LogUtil } from './LogUtil.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import { SettingsUtil } from './SettingsUtil.mjs';
import { GeneralUtil } from './GeneralUtil.mjs';
import { FlashAPI } from '../core/FlashAPI.mjs';

/**
 * Utility for managing libWrapper integrations
 * Provides centralized control for prototype overrides with graceful degradation
 */
export class LibWrapperUtil {
  static #registeredWrappers = new Set();
  static #libWrapperChecked = false;
  static #libWrapperAvailable = false;

  /**
   * Check if libWrapper module is available
   * @returns {boolean} True if libWrapper is active and available
   */
  static isAvailable() {
    if (!this.#libWrapperChecked) {
      this.#libWrapperAvailable = game.modules.get('lib-wrapper')?.active ?? false;
      this.#libWrapperChecked = true;
    }
    return this.#libWrapperAvailable;
  }

  /**
   * Register a wrapper using libWrapper if available
   * @param {string} target - The target to wrap (e.g., 'Token.prototype.animate')
   * @param {Function} fn - The wrapper function
   * @param {string} type - The wrapper type ('WRAPPER', 'MIXED', 'OVERRIDE')
   * @param {Object} options - Additional options
   * @param {boolean} options.required - If false, silently fail when libWrapper unavailable
   * @returns {boolean} True if registration succeeded
   */
  static register(target, fn, type = 'WRAPPER', options = {}) {
    if (!this.isAvailable()) {
      if (options.required) {
        LogUtil.warn(`LibWrapperUtil.register - libWrapper required but not available for: ${target}`);
      }
      return false;
    }

    try {
      libWrapper.register(MODULE_ID, target, fn, type);
      this.#registeredWrappers.add(target);
      LogUtil.log(`LibWrapperUtil.register - Successfully registered: ${target}`);
      return true;
    } catch (error) {
      LogUtil.error(`LibWrapperUtil.register - Failed to register ${target}:`, error);
      return false;
    }
  }

  /**
   * Unregister a specific wrapper
   * @param {string} target - The target to unregister
   */
  static unregister(target) {
    if (!this.isAvailable()) return;

    try {
      libWrapper.unregister(MODULE_ID, target);
      this.#registeredWrappers.delete(target);
      LogUtil.log(`LibWrapperUtil.unregister - Successfully unregistered: ${target}`);
    } catch (error) {
      LogUtil.error(`LibWrapperUtil.unregister - Failed to unregister ${target}:`, error);
    }
  }

  /**
   * Unregister all wrappers registered by this module
   */
  static unregisterAll() {
    if (!this.isAvailable()) return;

    for (const target of this.#registeredWrappers) {
      this.unregister(target);
    }
    this.#registeredWrappers.clear();
    LogUtil.log('LibWrapperUtil.unregisterAll - All wrappers unregistered');
  }

  /**
   * Get all registered wrapper targets
   * @returns {string[]} Array of registered targets
   */
  static getRegisteredWrappers() {
    return Array.from(this.#registeredWrappers);
  }

  /**
   * Show a one-time notification about missing libWrapper
   * Only shows if libWrapper is not available and user hasn't seen the notification
   * If libWrapper IS available, resets the notification flag so it can show again if libWrapper is later removed
   */
  static showMissingLibWrapperNotification() {
    if (!game.user.isGM) return;

    const SETTINGS = getSettings();

    if (this.isAvailable()) {
      const alreadyShown = SettingsUtil.get(SETTINGS.libWrapperNotificationShown.tag);
      if (alreadyShown) {
        SettingsUtil.set(SETTINGS.libWrapperNotificationShown.tag, false);
      }
      return;
    }

    const alreadyShown = SettingsUtil.get(SETTINGS.libWrapperNotificationShown.tag);

    if (!alreadyShown) {
      FlashAPI.notify('info',
        game.i18n.localize('FLASH_ROLLS.notifications.libWrapperRecommended'),
        { permanent: true, console: false }
      );
      SettingsUtil.set(SETTINGS.libWrapperNotificationShown.tag, true);
    }
  }
}
