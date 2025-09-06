import { LogUtil } from '../LogUtil.mjs';
import { MODULE } from '../../constants/General.mjs';

/**
 * Utility class for handling search and accordion functionality in the Roll Requests Menu
 */
export class RollMenuSearchUtil {
  
  /**
   * Handle search input
   * @param {Event} event - Search input event
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static handleSearchInput(event, menu) {
    const searchTerm = event.target.value.toLowerCase().trim();
    const requestTypesContainer = menu.element.querySelector('.request-types');
    
    if (!requestTypesContainer) return;
    const requestItems = requestTypesContainer.querySelectorAll('.request-type-item');
    
    requestItems.forEach(requestItem => {
      const requestName = requestItem.querySelector('.request-type-name')?.textContent.toLowerCase() || '';
      const subItems = requestItem.querySelectorAll('.sub-item');
      let hasVisibleSubItems = false;
      
      if (subItems.length > 0) {
        subItems.forEach(subItem => {
          const subItemName = subItem.querySelector('.sub-item-name')?.textContent.toLowerCase() || '';
          const isVisible = subItemName.includes(searchTerm);
          subItem.classList.toggle('hidden', !isVisible);
          if (isVisible) hasVisibleSubItems = true;
        });
        
        const categoryMatches = requestName.includes(searchTerm);
        const shouldShowCategory = searchTerm === '' || categoryMatches || hasVisibleSubItems;
        requestItem.classList.toggle('hidden', !shouldShowCategory);
        
        if (searchTerm && hasVisibleSubItems) {
          const nestedList = requestItem.querySelector('.roll-types-nested');
          const accordionToggle = requestItem.querySelector('.accordion-toggle');
          if (nestedList && accordionToggle) {
            nestedList.style.display = 'block';
            accordionToggle.classList.add('expanded');
          }
        }
      } else {
        const isVisible = searchTerm === '' || requestName.includes(searchTerm);
        requestItem.classList.toggle('hidden', !isVisible);
      }
    });
  }

  /**
   * Handle accordion toggle
   * @param {Event} event - Toggle event
   * @param {RollRequestsMenu} menu - Menu instance
   */
  static async handleAccordionToggle(event, menu) {
    event.stopPropagation();
    
    const requestHeader = event.target.closest('.request-type-header');
    const requestItem = requestHeader.closest('.request-type-item');
    const requestId = requestItem.dataset.id;
    const accordionToggle = requestItem.querySelector('.accordion-toggle');
    const nestedList = requestItem.querySelector('.roll-types-nested');
    
    if (!nestedList) return;
    
    const isExpanded = accordionToggle.classList.contains('expanded');
    accordionToggle.classList.toggle('expanded', !isExpanded);
    nestedList.style.display = isExpanded ? 'none' : 'block';
    menu.accordionStates[requestId] = !isExpanded;
    await game.user.setFlag(MODULE.ID, 'menuAccordionStates', menu.accordionStates);
  }
}