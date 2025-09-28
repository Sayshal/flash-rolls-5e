import { MODULE_ACTION_ICONS, ACTOR_ACTION_ICONS, ICON_TYPES, getIconConfiguration, getDefaultIconLayout } from '../../constants/IconMappings.mjs';
import { SettingsUtil } from './SettingsUtil.mjs';
import { getSettings } from '../../constants/Settings.mjs';

/**
 * Utility class for managing icon layout and drag-and-drop functionality
 */
export class IconLayoutUtil {

  /**
   * Initialize drag and drop functionality for icon lists
   * @param {HTMLElement} container - The settings container element
   */
  static initializeDragAndDrop(container) {
    const iconLists = container.querySelectorAll('.sortable-icon-list');

    iconLists.forEach(list => {
      this.setupListEventListeners(list);
    });

    // Setup toggle functionality
    const toggles = container.querySelectorAll('.icon-toggle');
    toggles.forEach(toggle => {
      toggle.addEventListener('change', this.handleIconToggle.bind(this));
    });
  }

  /**
   * Setup event listeners for a sortable list
   * @param {HTMLElement} list - The list element
   */
  static setupListEventListeners(list) {
    list.addEventListener('dragover', this.handleDragOver.bind(this));
    list.addEventListener('drop', this.handleDrop.bind(this));
    list.addEventListener('dragenter', this.handleDragEnter.bind(this));
    list.addEventListener('dragleave', this.handleDragLeave.bind(this));

    // Setup draggable items
    const items = list.querySelectorAll('.icon-item');
    items.forEach(item => {
      item.addEventListener('dragstart', this.handleDragStart.bind(this));
      item.addEventListener('dragend', this.handleDragEnd.bind(this));
    });
  }

  /**
   * Handle drag start event
   * @param {DragEvent} event - The drag event
   */
  static handleDragStart(event) {
    const item = event.target.closest('.icon-item');
    if (!item) return;

    item.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/html', item.outerHTML);
    event.dataTransfer.setData('text/plain', JSON.stringify({
      iconId: item.dataset.iconId,
      iconType: item.closest('.sortable-icon-list').dataset.iconType,
      order: parseInt(item.dataset.order)
    }));
  }

  /**
   * Handle drag end event
   * @param {DragEvent} event - The drag event
   */
  static handleDragEnd(event) {
    const item = event.target.closest('.icon-item');
    if (!item) return;

    item.classList.remove('dragging');

    // Clean up any drag state
    document.querySelectorAll('.sortable-icon-list').forEach(list => {
      list.classList.remove('drag-over');
    });

    // Remove any placeholders
    document.querySelectorAll('.drag-placeholder').forEach(placeholder => {
      placeholder.remove();
    });
  }

  /**
   * Handle drag over event
   * @param {DragEvent} event - The drag event
   */
  static handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    const list = event.currentTarget;
    const draggingItem = document.querySelector('.icon-item.dragging');
    if (!draggingItem) return;

    // Only allow dropping within the same icon type
    const draggedIconType = draggingItem.closest('.sortable-icon-list').dataset.iconType;
    const targetIconType = list.dataset.iconType;

    if (draggedIconType !== targetIconType) {
      event.dataTransfer.dropEffect = 'none';
      return;
    }

    const afterElement = this.getDragAfterElement(list, event.clientY);
    if (afterElement == null) {
      list.appendChild(draggingItem);
    } else {
      list.insertBefore(draggingItem, afterElement);
    }
  }

  /**
   * Handle drag enter event
   * @param {DragEvent} event - The drag event
   */
  static handleDragEnter(event) {
    event.preventDefault();
    const list = event.currentTarget;
    list.classList.add('drag-over');
  }

  /**
   * Handle drag leave event
   * @param {DragEvent} event - The drag event
   */
  static handleDragLeave(event) {
    const list = event.currentTarget;
    const rect = list.getBoundingClientRect();

    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) {
      list.classList.remove('drag-over');
    }
  }

  /**
   * Handle drop event
   * @param {DragEvent} event - The drag event
   */
  static handleDrop(event) {
    event.preventDefault();
    const list = event.currentTarget;
    list.classList.remove('drag-over');

    // Update the order and save settings
    this.updateIconOrder(list);
  }

  /**
   * Get the element that the dragged item should be inserted before
   * @param {HTMLElement} container - The container element
   * @param {number} y - The y coordinate
   * @returns {HTMLElement|null} The element to insert before
   */
  static getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.icon-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;

      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  /**
   * Handle icon toggle event
   * @param {Event} event - The change event
   */
  static handleIconToggle(event) {
    const toggle = event.target;
    const iconItem = toggle.closest('.icon-item');
    const isEnabled = toggle.checked;

    // Update visual state
    iconItem.dataset.enabled = isEnabled;
    if (isEnabled) {
      iconItem.classList.remove('disabled');
    } else {
      iconItem.classList.add('disabled');
    }

    // Update settings
    const list = iconItem.closest('.sortable-icon-list');
    this.updateIconOrder(list);
  }

  /**
   * Update icon order in the list and save to settings
   * @param {HTMLElement} list - The sortable list
   */
  static updateIconOrder(list) {
    const iconType = list.dataset.iconType;
    const items = [...list.querySelectorAll('.icon-item')];

    const updatedIcons = items.map((item, index) => ({
      id: item.dataset.iconId,
      icon: this.getIconClass(item.dataset.iconId, iconType),
      enabled: item.dataset.enabled === 'true',
      order: index
    }));

    // Get current settings
    const SETTINGS = getSettings();
    const currentLayout = SettingsUtil.get(SETTINGS.menuIconsLayout.tag) || getDefaultIconLayout();

    // Update the specific icon type
    const updatedLayout = {
      ...currentLayout,
      [iconType]: updatedIcons
    };

    // Save to settings
    SettingsUtil.set(SETTINGS.menuIconsLayout.tag, updatedLayout);

    // Trigger menu refresh if needed
    if (game.flashRolls?.menu) {
      game.flashRolls.menu.render(false);
    }
  }

  /**
   * Get icon class for a given icon ID and type
   * @param {string} iconId - The icon ID
   * @param {string} iconType - The icon type
   * @returns {string} The icon class
   */
  static getIconClass(iconId, iconType) {
    const config = getIconConfiguration(iconId, iconType);
    return config ? config.icon : '';
  }

  /**
   * Get enabled icons in order for rendering
   * @param {string} iconType - The icon type (moduleActions or actorActions)
   * @returns {Array} Array of enabled icons in order
   */
  static getEnabledIcons(iconType) {
    const SETTINGS = getSettings();
    const layout = SettingsUtil.get(SETTINGS.menuIconsLayout.tag) || getDefaultIconLayout();
    const icons = layout[iconType] || [];

    return icons
      .filter(icon => icon.enabled)
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Get all icons (enabled and disabled) in order for settings display
   * @param {string} iconType - The icon type
   * @returns {Array} Array of all icons in order
   */
  static getAllIcons(iconType) {
    const SETTINGS = getSettings();
    const layout = SettingsUtil.get(SETTINGS.menuIconsLayout.tag) || getDefaultIconLayout();
    const icons = layout[iconType] || [];

    return icons.sort((a, b) => a.order - b.order);
  }

  /**
   * Get icon configurations for template rendering
   * @returns {Object} Icon configurations object
   */
  static getIconConfigurations() {
    return {
      moduleActions: MODULE_ACTION_ICONS,
      actorActions: ACTOR_ACTION_ICONS
    };
  }

  /**
   * Reset icons to default layout
   * @param {string} iconType - Optional icon type to reset, or all if not specified
   */
  static resetToDefault(iconType = null) {
    const SETTINGS = getSettings();
    const defaultLayout = getDefaultIconLayout();

    if (iconType) {
      const currentLayout = SettingsUtil.get(SETTINGS.menuIconsLayout.tag) || {};
      const updatedLayout = {
        ...currentLayout,
        [iconType]: defaultLayout[iconType]
      };
      SettingsUtil.set(SETTINGS.menuIconsLayout.tag, updatedLayout);
    } else {
      SettingsUtil.set(SETTINGS.menuIconsLayout.tag, defaultLayout);
    }
  }
}