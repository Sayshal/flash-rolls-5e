import { LogUtil } from '../utils/LogUtil.mjs';
import { isPlayerOwned } from '../helpers/Helpers.mjs';
import { ActorStatusManager } from '../managers/ActorStatusManager.mjs';

/**
 * Handles drag and drop of actors from the directory into the Flash Token Actions menu
 */
export class ActorDropUtil {
  /**
   * Check if the current user can drop actors into the menu
   * @param {string} selector - The drop target selector
   * @returns {boolean} Whether the drop is allowed
   */
  static canDrop(selector) {
    LogUtil.log('ActorDropUtil.canDrop', [selector]);
    return game.user.isGM;
  }

  /**
   * Handle the drag over event for visual feedback
   * @param {DragEvent} event - The drag over event
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static handleDragOver(event, menu) {
    LogUtil.log('ActorDropUtil.handleDragOver', [event, event.currentTarget, event.target]);
    
    event.preventDefault();
    event.stopPropagation();
    
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
      LogUtil.log('ActorDropUtil.handleDragOver - dataTransfer types:', [event.dataTransfer.types]);
    }
    
    const dropZone = event.currentTarget.closest('.actor-list, .actors');
    if (dropZone) {
      dropZone.classList.add('drag-over');
      LogUtil.log('ActorDropUtil.handleDragOver - added drag-over class');
    }
    
    return false;
  }

  /**
   * Handle the drag leave event to remove visual feedback
   * @param {DragEvent} event - The drag leave event
   */
  static handleDragLeave(event) {
    LogUtil.log('ActorDropUtil.handleDragLeave', [event, event.currentTarget, event.target]);

    // If called from global dragend, just remove all drag-over classes
    if (!event.currentTarget || typeof event.currentTarget.getBoundingClientRect !== 'function') {
      const allDragOverElements = document.querySelectorAll('.drag-over');
      allDragOverElements.forEach(element => {
        element.classList.remove('drag-over');
      });
      LogUtil.log('ActorDropUtil.handleDragLeave - removed drag-over class from all elements (global cleanup)');
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const isActuallyLeaving = (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );

    if (isActuallyLeaving) {
      const dropZone = event.currentTarget.closest('.actor-list, .actors');
      if (dropZone) {
        dropZone.classList.remove('drag-over');
        LogUtil.log('ActorDropUtil.handleDragLeave - removed drag-over class');
      }
    }
  }

  /**
   * Handle the drop event when an actor is dropped into the menu
   * @param {DragEvent} event - The drop event
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static async handleDrop(event, menu) {
    event.preventDefault();
    event.stopPropagation(); // Prevent bubbling to parent elements
    
    for (let i = 0; i < event.dataTransfer.types.length; i++) {
      const type = event.dataTransfer.types[i];
      const data = event.dataTransfer.getData(type);
      LogUtil.log(`ActorDropUtil.handleDrop - ${type}:`, [data]);
    }

    const allDragOverElements = menu.element.querySelectorAll('.drag-over');
    allDragOverElements.forEach(element => {
      element.classList.remove('drag-over');
    });
    LogUtil.log('ActorDropUtil.handleDrop - removed drag-over class from all elements');

    try {
      const dragData = this.parseDragData(event);
      if (!dragData || dragData.type !== 'Actor') {
        LogUtil.log('ActorDropUtil.handleDrop - Invalid drag data', [dragData]);
        return;
      }

      const actor = await this.getActorFromDragData(dragData);
      if (!actor) {
        ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.actorNotFound") || "Actor not found");
        return;
      }
      
      const isPC = isPlayerOwned(actor);
      const targetTab = isPC ? 'pc' : 'npc';

      if (menu.currentTab !== targetTab) {
        menu.currentTab = targetTab;
      }
      await this.addActorToMenu(actor, menu);

      // ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.actorAdded", { 
      //   actor: actor.name 
      // }) || `Added ${actor.name} to Flash Token Actions menu`);

    } catch (error) {
      LogUtil.error('ActorDropUtil.handleDrop - Error processing drop', [error]);
      ui.notifications.error(game.i18n.localize("FLASH_ROLLS.notifications.dropError") || "Error adding actor to menu");
    }
  }

  /**
   * Parse drag data from the drag event
   * @param {DragEvent} event - The drag event
   * @returns {Object|null} The parsed drag data or null if invalid
   */
  static parseDragData(event) {
    try {
      const jsonData = event.dataTransfer.getData('application/json');
      if (jsonData) {
        const parsed = JSON.parse(jsonData);
        return parsed;
      }

      const textData = event.dataTransfer.getData('text/plain');
      
      if (textData) {
        if (textData.startsWith('Actor.')) {
          const dragData = {
            type: 'Actor',
            uuid: textData
          };
          return dragData;
        }
        
        try {
          const parsed = JSON.parse(textData);
          return parsed;
        } catch (e) {
          LogUtil.log('ActorDropUtil.parseDragData - Text is not JSON');
        }
      }

      return null;
    } catch (error) {
      LogUtil.error('ActorDropUtil.parseDragData - Error parsing drag data', [error]);
      return null;
    }
  }

  /**
   * Get the actor document from drag data
   * @param {Object} dragData - The drag data object
   * @returns {Promise<Actor|null>} The actor document or null if not found
   */
  static async getActorFromDragData(dragData) {
    try {
      if (dragData.uuid) {
        return await fromUuid(dragData.uuid);
      } else if (dragData.id) {
        return game.actors.get(dragData.id);
      }
      return null;
    } catch (error) {
      LogUtil.error('ActorDropUtil.getActorFromDragData - Error getting actor', [error]);
      return null;
    }
  }

  /**
   * Add an actor to the menu as a favorite
   * @param {Actor} actor - The actor to add
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static async addActorToMenu(actor, menu) {
    const isBlocked = ActorStatusManager.isBlocked(actor);
    const isFavorite = ActorStatusManager.isFavorite(actor);
    
    if (isFavorite && !isBlocked) {
      ui.notifications.info(game.i18n.format("FLASH_ROLLS.notifications.actorAlreadyAdded", { 
        actor: actor.name 
      }) || `${actor.name} is already in the menu`);
      return;
    }

    await ActorStatusManager.setFavorite(actor, true);
  }
}