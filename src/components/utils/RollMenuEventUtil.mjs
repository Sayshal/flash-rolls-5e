import { LogUtil } from '../LogUtil.mjs';
import { RollMenuDragUtil } from './RollMenuDragUtil.mjs';
import { delay } from '../helpers/Helpers.mjs';

/**
 * Utility class for handling Roll Requests Menu event listeners
 */
export class RollMenuEventUtil {
  
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
    this.attachCompactTooltipHandlers(menu, html);
    this.attachSearchHandlers(menu, html);
    this.attachAccordionHandlers(menu, html);
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
    LogUtil.log('RollMenuEventUtil.attachTabHandlers - found tabs:', tabs.length);
    tabs.forEach(tab => {
      LogUtil.log('RollMenuEventUtil.attachTabHandlers - attaching to tab:', tab.dataset.tab);
      tab.addEventListener('click', menu._onTabClick.bind(menu));
      tab.addEventListener('dblclick', menu._onTabDoubleClick.bind(menu));
    });
  }
  
  /**
   * Attach actor selection handlers
   */
  static attachActorHandlers(menu, html) {
    html.querySelectorAll('.actor.drag-wrapper').forEach(wrapper => {
      wrapper.addEventListener('click', menu._onActorClick.bind(menu));
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
          tooltipCopy.style.left = `${actorRect.right - menuRect.left}px`;
        } else {
          tooltipCopy.style.right = `${menuRect.right - actorRect.left}px`;
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
   * Attach outside click handler with delay to prevent immediate closure
   */
  static attachOutsideClickHandler(menu) {
    setTimeout(() => {
      document.addEventListener('click', menu._onClickOutside, true);
    }, 100);
  }
}