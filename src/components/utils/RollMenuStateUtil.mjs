import { LogUtil } from '../LogUtil.mjs';
import { SettingsUtil } from '../SettingsUtil.mjs';
import { getSettings } from '../../constants/Settings.mjs';
import { MODULE } from '../../constants/General.mjs';
import { SidebarUtil } from '../SidebarUtil.mjs';
import { updateCanvasTokenSelection, getActorData } from '../helpers/Helpers.mjs';

/**
 * Utility class for handling UI state management in the Roll Requests Menu
 */
export class RollMenuStateUtil {
  
  /**
   * Handle roll requests toggle
   * @param {Event} event - Toggle event
   */
  static async handleToggleRollRequests(event) {
    const SETTINGS = getSettings();
    const enabled = event.target.checked;
    await SettingsUtil.set(SETTINGS.rollRequestsEnabled.tag, enabled);
    
    SidebarUtil.updateRollRequestsIcon(enabled);
  }

  /**
   * Handle skip dialogs toggle
   * @param {Event} event - Toggle event
   */
  static async handleToggleSkipDialogs(event) {
    const SETTINGS = getSettings();
    const skip = event.target.checked;
    await SettingsUtil.set(SETTINGS.skipRollDialog.tag, skip);
  }

  /**
   * Handle group rolls message toggle
   * @param {Event} event - Toggle event
   */
  static async handleToggleGroupRollsMsg(event) {
    const SETTINGS = getSettings();
    const isEnabled = event.target.checked;
    await SettingsUtil.set(SETTINGS.groupRollsMsgEnabled.tag, isEnabled);
  }

  /**
   * Handle select all toggle
   * @param {Event} event - Toggle event
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static handleToggleSelectAll(event, menu) {
    const SETTINGS = getSettings();
    const selectAll = event.target.checked;
    menu._ignoreTokenControl = true;
    
    const context = menu._lastPreparedContext || {};
    // In Groups tab, data is in context.groups, otherwise in context.actors
    const currentActors = menu.currentTab === 'group' ? (context.groups || []) : (context.actors || []);
    
    currentActors.forEach(actorData => {
      // Handle group actors by selecting/deselecting their members (always, regardless of tab)
      if (actorData.isGroup && actorData.members) {
        actorData.members.forEach(member => {
          const memberUniqueId = member.uniqueId;
          if (selectAll) {
            menu.selectedActors.add(memberUniqueId);
            if (member.tokenId) {
              updateCanvasTokenSelection(member.id, true, member.tokenId);
            } else {
              updateCanvasTokenSelection(member.id, true);
            }
          } else {
            menu.selectedActors.delete(memberUniqueId);
            if (member.tokenId) {
              updateCanvasTokenSelection(member.id, false, member.tokenId);
            } else {
              updateCanvasTokenSelection(member.id, false);
            }
          }
        });
      } else {
        // Handle regular actors
        const uniqueId = actorData.uniqueId;
        if (selectAll) {
          menu.selectedActors.add(uniqueId);
          if (actorData.tokenId) {
            updateCanvasTokenSelection(actorData.id, true, actorData.tokenId);
          } else {
            updateCanvasTokenSelection(actorData.id, true);
          }
        } else {
          menu.selectedActors.delete(uniqueId);
          if (actorData.tokenId) {
            updateCanvasTokenSelection(actorData.id, false, actorData.tokenId);
          } else {
            updateCanvasTokenSelection(actorData.id, false);
          }
        }
      }
    });
    
    setTimeout(() => {
      menu._ignoreTokenControl = false;
    }, 200);
    
    // Update group selection visual state
    menu._updateGroupSelectionUI();
    
    // Update select all state before rendering
    this.updateSelectAllState(menu);
    
    menu.render();
    this.updateRequestTypesVisibility(menu);
    const showOptionsListOnHover = SettingsUtil.get(SETTINGS.showOptionsListOnHover.tag);
    
    // Show/hide request types accordion based on selection
    const accordion = menu.element.querySelector('.request-types-accordion');
    if (accordion) {
      if (menu.selectedActors.size > 0 && showOptionsListOnHover) {
        accordion.classList.add('hover-visible');
      } else {
        accordion.classList.remove('hover-visible');
      }
    }
  }

  /**
   * Handle lock toggle
   * @param {Event} event - Toggle event
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static handleToggleLock(event, menu) {
    event.preventDefault();
    menu.isLocked = !menu.isLocked;
    
    const lockIcon = event.currentTarget;
    lockIcon.classList.remove('fa-lock-keyhole', 'fa-lock-keyhole-open');
    lockIcon.classList.add(menu.isLocked ? 'fa-lock-keyhole' : 'fa-lock-keyhole-open');
  }

  /**
   * Handle options toggle
   * @param {Event} event - Toggle event
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static async handleToggleOptions(event, menu) {
    event.preventDefault();
    event.stopPropagation();
    
    menu.optionsExpanded = !menu.optionsExpanded;
    await game.user.setFlag(MODULE.ID, 'menuOptionsExpanded', menu.optionsExpanded);
    
    const optionsToggleContainer = menu.element.querySelector('.options-toggle');
    if (optionsToggleContainer) {
      optionsToggleContainer.classList.toggle('expanded', menu.optionsExpanded);
    }
    
    const optionsElement = menu.element.querySelector('li.options');
    if (optionsElement) {
      optionsElement.classList.toggle('expanded', menu.optionsExpanded);
    }
  }

  /**
   * Toggle actor selection state
   * @param {string} uniqueId - Unique ID of the actor/token
   * @param {string} actorId - Actor ID
   * @param {string} tokenId - Token ID (if applicable)
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static toggleActorSelection(uniqueId, actorId, tokenId, menu) {
    const SETTINGS = getSettings();
    menu._ignoreTokenControl = true;
    
    if (menu.selectedActors.has(uniqueId)) {
      menu.selectedActors.delete(uniqueId);
      if (tokenId) {
        updateCanvasTokenSelection(actorId, false, tokenId);
      } else {
        updateCanvasTokenSelection(actorId, false);
      }
    } else {
      menu.selectedActors.add(uniqueId);
      if (tokenId) {
        updateCanvasTokenSelection(actorId, true, tokenId);
      } else {
        updateCanvasTokenSelection(actorId, true);
      }
    }
    
    setTimeout(() => {
      menu._ignoreTokenControl = false;
    }, 100);
    
    this.updateActorSelectionUI(uniqueId, menu);
    this.updateSelectAllState(menu);
    this.updateRequestTypesVisibilityNoRender(menu);
    const showOptionsListOnHover = SettingsUtil.get(SETTINGS.showOptionsListOnHover.tag);
    
    // Show request types accordion if we have selected actors
    const accordion = menu.element.querySelector('.request-types-accordion');
    if (accordion) {
      if (menu.selectedActors.size > 0 && showOptionsListOnHover) {
        accordion.classList.add('hover-visible');
      } else {
        accordion.classList.remove('hover-visible');
      }
    }
  }

  /**
   * Update the visual state of an actor element without re-rendering
   * @param {string} actorId - Actor ID to update
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static updateActorSelectionUI(actorId, menu) {
    const wrapperElement = menu.element.querySelector(`.actor.drag-wrapper[data-id="${actorId}"]`);
    if (!wrapperElement) return;
    
    const actorElement = wrapperElement.closest('.actor');
    if (!actorElement) return;
    
    const checkbox = actorElement.querySelector('.actor-select');
    const isSelected = menu.selectedActors.has(actorId);
    
    if (checkbox) {
      checkbox.checked = isSelected;
    }
    
    wrapperElement.classList.toggle('selected', isSelected);
    wrapperElement.dataset.selected = isSelected.toString();
  }

  /**
   * Update request types visibility based on actor selection
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static updateRequestTypesVisibility(menu) {
    menu.render();
  }

  /**
   * Update request types visibility without re-rendering
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static updateRequestTypesVisibilityNoRender(menu) {
    const hasSelection = menu.selectedActors.size > 0;
    const requestTypesContainer = menu.element.querySelector('.request-types');
    
    if (requestTypesContainer) {
      // Only disable individual request items, not the container
      const requestItems = requestTypesContainer.querySelectorAll('.request-type-item');
      requestItems.forEach(item => {
        item.classList.toggle('disabled', !hasSelection);
      });
      
      const hasPlayerCharacter = Array.from(menu.selectedActors).some(uniqueId => {
        const actor = getActorData(uniqueId);
        return actor?.type === 'character';
      });
      
      const hitDieItem = requestTypesContainer.querySelector('[data-id="HIT_DIE"]');
      if (hitDieItem) {
        hitDieItem.style.display = hasPlayerCharacter ? '' : 'none';
      }
    }

    // Status effects should work regardless of actor selection
    // Don't disable status effects container or items
    const statusEffectsContainer = menu.element.querySelector('.status-effects');
    if (statusEffectsContainer) {
      // Status effects can be applied even without selection (they just won't do anything)
      // Keep them enabled for better UX
    }
  }

  /**
   * Update select all checkbox state
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static updateSelectAllState(menu) {
    const selectAllCheckbox = menu.element.querySelector('#flash5e-actors-all');
    let selectedCount = 0;
    let totalCount = 0;
    
    if (menu.currentTab === 'group') {
      // For groups tab, count selected group members using the same logic as template preparation
      const context = menu._lastPreparedContext || {};
      const currentActors = context.groups || [];
      const allMembers = [];
      currentActors.forEach(groupActor => {
        if (groupActor.isGroup && groupActor.members) {
          allMembers.push(...groupActor.members);
        }
      });
      totalCount = allMembers.length;
      selectedCount = allMembers.filter(member => 
        menu.selectedActors.has(member.uniqueId)
      ).length;
    } else {
      // For PC/NPC tabs, use the existing checkbox logic
      const currentActors = menu.currentTab === 'pc' ? 'pc' : 'npc';
      const checkboxes = menu.element.querySelectorAll(`.${currentActors}-actors .actor-item input[type="checkbox"]`);
      totalCount = checkboxes.length;
      selectedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    }
    
    selectAllCheckbox.checked = selectedCount > 0 && selectedCount === totalCount;
    selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalCount;
  }
}