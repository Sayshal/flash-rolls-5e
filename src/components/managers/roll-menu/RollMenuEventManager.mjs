import { LogUtil } from '../../utils/LogUtil.mjs';
import { RollMenuDragManager } from './RollMenuDragManager.mjs';
import { delay, getActorData, updateCanvasTokenSelection } from '../../helpers/Helpers.mjs';
import { getSettings } from '../../../constants/Settings.mjs';
import { SettingsUtil } from '../../utils/SettingsUtil.mjs';
import { MODULE_ID } from '../../../constants/General.mjs';
import { TokenMovementManager } from '../../utils/TokenMovementManager.mjs';

/**
 * Handles Roll Requests Menu event listeners
 */
export class RollMenuEventManager {

  /**
   * Set to track tokens that were temporarily selected on hover
   * @type {Set<Token>}
   */
  static _hoveredTokens = new Set();

  /**
   * Reference to the active menu instance
   * @type {RollRequestsMenu|null}
   */
  static activeMenu = null;
  
  /**
   * Attach all event listeners to the menu
   * @param {RollRequestsMenu} menu - The menu instance
   * @param {HTMLElement} html - The menu HTML element
   */
  static attachListeners(menu, html) {
    LogUtil.log('RollMenuEventManager.attachListeners');

    this.activeMenu = menu;

    // Check if there are no actors and clean up tooltips
    const actors = html.querySelectorAll('.actor');
    if (actors.length === 0) {
      this.cleanupActorTooltips();
      html.classList.add('no-actors');
    } else {
      html.classList.remove('no-actors');
    }

    this.attachToggleHandlers(menu, html);
    this.attachDragHandlers(menu, html);
    this.attachTabHandlers(menu, html);
    this.attachActorHandlers(menu, html);
    this.attachActionIconHandlers(menu, html);
    this.attachCompactTooltipHandlers(menu, html);
    this.attachSearchHandlers(menu, html);
    this.attachAccordionHandlers(menu, html);
    this.attachSubmenuHandlers(menu, html);
    this.attachStatusEffectHandlers(menu, html);
    this.attachGroupHandlers(menu, html);
    this.attachOutsideClickHandler(menu);
  }
  
  /**
   * Attach toggle switch handlers
   */
  static attachToggleHandlers(menu, html) {
    html.querySelector('#flash-rolls-toggle')?.addEventListener('change', menu._onToggleRollRequests.bind(menu));
    html.querySelector('#flash5e-skip-dialogs')?.addEventListener('change', menu._onToggleSkipDialogs.bind(menu));
    html.querySelector('#flash5e-group-rolls-msg')?.addEventListener('change', menu._onToggleGroupRollsMsg.bind(menu));
    html.querySelector('#flash5e-actors-all')?.addEventListener('change', menu._onToggleSelectAll.bind(menu));
    html.querySelector('#flash5e-filter-actors')?.addEventListener('click', menu._onToggleActorFilter.bind(menu));
    html.querySelector('#flash5e-actors-lock')?.addEventListener('click', menu._onToggleLock.bind(menu));
    html.querySelector('.options-toggle-btn')?.addEventListener('click', menu._onToggleOptions.bind(menu));
    html.querySelector('#flash5e-open-settings')?.addEventListener('click', menu._onOpenSettings.bind(menu));
  }
  
  /**
   * Attach drag handle handlers
   */
  static attachDragHandlers(menu, html) {
    const dragHandle = html.querySelector(RollMenuDragManager.DRAG_HANDLE_SELECTOR);
    if (dragHandle && !dragHandle.hasAttribute('data-drag-initialized')) {
      dragHandle.setAttribute('data-drag-initialized', 'true');
      dragHandle.addEventListener('mousedown', (e) => {
        RollMenuDragManager.handleDragStart(e, menu);
      });
    }
  }
  
  /**
   * Attach tab click handlers
   */
  static attachTabHandlers(menu, html) {
    const tabs = html.querySelectorAll('.actor-tab');
    LogUtil.log('RollMenuEventManager.attachTabHandlers - found tabs:', [tabs.length]);
    tabs.forEach(tab => {
      LogUtil.log('RollMenuEventManager.attachTabHandlers - attaching to tab:', [tab.dataset.tab]);
      tab.addEventListener('click', menu._onTabClick.bind(menu));
      tab.addEventListener('dblclick', menu._onTabDoubleClick.bind(menu));
    });
  }
  
  /**
   * Attach action icon handlers for bulk operations
   */
  static attachActionIconHandlers(menu, html) {
    html.querySelector('#flash5e-targets')?.addEventListener('click', () => {
      this.toggleTargetsForSelected(menu);
    });

    html.querySelector('#flash5e-heal-selected')?.addEventListener('click', () => {
      this.healSelectedActors(menu);
    });

    html.querySelector('#flash5e-kill-selected')?.addEventListener('click', () => {
      this.killSelectedActors(menu);
    });

    html.querySelector('#flash5e-sheets')?.addEventListener('click', () => {
      this.openSheetsForSelected(menu);
    });

    html.querySelector('#flash5e-toggle-list')?.addEventListener('change', () => {
      this.toggleOptionsListOnHover(menu);
    });

    html.querySelector('#flash5e-remove-effects')?.addEventListener('click', () => {
      this.removeAllStatusEffectsFromSelected(menu);
    });

    html.querySelector('#flash5e-group-selected')?.addEventListener('click', () => {
      this.createGroupFromSelected(menu);
    });

    html.querySelector('#flash5e-lock-movement')?.addEventListener('click', () => {
      this.toggleMovementForSelected(menu);
    });

    html.querySelector('#flash5e-contested-roll')?.addEventListener('click', () => {
      this.openContestedRollDialog(menu);
    });

    const navButtons = html.querySelectorAll('.actor-actions-nav');
    navButtons.forEach(button => {
      button.addEventListener('click', (event) => {
        this.scrollActorActions(event.currentTarget, html);
      });
    });

    const scrollContainer = html.querySelector('.actor-actions-scrollable');
    if (scrollContainer) {
      this.updateActorActionsContainerHeight(html);
      this.updateActorActionsNavState(html);
      scrollContainer.addEventListener('scroll', () => {
        this.updateActorActionsNavState(html);
      });
    }
  }

  /**
   * Update the actor actions container max-height/max-width based on actual item dimensions
   * @param {HTMLElement} html - The menu HTML element
   */
  static updateActorActionsContainerHeight(html) {
    const scrollContainer = html.querySelector('.actor-actions-scrollable');
    if (!scrollContainer) return;

    const container = scrollContainer.closest('.actor-actions-container');
    if (!container || container.classList.contains('no-scroll')) return;

    const firstItem = scrollContainer.querySelector('li.bulk-action');
    if (!firstItem) return;

    const SETTINGS = getSettings();
    const menuLayout = SettingsUtil.get(SETTINGS.menuLayout.tag) || 'vertical';
    const maxIconsPerRow = SettingsUtil.get(SETTINGS.maxIconsPerRow.tag) || 5;

    if (menuLayout === 'horizontal') {
      const itemWidth = firstItem.offsetWidth;
      const maxWidth = itemWidth * maxIconsPerRow;
      scrollContainer.style.maxWidth = `${maxWidth}px`;
      scrollContainer.style.maxHeight = '';
    } else {
      const itemHeight = firstItem.offsetHeight;
      const maxHeight = itemHeight * maxIconsPerRow;
      scrollContainer.style.maxHeight = `${maxHeight}px`;
      scrollContainer.style.maxWidth = '';
    }
  }

  /**
   * Scroll actor actions container in the appropriate direction
   * @param {HTMLElement} button - The navigation button that was clicked
   * @param {HTMLElement} html - The menu HTML element
   */
  static scrollActorActions(button, html) {
    const direction = button.dataset.direction;
    const scrollContainer = html.querySelector('.actor-actions-scrollable');
    if (!scrollContainer) return;

    const firstItem = scrollContainer.querySelector('li.bulk-action');
    if (!firstItem) return;

    const SETTINGS = getSettings();
    const menuLayout = SettingsUtil.get(SETTINGS.menuLayout.tag) || 'vertical';
    const maxIconsPerRow = SettingsUtil.get(SETTINGS.maxIconsPerRow.tag) || 5;
    const itemsToScroll = Math.max(1, maxIconsPerRow - 1);

    if (menuLayout === 'horizontal') {
      const itemWidth = firstItem.offsetWidth;
      const scrollAmount = direction === 'left' ? -(itemWidth * itemsToScroll) : (itemWidth * itemsToScroll);
      scrollContainer.scrollBy({
        left: scrollAmount,
        behavior: 'smooth'
      });
    } else {
      const itemHeight = firstItem.offsetHeight;
      const scrollAmount = direction === 'up' ? -(itemHeight * itemsToScroll) : (itemHeight * itemsToScroll);
      scrollContainer.scrollBy({
        top: scrollAmount,
        behavior: 'smooth'
      });
    }

    setTimeout(() => {
      this.updateActorActionsNavState(html);
    }, 300);
  }

  /**
   * Update the enabled/disabled state of actor actions navigation arrows
   * @param {HTMLElement} html - The menu HTML element
   */
  static updateActorActionsNavState(html) {
    const scrollContainer = html.querySelector('.actor-actions-scrollable');
    if (!scrollContainer) return;

    const SETTINGS = getSettings();
    const menuLayout = SettingsUtil.get(SETTINGS.menuLayout.tag) || 'vertical';

    let firstButton, secondButton, isAtStart, isAtEnd;

    if (menuLayout === 'horizontal') {
      firstButton = html.querySelector('.actor-actions-nav-left');
      secondButton = html.querySelector('.actor-actions-nav-right');

      if (!firstButton || !secondButton) return;

      const scrollLeft = scrollContainer.scrollLeft;
      const scrollWidth = scrollContainer.scrollWidth;
      const clientWidth = scrollContainer.clientWidth;

      isAtStart = scrollLeft <= 1;
      isAtEnd = scrollLeft + clientWidth >= scrollWidth - 1;
    } else {
      firstButton = html.querySelector('.actor-actions-nav-up');
      secondButton = html.querySelector('.actor-actions-nav-down');

      if (!firstButton || !secondButton) return;

      const scrollTop = scrollContainer.scrollTop;
      const scrollHeight = scrollContainer.scrollHeight;
      const clientHeight = scrollContainer.clientHeight;

      isAtStart = scrollTop <= 1;
      isAtEnd = scrollTop + clientHeight >= scrollHeight - 1;
    }

    if (isAtStart) {
      firstButton.classList.add('disabled');
      firstButton.setAttribute('disabled', 'true');
    } else {
      firstButton.classList.remove('disabled');
      firstButton.removeAttribute('disabled');
    }

    if (isAtEnd) {
      secondButton.classList.add('disabled');
      secondButton.setAttribute('disabled', 'true');
    } else {
      secondButton.classList.remove('disabled');
      secondButton.removeAttribute('disabled');
    }
  }

  /**
   * Attach actor selection handlers
   */
  static attachActorHandlers(menu, html) {
    html.querySelectorAll('.actor.drag-wrapper').forEach(wrapper => {
      wrapper.addEventListener('click', (event) => {
        // Check if this actor is non-selectable (expanded group)
        if (wrapper.hasAttribute('data-non-selectable')) {
          return; // Skip selection for expanded groups
        }
        menu._onActorClick.call(menu, event);
      });

      // Add click handler for character sheet icon (works for both individual and group actors)
      const sheetIcon = wrapper.querySelector('.icon-sheet');
      if (sheetIcon) {
        sheetIcon.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();

          const actorId = wrapper.dataset.actorId;
          const tokenId = wrapper.dataset.tokenId;

          this.openActorSheetById(actorId, tokenId);
        });
      }

      // Add click handler for target icon
      const targetIcon = wrapper.querySelector('.icon-target');
      if (targetIcon) {
        targetIcon.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          
          const actorId = wrapper.dataset.actorId;
          const tokenId = wrapper.dataset.tokenId;
          
          this.toggleActorTargetById(actorId, tokenId);
        });
      }

      // Add right-click handler for actor image to center token on screen
      const actorImg = wrapper.querySelector('.actor-img');
      if (actorImg) {
        actorImg.addEventListener('contextmenu', (event) => {
          event.preventDefault();
          event.stopPropagation();
          
          const tokenId = wrapper.dataset.tokenId;
          const actorId = wrapper.dataset.actorId;
          
          let token = tokenId ? canvas.tokens.get(tokenId) : null;
          if (!token && actorId) {
            token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
          }
          
          if (token) {
            canvas.animatePan({ x: token.x, y: token.y, duration: 250 });
          }
        });

        // Add hover handlers for temporary token selection preview
        actorImg.addEventListener('mouseenter', (event) => {
          this.showTokenSelectionPreview(wrapper, menu);
        });

        actorImg.addEventListener('mouseleave', (event) => {
          this.hideTokenSelectionPreview(wrapper, menu);
        });
      }
    });
  }
  
  /**
   * Clean up any existing actor data tooltips
   */
  static cleanupActorTooltips() {
    const existingTooltips = document.querySelectorAll('.actor-data-tooltip');
    existingTooltips.forEach(tooltip => tooltip.remove());
  }

  /**
   * Attach tooltip handlers for compact mode
   */
  static attachCompactTooltipHandlers(menu, html) {
    // Always clean up existing tooltips first
    this.cleanupActorTooltips();
    
    if (!html.classList.contains('compact')) return;
    
    const actors = html.querySelectorAll('#flash-rolls-menu.compact .actor');
    
    actors.forEach(actor => {
      const actorData = actor.querySelector('.actor-data');
      if (!actorData) return;
      
      let tooltipCopy = null;
      
      const showTooltip = async (event) => {
        
        const existingTooltip = document.querySelector('.actor-data-tooltip');
        if (existingTooltip) {
          existingTooltip.remove();
        }
        
        tooltipCopy = actorData.cloneNode(true);
        
        const actorRect = actor.getBoundingClientRect();
        const menuRect = html.getBoundingClientRect();
        const isLeftEdge = html.classList.contains('left-edge');
        const isHorizontalLayout = html.hasAttribute('data-layout') && html.getAttribute('data-layout') === 'horizontal';
        
        if (isHorizontalLayout) {
          // Position above and centered on the actor image in horizontal layout
          const actorImg = actor.querySelector('.actor-img');
          const imgRect = actorImg ? actorImg.getBoundingClientRect() : actorRect;
          
          // Calculate the center of the image relative to the menu
          const imgCenterX = imgRect.left + (imgRect.width / 2) - menuRect.left - 16;
          
          tooltipCopy.style.left = `${imgCenterX}px`;
          tooltipCopy.style.transform = 'translateX(-50%)';
          tooltipCopy.style.bottom = `${menuRect.bottom - actorRect.top + 8}px`;
          tooltipCopy.style.top = 'auto';
          tooltipCopy.style.right = 'auto';
        } else {
          // Original vertical layout positioning
          if (isLeftEdge) {
            tooltipCopy.style.left = `${actorRect.right - menuRect.left - 8}px`;
          } else {
            tooltipCopy.style.right = `${menuRect.right - actorRect.left - 8}px`;
          }
          tooltipCopy.style.top = `${actorRect.top - menuRect.top}px`;
        }
        tooltipCopy.className = 'actor-data-tooltip';
        
        document.querySelector('#flash-rolls-menu').appendChild(tooltipCopy);
        
        setTimeout(()=>{
          tooltipCopy?.classList.add('visible');
        }, menu.selectedActors.size > 0 ? 300 : 0);
      };
      
      const hideTooltip = () => {
        if (tooltipCopy) {
          tooltipCopy.remove();
          tooltipCopy = null;
        }
      };
      
      actor.addEventListener('mouseenter', showTooltip);
      actor.addEventListener('mouseleave', hideTooltip);
      
      // Clean up on scroll to prevent misaligned tooltips
      const scrollContainer = actor.closest('ul');
      if (scrollContainer) {
        scrollContainer.addEventListener('scroll', hideTooltip);
      }
    });
  }
  
  /**
   * Attach search input handlers
   */
  static attachSearchHandlers(menu, html) {
    const searchInput = html.querySelector('.search-input');
    if (searchInput) {
      searchInput.addEventListener('input', menu._onSearchInput.bind(menu));
      
      // Select all text on click for quick deletion
      searchInput.addEventListener('click', (event) => {
        event.target.select();
      });
      
      // Also select all on focus (useful for keyboard navigation)
      searchInput.addEventListener('focus', (event) => {
        event.target.select();
        menu.isSearchFocused = true;
        game.user.setFlag(MODULE_ID, 'searchFocused', true);
      });
      
      // Hide accordion when search loses focus (if not hovering over menu)
      searchInput.addEventListener('blur', () => {
        menu.isSearchFocused = false;
        game.user.setFlag(MODULE_ID, 'searchFocused', false);
        const accordion = html.querySelector('.request-types-accordion');
        if (accordion && !html.matches(':hover')) {
          accordion.classList.remove('hover-visible');
        }
      });
    }
  }
  
  /**
   * Attach accordion and request type handlers
   */
  static attachAccordionHandlers(menu, html) {    
    const SETTINGS = getSettings();
    const showOnHover = SettingsUtil.get(SETTINGS.showOptionsListOnHover.tag);
    
    const accordion = html.querySelector('.request-types-accordion');
    if (accordion) {
      // Always create the handlers but store them so we can add/remove them dynamically
      const mouseEnterHandler = () => {
        const showOptionsListOnHover = SettingsUtil.get(SETTINGS.showOptionsListOnHover.tag);
        LogUtil.log('Accordion mouseEnter', [menu.isSearchFocused]);
        if (menu.selectedActors.size > 0 && showOptionsListOnHover) {
          accordion?.classList.add('hover-visible');
        }
      };
      
      const mouseLeaveHandler = () => {
        LogUtil.log('Accordion mouseLeave', [menu.isSearchFocused]);
        if (!menu.isSearchFocused) {
          accordion?.classList.remove('hover-visible');
        }
      };
      
      // Store handlers on the menu for dynamic management
      menu._accordionMouseEnter = mouseEnterHandler;
      menu._accordionMouseLeave = mouseLeaveHandler;
      
      // Only attach if setting is enabled
      if (showOnHover) {
        html.addEventListener('mouseenter', mouseEnterHandler);
        html.addEventListener('mouseleave', mouseLeaveHandler);
        menu._accordionListenersAttached = true;
      } else {
        menu._accordionListenersAttached = false;
      }
    }
    
    const requestTypesContainer = html.querySelector('.request-types');
    LogUtil.log('RollMenuEventManager.attachAccordionHandlers', [requestTypesContainer]);
    if (requestTypesContainer) {
      requestTypesContainer.addEventListener('click', (event) => {
        // Handle macro button clicks FIRST - check target directly

        LogUtil.log('requestTypes click', [event.target]);
        if (event.target.classList.contains('btn-macro')) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          
          const parentItem = event.target.closest('.sub-item') || event.target.closest('.request-type-item');
          if (parentItem) {
            const customEvent = {
              ...event,
              currentTarget: parentItem
            };
            menu._onMacroButtonClick(customEvent);
          }
          return;
        }
        
        // Also check if clicked element is inside a macro button
        const macroBtn = event.target.closest('.btn-macro');
        if (macroBtn) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          
          const parentItem = macroBtn.closest('.sub-item') || macroBtn.closest('.request-type-item');
          if (parentItem) {
            const customEvent = {
              ...event,
              currentTarget: parentItem
            };
            menu._onMacroButtonClick(customEvent);
          }
          return;
        }
        
        const requestHeader = event.target.closest('.request-type-header');
        
        if (requestHeader) {
          const requestItem = requestHeader.closest('.request-type-item');
          
          if (requestHeader.classList.contains('accordion-header')) {
            menu._onAccordionToggle(event);
            return;
          }
          
          if (requestHeader.classList.contains('toggle') && requestItem && requestItem.classList.contains('rollable')) {
            const customEvent = {
              ...event,
              currentTarget: requestItem
            };
            menu._onRequestTypeClick(customEvent);
            return;
          }
        }
        
        const subItem = event.target.closest('.sub-item');
        if (subItem && subItem.dataset.id) {
          const customEvent = {
            ...event,
            currentTarget: subItem
          };
          menu._onRollTypeClick(customEvent);
        }
      });
    }
  }

  /**
   * Attach submenu tab handlers
   */
  static attachSubmenuHandlers(menu, html) {
    try {
      const submenuTabs = html.querySelectorAll('.submenu-tabs li[data-tab]');
      LogUtil.log('RollMenuEventManager.attachSubmenuHandlers - found tabs:', [submenuTabs.length]);
      submenuTabs.forEach(tab => {
        tab.addEventListener('click', menu._onSubmenuTabClick.bind(menu));
      });
    } catch (error) {
      LogUtil.error('RollMenuEventManager.attachSubmenuHandlers error:', [error]);
    }
  }

  /**
   * Attach status effect handlers
   */
  static attachStatusEffectHandlers(menu, html) {
    try {
      const statusEffects = html.querySelectorAll('.status-effects .status-effect');
      LogUtil.log('RollMenuEventManager.attachStatusEffectHandlers - found effects:', [statusEffects.length]);
      statusEffects.forEach(statusElement => {
        // Check if listener already attached to prevent duplicates
        if (!statusElement.dataset.listenerAttached) {
          statusElement.dataset.listenerAttached = 'true';
          statusElement.addEventListener('click', menu._onStatusEffectClick.bind(menu));
        }
      });
    } catch (error) {
      LogUtil.error('RollMenuEventManager.attachStatusEffectHandlers error:', [error]);
    }
  }
  
  /**
   * Attach group expansion/collapse handlers
   */
  static attachGroupHandlers(menu, html) {
    const groupExpandButtons = html.querySelectorAll('.group-expand-btn');
    groupExpandButtons.forEach(button => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        const groupId = button.dataset.groupId;
        const isExpanded = menu.groupExpansionStates[groupId] ?? false;
        
        menu.groupExpansionStates[groupId] = !isExpanded;
        await game.user.setFlag(MODULE_ID, 'groupExpansionStates', menu.groupExpansionStates);
        menu.render();
      });
    });
  }

  /**
   * Attach outside click handler with delay to prevent immediate closure
   */
  static attachOutsideClickHandler(menu) {
    setTimeout(() => {
      document.addEventListener('click', menu._onClickOutside, true);
    }, 100);
  }

  /**
   * Toggle targeting for all selected actors
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static toggleTargetsForSelected(menu) {
    menu.selectedActors.forEach(uniqueId => {
      const actor = getActorData(uniqueId);
      if (!actor) return;
      
      const actorId = actor.id;
      const tokenId = game.actors.get(uniqueId) ? null : uniqueId;
      
      this.toggleActorTargetById(actorId, tokenId);
    });
  }

  /**
   * Open character sheets for all selected actors
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static openSheetsForSelected(menu) {
    // If we're on the Groups tab, open group sheets instead of individual member sheets
    if (menu.currentTab === 'group') {
      this.openGroupSheetsForSelected(menu);
    } else {
      // Regular behavior for PC/NPC tabs
      menu.selectedActors.forEach(uniqueId => {
        const actor = getActorData(uniqueId);
        if (!actor) return;
        
        const actorId = actor.id;
        const tokenId = game.actors.get(uniqueId) ? null : uniqueId;
        
        this.openActorSheetById(actorId, tokenId);
      });
    }
  }

  /**
   * Open group sheets for groups that contain selected members
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static openGroupSheetsForSelected(menu) {
    const context = menu._lastPreparedContext || {};
    const groupActors = context.actors || [];
    const openedGroups = new Set();
    
    // Find which groups contain selected members
    groupActors.forEach(groupData => {
      if (groupData.isGroup && groupData.members) {
        // Check if any members of this group are selected
        const hasSelectedMembers = groupData.members.some(member => 
          menu.selectedActors.has(member.uniqueId)
        );
        
        if (hasSelectedMembers && !openedGroups.has(groupData.id)) {
          // Open the group sheet
          this.openActorSheetById(groupData.id, groupData.tokenId);
          openedGroups.add(groupData.id);
        }
      }
    });
  }

  /**
   * Heal all selected actors to full HP
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static healSelectedActors(menu) {
    menu.selectedActors.forEach(uniqueId => {
      const actor = getActorData(uniqueId);
      if (!actor) return;
      
      const actorId = actor.id;
      const tokenId = game.actors.get(uniqueId) ? null : uniqueId;
      
      this.healActorById(actorId, tokenId);
    });
  }

  /**
   * Set HP to 0 for all selected actors
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static killSelectedActors(menu) {
    menu.selectedActors.forEach(uniqueId => {
      const actor = getActorData(uniqueId);
      if (!actor) return;
      
      const actorId = actor.id;
      const tokenId = game.actors.get(uniqueId) ? null : uniqueId;
      
      this.killActorById(actorId, tokenId);
    });
  }

  /**
   * Remove all status effects from selected actors
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static async removeAllStatusEffectsFromSelected(menu) {
    if (menu.selectedActors.size === 0) {
      ui.notifications.warn("No actors selected");
      return;
    }

    let totalRemoved = 0;
    let totalActors = 0;

    for (const uniqueId of menu.selectedActors) {
      const actor = getActorData(uniqueId);
      if (!actor) continue;
      
      totalActors++;
      
      // Get all status effects on the actor
      const statusEffects = actor.appliedEffects.filter(effect =>
        effect.statuses?.size > 0 || effect.flags?.core?.statusId
      );
      
      if (statusEffects.length > 0) {
        // Remove all status effects
        for (const effect of statusEffects) {
          try {
            await effect.delete();
            totalRemoved++;
          } catch (error) {
            LogUtil.error(`Failed to remove status effect from ${actor.name}`, [error]);
          }
        }
      }
    }
    
    if (totalRemoved > 0) {
      ui.notifications.info(`Removed ${totalRemoved} status effects from ${totalActors} actor(s)`);
    } else {
      ui.notifications.info(`No status effects to remove from selected actors`);
    }
  }

  /**
   * Toggle target state for a single actor
   * @param {HTMLElement} wrapper - The actor wrapper element
   */
  static toggleActorTarget(wrapper) {
    const tokenId = wrapper.dataset.tokenId;
    const actorId = wrapper.dataset.actorId;
    
    let token = tokenId ? canvas.tokens.get(tokenId) : null;
    if (!token && actorId) {
      token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
    }
    
    if (token) {
      const isTargeted = game.user.targets.has(token);
      token.setTarget(!isTargeted, { releaseOthers: false });
    }
  }

  /**
   * Open character sheet for a single actor
   * @param {HTMLElement} wrapper - The actor wrapper element
   */
  static openActorSheet(wrapper) {
    const actorId = wrapper.dataset.actorId;
    const tokenId = wrapper.dataset.tokenId;
    
    if (actorId) {
      let actor;
      if (tokenId) {
        const token = canvas.tokens.get(tokenId);
        actor = token?.actor || game.actors.get(actorId);
      } else {
        actor = game.actors.get(actorId);
      }
      actor?.sheet.render(true);
    }
  }

  /**
   * Heal actor to full HP
   * @param {HTMLElement} wrapper - The actor wrapper element
   */
  static healActor(wrapper) {
    const actorId = wrapper.dataset.actorId;
    const tokenId = wrapper.dataset.tokenId;
    
    let actor;
    if (tokenId) {
      const token = canvas.tokens.get(tokenId);
      actor = token?.actor || game.actors.get(actorId);
    } else {
      actor = game.actors.get(actorId);
    }
    
    if (actor && actor.system?.attributes?.hp) {
      const maxHP = actor.system.attributes.hp.max;
      actor.update({ 'system.attributes.hp.value': maxHP });
    }
  }

  /**
   * Set actor HP to 0
   * @param {HTMLElement} wrapper - The actor wrapper element
   */
  static killActor(wrapper) {
    const actorId = wrapper.dataset.actorId;
    const tokenId = wrapper.dataset.tokenId;
    
    let actor;
    if (tokenId) {
      const token = canvas.tokens.get(tokenId);
      actor = token?.actor || game.actors.get(actorId);
    } else {
      actor = game.actors.get(actorId);
    }
    
    if (actor && actor.system?.attributes?.hp) {
      actor.update({ 'system.attributes.hp.value': 0 });
    }
  }

  /**
   * Toggle target state for a single actor by ID
   * @param {string} actorId - The actor ID
   * @param {string} tokenId - The token ID (optional)
   */
  static toggleActorTargetById(actorId, tokenId) {
    let token = tokenId ? canvas.tokens.get(tokenId) : null;
    if (!token && actorId) {
      token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
    }
    
    if (token) {
      const isTargeted = game.user.targets.has(token);
      token.setTarget(!isTargeted, { releaseOthers: false });
    }
  }

  /**
   * Open character sheet for a single actor by ID
   * @param {string} actorId - The actor ID
   * @param {string} tokenId - The token ID (optional)
   */
  static openActorSheetById(actorId, tokenId) {
    if (actorId) {
      let actor;
      if (tokenId) {
        const token = canvas.tokens.get(tokenId);
        actor = token?.actor || game.actors.get(actorId);
      } else {
        actor = game.actors.get(actorId);
      }
      actor?.sheet.render(true);
    }
  }

  /**
   * Heal actor to full HP by ID
   * @param {string} actorId - The actor ID
   * @param {string} tokenId - The token ID (optional)
   */
  static healActorById(actorId, tokenId) {
    let actor;
    if (tokenId) {
      const token = canvas.tokens.get(tokenId);
      actor = token?.actor || game.actors.get(actorId);
    } else {
      actor = game.actors.get(actorId);
    }
    
    if (actor && actor.system?.attributes?.hp) {
      const maxHP = actor.system.attributes.hp.max;
      actor.update({ 'system.attributes.hp.value': maxHP });
    }
  }

  /**
   * Set actor HP to 0 by ID
   * @param {string} actorId - The actor ID
   * @param {string} tokenId - The token ID (optional)
   */
  static killActorById(actorId, tokenId) {
    let actor;
    if (tokenId) {
      const token = canvas.tokens.get(tokenId);
      actor = token?.actor || game.actors.get(actorId);
    } else {
      actor = game.actors.get(actorId);
    }
    
    if (actor && actor.system?.attributes?.hp) {
      actor.update({ 'system.attributes.hp.value': 0 });
    }
  }

  /**
   * Show temporary token selection preview on hover
   * @param {HTMLElement} wrapper - The actor wrapper element
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static showTokenSelectionPreview(wrapper, menu) {
    const tokenId = wrapper.dataset.tokenId;
    const actorId = wrapper.dataset.actorId;
    const uniqueId = wrapper.dataset.id;
    
    let token = tokenId ? canvas.tokens.get(tokenId) : null;
    if (!token && actorId) {
      token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
    }
    
    if (token) {
      const wasAlreadySelected = menu.selectedActors.has(uniqueId);
      const wasAlreadyControlled = token._controlled;
      
      // Only control if not already controlled
      if (!wasAlreadyControlled) {
        // Temporarily ignore token control changes to prevent menu selection updates
        menu._ignoreTokenControl = true;
        
        token.control({ releaseOthers: false });
        
        // Restore token control listening after a brief delay
        setTimeout(() => {
          menu._ignoreTokenControl = false;
        }, 50);
        
        // Track this token as temporarily controlled by hover
        this._hoveredTokens.add(token);
        token._flashRollsWasSelected = wasAlreadySelected;
      }
    }
  }

  /**
   * Toggle the show options list on hover setting
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static async toggleOptionsListOnHover(menu) {    
    const SETTINGS = getSettings();
    const currentValue = SettingsUtil.get(SETTINGS.showOptionsListOnHover.tag);
    const accordion = menu.element.querySelector('.request-types-accordion');
    const accordionVisible = accordion?.classList.contains('hover-visible');
    
    const newValue = !currentValue;
    await SettingsUtil.set(SETTINGS.showOptionsListOnHover.tag, newValue);

    RollMenuEventManager.updateAccordionHoverBehaviorNoRender(menu, newValue);

    if(newValue===false || menu.selectedActors.size === 0){
      accordion?.classList.remove('hover-visible');
    }else if(newValue===true && menu.selectedActors.size > 0){
      accordion?.classList.add('hover-visible');
    }
  }

  /**
   * Update accordion hover behavior based on setting
   * @param {RollRequestsMenu} menu - The menu instance
   * @param {boolean} showOnHover - Whether to show accordion on hover
   */
  static updateAccordionHoverBehavior(menu, showOnHover) {
    // Re-render the menu to update event listeners based on new setting
    menu.render();
  }

  /**
   * Update accordion hover behavior without re-rendering
   * @param {RollRequestsMenu} menu - The menu instance
   * @param {boolean} showOnHover - Whether to show accordion on hover
   */
  static updateAccordionHoverBehaviorNoRender(menu, showOnHover) {
    const html = menu.element;
    const accordion = html.querySelector('.request-types-accordion');
    if (!accordion || !menu._accordionMouseEnter) return;

    html.removeEventListener('mouseenter', menu._accordionMouseEnter);
    html.removeEventListener('mouseleave', menu._accordionMouseLeave);
    // menu._accordionListenersAttached = false;
    accordion.classList.remove('hover-visible');

    if(showOnHover) {
      // Add the stored handlers
      html.addEventListener('mouseenter', menu._accordionMouseEnter);
      html.addEventListener('mouseleave', menu._accordionMouseLeave);
      // menu._accordionListenersAttached = true;
    }
  }

  /**
   * Hide temporary token selection preview on mouse leave
   * @param {HTMLElement} wrapper - The actor wrapper element
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static hideTokenSelectionPreview(wrapper, menu) {
    const tokenId = wrapper.dataset.tokenId;
    const actorId = wrapper.dataset.actorId;
    const uniqueId = wrapper.dataset.id;
    
    let token = tokenId ? canvas.tokens.get(tokenId) : null;
    if (!token && actorId) {
      token = canvas.tokens.placeables.find(t => t.actor?.id === actorId);
    }
    
    if (token && this._hoveredTokens.has(token)) {
      const isActuallySelected = menu.selectedActors.has(uniqueId);
      const wasSelected = token._flashRollsWasSelected;
      
      // Only release if the actor is not actually selected in the menu
      if (!isActuallySelected && !wasSelected) {
        // Temporarily ignore token control changes to prevent menu selection updates
        menu._ignoreTokenControl = true;
        
        token.release();
        
        // Restore token control listening after a brief delay
        setTimeout(() => {
          menu._ignoreTokenControl = false;
        }, 50);
      }
      
      // Clean up tracking
      this._hoveredTokens.delete(token);
      delete token._flashRollsWasSelected;
    }
  }

  /**
   * Create a new group or encounter actor from selected actors
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static async createGroupFromSelected(menu) {
    if (menu.selectedActors.size === 0) {
      ui.notifications.warn("No actors selected");
      return;
    }

    // Get actor data and group by base actor while tracking token associations
    const actorGroups = new Map(); // Map of base actor ID to { actor, count, tokenUuids }
    const tokenAssociations = {}; // Map of base actor ID to array of token UUIDs
    let playerOwnedCount = 0;
    let totalSelectedCount = 0;

    for (const uniqueId of menu.selectedActors) {
      const actor = getActorData(uniqueId);
      if (!actor) continue;

      totalSelectedCount++;

      // Get the base actor ID
      const baseActorId = actor.id;

      if (actorGroups.has(baseActorId)) {
        // Increment quantity and add token ID for existing actor
        const group = actorGroups.get(baseActorId);
        group.count++;
        if (actor.tokenId) {
          group.tokenIds.push(actor.tokenId);
        }
      } else {
        // Add new actor to the map
        actorGroups.set(baseActorId, {
          actor: actor,
          count: 1,
          tokenIds: actor.tokenId ? [actor.tokenId] : []
        });

        // Check ownership only once per unique actor
        const hasPlayerOwnership = Object.entries(actor.ownership || {}).some(([userId, level]) => {
          if (userId === 'default') return false;
          const user = game.users.get(userId);
          return user && !user.isGM && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
        });

        if (hasPlayerOwnership) {
          playerOwnedCount++;
        }
      }

      // Build token associations for flags (store only token IDs)
      if (!tokenAssociations[baseActorId]) {
        tokenAssociations[baseActorId] = [];
      }

      // If uniqueId is different from actor.id, it means this is a token selection
      if (uniqueId !== actor.id) {
        // uniqueId is the token ID
        tokenAssociations[baseActorId].push(uniqueId);
      }
    }

    if (actorGroups.size === 0) {
      ui.notifications.warn("No valid actors found");
      return;
    }

    // Determine actor type based on player ownership ratio
    const playerOwnedRatio = playerOwnedCount / actorGroups.size;
    const actorType = playerOwnedRatio >= 0.5 ? "group" : "encounter";

    // Generate a default name
    const defaultName = actorType === "group" ? "New Group" : "New Encounter";

    // Prepare members array based on actor type
    const members = [];
    if (actorType === "group") {
      // Group type: store direct actor references with quantities
      for (const [baseActorId, { actor, count }] of actorGroups) {
        // Get the base actor (not the token actor)
        const baseActor = game.actors.get(baseActorId);
        if (baseActor) {
          members.push({
            actor: baseActor, // Direct base actor reference for group type
            quantity: count
          });
        }
      }
    } else {
      // Encounter type: store base actor UUIDs with proper quantity structure
      for (const [baseActorId, { actor, count }] of actorGroups) {
        members.push({
          uuid: `Actor.${baseActorId}`, // Base actor UUID
          quantity: {
            value: count,
            formula: ""
          }
        });
      }
    }

    // Create the new actor with members and token associations flag
    try {
      const newActor = await Actor.create({
        name: defaultName,
        type: actorType,
        img: "icons/svg/mystery-man.svg", // Default icon
        system: {
          members: members
        },
        flags: {
          "flash-rolls-5e": {
            tokenAssociations: tokenAssociations
          }
        },
        ownership: {
          default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
          [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
        }
      });

      if (newActor) {
        // Open the newly created actor sheet
        newActor.sheet.render(true);

        // Show success notification
        const memberSummary = Array.from(actorGroups.values()).map(({ actor, count }) =>
          count > 1 ? `${actor.name} (x${count})` : actor.name
        ).join(", ");
        ui.notifications.info(`Created ${actorType} "${newActor.name}" (${totalSelectedCount} tokens, ${actorGroups.size} unique: ${memberSummary})`);

        LogUtil.log(`createGroupFromSelected - Created ${actorType}:`, {
          newActor,
          totalSelectedCount,
          uniqueActorCount: actorGroups.size,
          playerOwnedCount,
          playerOwnedRatio,
          tokenAssociations,
          members: Array.from(actorGroups.entries()).map(([id, { actor, count, tokenUuids }]) => ({
            id,
            name: actor.name,
            quantity: count,
            tokenUuids
          }))
        });
      }
    } catch (error) {
      LogUtil.error("Failed to create group/encounter actor:", error);
      ui.notifications.warn(`Failed to create ${actorType}: ${error.message}`);
    }
  }

  /**
   * Toggle movement restriction for selected actors
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static async toggleMovementForSelected(menu) {
    await TokenMovementManager.toggleMovementForSelected(menu);
  }

  /**
   * Open contested roll dialog with selected actors
   * @param {RollRequestsMenu} menu - The menu instance
   */
  static async openContestedRollDialog(menu) {
    const menuToUse = menu || this.activeMenu;

    if (!menuToUse || menuToUse.selectedActors.size === 0) {
      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));
      return;
    }

    const actors = [];
    for (const uniqueId of menuToUse.selectedActors) {
      const actor = getActorData(uniqueId);
      if (actor) {
        const tokenDoc = game.scenes.current?.tokens.get(uniqueId);
        const token = canvas.tokens?.get(uniqueId);
        const tokenId = (tokenDoc || token) ? uniqueId : null;

        actors.push({
          actor: actor,
          uniqueId: uniqueId,
          tokenId: tokenId
        });
      }
    }

    if (actors.length === 0) {
      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.noActorsSelected"));
      return;
    }

    if (actors.length < 2) {
      ui.notifications.warn(game.i18n.localize("FLASH_ROLLS.notifications.twoActorsRequired"));
      return;
    }

    const selectedActors = actors.slice(0, 2);

    const { ContestedRollDialog } = await import('../../../components/ui/dialogs/ContestedRollDialog.mjs');
    await ContestedRollDialog.show(selectedActors);
  }
}