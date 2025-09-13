import { LogUtil } from '../LogUtil.mjs';
import { RollMenuDragUtil } from './RollMenuDragUtil.mjs';
import { delay, getActorData, updateCanvasTokenSelection } from '../helpers/Helpers.mjs';

/**
 * Utility class for handling Roll Requests Menu event listeners
 */
export class RollMenuEventUtil {
  
  /**
   * Set to track tokens that were temporarily selected on hover
   * @type {Set<Token>}
   */
  static _hoveredTokens = new Set();
  
  /**
   * Attach all event listeners to the menu
   * @param {RollRequestsMenu} menu - The menu instance
   * @param {HTMLElement} html - The menu HTML element
   */
  static attachListeners(menu, html) {
    LogUtil.log('RollMenuEventUtil.attachListeners');
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
    html.querySelector('#flash5e-actors-lock')?.addEventListener('click', menu._onToggleLock.bind(menu));
    html.querySelector('.options-toggle-btn')?.addEventListener('click', menu._onToggleOptions.bind(menu));
  }
  
  /**
   * Attach drag handle handlers
   */
  static attachDragHandlers(menu, html) {
    const dragHandle = html.querySelector(RollMenuDragUtil.DRAG_HANDLE_SELECTOR);
    if (dragHandle && !dragHandle.hasAttribute('data-drag-initialized')) {
      dragHandle.setAttribute('data-drag-initialized', 'true');
      dragHandle.addEventListener('mousedown', (e) => {
        RollMenuDragUtil.handleDragStart(e, menu);
      });
    }
  }
  
  /**
   * Attach tab click handlers
   */
  static attachTabHandlers(menu, html) {
    const tabs = html.querySelectorAll('.actor-tab');
    LogUtil.log('RollMenuEventUtil.attachTabHandlers - found tabs:', [tabs.length]);
    tabs.forEach(tab => {
      LogUtil.log('RollMenuEventUtil.attachTabHandlers - attaching to tab:', [tab.dataset.tab]);
      tab.addEventListener('click', menu._onTabClick.bind(menu));
      tab.addEventListener('dblclick', menu._onTabDoubleClick.bind(menu));
    });
  }
  
  /**
   * Attach action icon handlers for bulk operations
   */
  static attachActionIconHandlers(menu, html) {
    // Toggle targets for selected actors
    html.querySelector('#flash5e-targets')?.addEventListener('click', () => {
      this.toggleTargetsForSelected(menu);
    });
    
    // Heal all selected actors
    html.querySelector('#flash5e-heal-selected')?.addEventListener('click', () => {
      this.healSelectedActors(menu);
    });
    
    // Kill all selected actors
    html.querySelector('#flash5e-kill-selected')?.addEventListener('click', () => {
      this.killSelectedActors(menu);
    });
    
    // Open sheets for all selected actors
    html.querySelector('#flash5e-sheets')?.addEventListener('click', () => {
      this.openSheetsForSelected(menu);
    });
    
    // Remove all status effects from selected actors
    html.querySelector('#flash5e-remove-effects')?.addEventListener('click', () => {
      this.removeAllStatusEffectsFromSelected(menu);
    });
  }

  /**
   * Attach actor selection handlers
   */
  static attachActorHandlers(menu, html) {
    html.querySelectorAll('.actor.drag-wrapper').forEach(wrapper => {
      wrapper.addEventListener('click', menu._onActorClick.bind(menu));
      
      // Add click handler for character sheet icon
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
   * Attach tooltip handlers for compact mode
   */
  static attachCompactTooltipHandlers(menu, html) {
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
        
        if (isLeftEdge) {
          tooltipCopy.style.left = `${actorRect.right - menuRect.left - 8}px`;
        } else {
          tooltipCopy.style.right = `${menuRect.right - actorRect.left - 8}px`;
        }
        tooltipCopy.style.top = `${actorRect.top - menuRect.top}px`;
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
      });
    }
  }
  
  /**
   * Attach accordion and request type handlers
   */
  static attachAccordionHandlers(menu, html) {
    const accordion = html.querySelector('.request-types-accordion');
    if (accordion) {
      html.addEventListener('mouseenter', () => {
        if (menu.selectedActors.size > 0) {
          accordion.classList.add('hover-visible');
        }
      });
      
      html.addEventListener('mouseleave', () => {
        accordion.classList.remove('hover-visible');
      });
    }
    
    const requestTypesContainer = html.querySelector('.request-types');
    LogUtil.log('RollMenuEventUtil.attachAccordionHandlers', [requestTypesContainer]);
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
      LogUtil.log('RollMenuEventUtil.attachSubmenuHandlers - found tabs:', [submenuTabs.length]);
      submenuTabs.forEach(tab => {
        tab.addEventListener('click', menu._onSubmenuTabClick.bind(menu));
      });
    } catch (error) {
      LogUtil.error('RollMenuEventUtil.attachSubmenuHandlers error:', [error]);
    }
  }

  /**
   * Attach status effect handlers
   */
  static attachStatusEffectHandlers(menu, html) {
    try {
      const statusEffects = html.querySelectorAll('.status-effects .status-effect');
      LogUtil.log('RollMenuEventUtil.attachStatusEffectHandlers - found effects:', [statusEffects.length]);
      statusEffects.forEach(statusElement => {
        // Check if listener already attached to prevent duplicates
        if (!statusElement.dataset.listenerAttached) {
          statusElement.dataset.listenerAttached = 'true';
          statusElement.addEventListener('click', menu._onStatusEffectClick.bind(menu));
        }
      });
    } catch (error) {
      LogUtil.error('RollMenuEventUtil.attachStatusEffectHandlers error:', [error]);
    }
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
    menu.selectedActors.forEach(uniqueId => {
      const actor = getActorData(uniqueId);
      if (!actor) return;
      
      const actorId = actor.id;
      const tokenId = game.actors.get(uniqueId) ? null : uniqueId;
      
      this.openActorSheetById(actorId, tokenId);
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
      const statusEffects = actor.effects.filter(effect => 
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
}