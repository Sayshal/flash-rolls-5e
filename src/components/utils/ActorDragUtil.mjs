import { LogUtil } from '../utils/LogUtil.mjs';
import { ActorStatusManager } from '../managers/ActorStatusManager.mjs';

/**
 * Handles drag-to-remove functionality for actors in the Roll Requests Menu
 */
export class ActorDragUtil {
  /**
   * Initialize drag functionality for actor list items
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static initializeActorDrag(menu) {
    const actorElements = menu.element.querySelectorAll('.actor-list .actor.drag-wrapper[draggable="true"]');
    
    actorElements.forEach(actorElement => {
      actorElement.addEventListener('dragstart', (e) => this.handleDragStart(e, menu));
      actorElement.addEventListener('dragend', (e) => this.handleDragEnd(e, menu));
    });
    
    const menuContainer = menu.element;
    menuContainer.addEventListener('dragover', (e) => this.handleDragOver(e));
    menuContainer.addEventListener('drop', (e) => this.handleDrop(e, menu));
    
    document.addEventListener('dragover', (e) => this.handleGlobalDragOver(e, menu));
    document.addEventListener('drop', (e) => this.handleGlobalDrop(e, menu));
  }
  
  /**
   * Handle drag start event
   * @param {DragEvent} event 
   * @param {RollRequestsMenu} menu 
   */
  static handleDragStart(event, menu) {
    const actorElement = event.currentTarget;
    const actorId = actorElement.dataset.actorId;
    const actor = game.actors.get(actorId);
    
    if (!actor) {
      event.preventDefault();
      return;
    }
    
    LogUtil.log('ActorDragUtil.handleDragStart', [actor.name, actorId]);
    
    event.dataTransfer.setData('text/plain', actorId);
    event.dataTransfer.setData('application/json', JSON.stringify({
      actorId: actorId,
      actorName: actor.name,
      uniqueId: actorElement.dataset.id,
      tokenId: actorElement.dataset.tokenId || null
    }));
    
    event.dataTransfer.effectAllowed = 'move';
    actorElement.classList.add('dragging');
    
    const rect = actorElement.getBoundingClientRect();

    const dragImage = document.createElement('div');
    dragImage.style.width = rect.width + 'px';
    dragImage.style.height = rect.height + 'px';
    dragImage.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    dragImage.style.border = '2px dashed rgba(255, 255, 255, 0.3)';
    dragImage.style.borderRadius = '4px';
    dragImage.style.opacity = '0.6';
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    dragImage.style.left = '-1000px';
    dragImage.style.pointerEvents = 'none';
    document.body.appendChild(dragImage);

    event.dataTransfer.setDragImage(dragImage, rect.width / 2, rect.height / 2);
    
    setTimeout(() => {
      if (dragImage.parentNode) {
        dragImage.parentNode.removeChild(dragImage);
      }
    }, 0);
    
    menu._currentDragData = {
      actorId: actorId,
      actorElement: actorElement,
      startTime: Date.now()
    };
  }
  
  /**
   * Create a custom drag image for group actors showing member portraits
   * @param {HTMLElement} actorElement - The group actor element
   * @param {Actor} actor - The group actor
   * @returns {HTMLElement} The custom drag image element
   */
  static createGroupDragImage(actorElement, actor) {
    const dragImage = document.createElement('div');
    dragImage.className = 'actor actor-group drag-wrapper';
    dragImage.style.background = getComputedStyle(actorElement).background;
    dragImage.style.border = getComputedStyle(actorElement).border;
    dragImage.style.borderRadius = getComputedStyle(actorElement).borderRadius;
    dragImage.style.padding = getComputedStyle(actorElement).padding;

    // Get the actor images container (non-expanded view)
    const actorImgContainer = actorElement.querySelector('.actor-img');
    if (actorImgContainer) {
      const clonedImgContainer = actorImgContainer.cloneNode(true);
      dragImage.appendChild(clonedImgContainer);
    }

    // Add group name
    const nameDiv = document.createElement('div');
    nameDiv.className = 'actor-name';
    nameDiv.textContent = actor.name;
    nameDiv.style.color = getComputedStyle(actorElement.querySelector('.actor-name') || actorElement).color;
    nameDiv.style.fontSize = getComputedStyle(actorElement.querySelector('.actor-name') || actorElement).fontSize;
    nameDiv.style.fontWeight = 'bold';
    nameDiv.style.textAlign = 'center';
    nameDiv.style.marginTop = '4px';
    dragImage.appendChild(nameDiv);

    return dragImage;
  }

  /**
   * Create a standard drag image for regular actors with improved formatting
   * @param {HTMLElement} actorElement - The actor element
   * @returns {HTMLElement} The drag image element
   */
  static createStandardDragImage(actorElement) {
    const dragImage = document.createElement('div');
    dragImage.className = actorElement.className;
    dragImage.style.background = getComputedStyle(actorElement).background;
    dragImage.style.border = getComputedStyle(actorElement).border;
    dragImage.style.borderRadius = getComputedStyle(actorElement).borderRadius;
    dragImage.style.padding = getComputedStyle(actorElement).padding;
    dragImage.style.display = 'flex';
    dragImage.style.alignItems = 'center';
    dragImage.style.gap = '8px';

    // Clone the actor image
    const actorImg = actorElement.querySelector('.actor-img');
    if (actorImg) {
      const clonedImg = actorImg.cloneNode(true);
      dragImage.appendChild(clonedImg);
    }

    // Clone the actor name
    const actorName = actorElement.querySelector('.actor-name');
    if (actorName) {
      const clonedName = actorName.cloneNode(true);
      dragImage.appendChild(clonedName);
    }

    return dragImage;
  }

  /**
   * Handle drag over event within the menu
   * @param {DragEvent} event
   */
  static handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'none';
  }
  
  /**
   * Handle drop event within the menu
   * @param {DragEvent} event 
   * @param {RollRequestsMenu} menu 
   */
  static handleDrop(event, menu) {
    event.preventDefault();
    LogUtil.log('ActorDragUtil.handleDrop - dropped within menu, canceling remove');
    
    this.cleanupDrag(menu);
  }
  
  /**
   * Handle global drag over (outside the menu)
   * @param {DragEvent} event
   * @param {RollRequestsMenu} menu
   */
  static handleGlobalDragOver(event, menu) {
    if (!menu._currentDragData) return;

    // Check if we're over the menu element or any of its children
    const menuElement = menu.element;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const isOverMenu = menuElement && (menuElement.contains(target) || menuElement === target);

    if (!isOverMenu) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      if (menu._currentDragData.actorElement) {
        menu._currentDragData.actorElement.classList.add('drag-remove-zone');
      }
    } else {
      event.dataTransfer.dropEffect = 'none';

      if (menu._currentDragData.actorElement) {
        menu._currentDragData.actorElement.classList.remove('drag-remove-zone');
      }
    }
  }
  
  /**
   * Handle global drop (outside the menu)
   * @param {DragEvent} event
   * @param {RollRequestsMenu} menu
   */
  static handleGlobalDrop(event, menu) {
    if (!menu._currentDragData) return;

    // Check if we're over the menu element or any of its children
    const menuElement = menu.element;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const isOverMenu = menuElement && (menuElement.contains(target) || menuElement === target);

    if (!isOverMenu) {
      event.preventDefault();

      const dragData = JSON.parse(event.dataTransfer.getData('application/json'));
      LogUtil.log('ActorDragUtil.handleGlobalDrop - blocking actor', [dragData.actorName]);

      this.blockActor(dragData.actorId, menu);
    }

    this.cleanupDrag(menu);
  }
  
  /**
   * Handle drag end event
   * @param {DragEvent} event 
   * @param {RollRequestsMenu} menu 
   */
  static handleDragEnd(event, menu) {
    LogUtil.log('ActorDragUtil.handleDragEnd');
    
    setTimeout(() => {
      this.cleanupDrag(menu);
    }, 100);
  }
  
  /**
   * Block an actor by setting the blocked flag
   * @param {string} actorId - The actor ID to block
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static async blockActor(actorId, menu) {
    try {
      await ActorStatusManager.blockActor(actorId);
      
      const actorElement = menu.element.querySelector(`[data-actor-id="${actorId}"]`);
      if (actorElement) {
        const uniqueId = actorElement.dataset.id;
        menu.selectedActors.delete(uniqueId);
      }
      
      // Let the ActorStatusManager._refreshMenu() handle the re-render automatically
      
    } catch (error) {
      LogUtil.error('Error blocking actor', [error]);
      ui.notifications.error(`Failed to block actor: ${error.message}`);
    }
  }
  
  /**
   * Clean up drag-related state and visual feedback
   * @param {RollRequestsMenu} menu 
   */
  static cleanupDrag(menu) {
    if (menu._currentDragData?.actorElement) {
      menu._currentDragData.actorElement.classList.remove('dragging', 'drag-remove-zone');
    }
    
    menu._currentDragData = null;
  }
  
  /**
   * Remove drag event listeners (for cleanup)
   * @param {RollRequestsMenu} menu 
   */
  static removeDragListeners(menu) {
    document.removeEventListener('dragover', this.handleGlobalDragOver);
    document.removeEventListener('drop', this.handleGlobalDrop);
  }
}