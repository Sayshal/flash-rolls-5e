import { getSettings } from '../../constants/Settings.mjs';
import { SettingsUtil } from './SettingsUtil.mjs';
import { LogUtil } from './LogUtil.mjs';

/**
 * Utility for managing tooltip auto-dismiss behavior and custom delays
 */
export class TooltipUtil {
  static dismissTimers = new Map();
  static originalActivationMS = null;

  /**
   * Initialize tooltip customizations (auto-dismiss and custom delays)
   */
  static initialize() {
    this.originalActivationMS = game.tooltip.constructor.TOOLTIP_ACTIVATION_MS;
    this.#interceptTooltipEvents();
    this.#wrapTooltipActivation();
    this.#wrapTooltipDeactivation();
  }

  /**
   * Intercept tooltip activation to handle custom delays
   */
  static #interceptTooltipEvents() {
    const tooltip = game.tooltip;
    const TooltipClass = tooltip.constructor;
    const storedValue = TooltipClass.TOOLTIP_ACTIVATION_MS;

    tooltip._frCustomDelayElement = null;

    window.addEventListener("pointerenter", (event) => {
      if (event.target.dataset?.tooltip) {
        tooltip._frCustomDelayElement = event.target;
      }
    }, { capture: true });

    Object.defineProperty(TooltipClass, 'TOOLTIP_ACTIVATION_MS', {
      get() {
        const element = tooltip._frCustomDelayElement;
        if (element?.closest?.('#flash-rolls-menu') && element.dataset.tooltipDelay) {
          const customDelay = parseInt(element.dataset.tooltipDelay);
          if (!isNaN(customDelay) && customDelay > 0) {
            return customDelay;
          }
        }
        return storedValue;
      },
      configurable: true
    });
  }

  /**
   * Wrap tooltip activation to add auto-dismiss or disable tooltips
   */
  static #wrapTooltipActivation() {
    const originalActivate = game.tooltip.activate.bind(game.tooltip);

    game.tooltip.activate = function(element, options = {}) {
      const isFlashRollsMenu = element?.closest('#flash-rolls-menu');

      if (isFlashRollsMenu) {
        const SETTINGS = getSettings();
        const autoDismissSeconds = SettingsUtil.get(SETTINGS.tooltipAutoDismiss.tag);

        if (autoDismissSeconds === 0) {
          return;
        }

        const result = originalActivate(element, options);
        TooltipUtil.setupAutoDismiss(element, autoDismissSeconds);

        return result;
      }

      return originalActivate(element, options);
    };
  }

  /**
   * Setup auto-dismiss for Flash Rolls menu tooltips
   * @param {HTMLElement} element - The element with the tooltip
   * @param {number} autoDismissSeconds - Seconds before dismissing
   */
  static setupAutoDismiss(element, autoDismissSeconds) {
    if (autoDismissSeconds > 0) {
      TooltipUtil.scheduleAutoDismiss(element, autoDismissSeconds * 1000);
    }
  }

  /**
   * Wrap tooltip deactivation to clear timers
   */
  static #wrapTooltipDeactivation() {
    const originalDeactivate = game.tooltip.deactivate.bind(game.tooltip);

    game.tooltip.deactivate = function() {
      const result = originalDeactivate();
      TooltipUtil.clearAutoDismiss(game.tooltip.element);
      TooltipUtil.lastHoveredElement = null;
      return result;
    };
  }

  /**
   * Schedule auto-dismiss for a tooltip
   * @param {HTMLElement} element - The element with the tooltip
   * @param {number} delay - Delay in milliseconds before dismissing
   */
  static scheduleAutoDismiss(element, delay) {
    this.clearAutoDismiss(element);

    const timer = setTimeout(() => {
      if (game.tooltip.element === element) {
        game.tooltip.deactivate();
      }
      this.dismissTimers.delete(element);
    }, delay);

    this.dismissTimers.set(element, timer);
  }

  /**
   * Clear auto-dismiss timer for an element
   * @param {HTMLElement} element - The element to clear timer for
   */
  static clearAutoDismiss(element) {
    const timer = this.dismissTimers.get(element);
    if (timer) {
      clearTimeout(timer);
      this.dismissTimers.delete(element);
    }
  }
}
