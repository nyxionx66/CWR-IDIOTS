import { Logger } from './logger.js';

export class InventoryUtils {
  /**
   * Finds items in the bot's inventory by name or ID
   * @param {Object} bot - Mineflayer bot instance
   * @param {string|number} itemNameOrId - Item name or ID to find
   * @param {Object} options - Additional options
   * @param {boolean} options.partialMatch - Whether to allow partial name matches
   * @param {boolean} options.ignoreCase - Whether to ignore case when matching names
   * @returns {Array} - Array of matching items
   */
  static findItems(bot, itemNameOrId, options = {}) {
    const { partialMatch = false, ignoreCase = true } = options;

    if (!bot.inventory) {
      Logger.warn('Cannot find items: Bot inventory not available');
      return [];
    }

    return bot.inventory.items().filter(item => {
      if (typeof itemNameOrId === 'number') {
        return item.type === itemNameOrId;
      } else {
        const itemName = ignoreCase ? item.name.toLowerCase() : item.name;
        const searchName = ignoreCase ? itemNameOrId.toLowerCase() : itemNameOrId;

        return partialMatch ? itemName.includes(searchName) : itemName === searchName;
      }
    });
  }

  /**
   * Finds the best tool for a specific block
   * @param {Object} bot - Mineflayer bot instance
   * @param {Object} block - Block to mine
   * @returns {Object|null} - Best tool or null if no suitable tool found
   */
  static findBestTool(bot, block) {
    if (!bot.inventory || !block) {
      return null;
    }

    // If mineflayer-tool plugin is available, use it
    if (bot.pathfinder && bot.pathfinder.bestHarvestTool) {
      return bot.pathfinder.bestHarvestTool(block);
    }

    // Fallback to manual tool selection
    const tools = bot.inventory.items().filter(item =>
        item.name.includes('pickaxe') ||
        item.name.includes('axe') ||
        item.name.includes('shovel') ||
        item.name.includes('hoe') ||
        item.name.includes('shears')
    );

    if (tools.length === 0) {
      return null;
    }

    // Tool tier values
    const toolTiers = {
      'netherite': 5,
      'diamond': 4,
      'iron': 3,
      'stone': 2,
      'golden': 1,
      'wooden': 0
    };

    // Find the best tool based on material
    return tools.reduce((best, current) => {
      // Get tool tier
      const currentTier = Object.entries(toolTiers)
          .find(([material]) => current.name.includes(material));

      const bestTier = best ? Object.entries(toolTiers)
          .find(([material]) => best.name.includes(material)) : null;

      if (!bestTier || (currentTier && toolTiers[currentTier[0]] > toolTiers[bestTier[0]])) {
        return current;
      }

      return best;
    }, null);
  }

  /**
   * Counts the total number of items by name
   * @param {Object} bot - Mineflayer bot instance
   * @param {string} itemName - Item name to count
   * @returns {number} - Total count of the item
   */
  static countItems(bot, itemName) {
    const items = this.findItems(bot, itemName);
    return items.reduce((total, item) => total + item.count, 0);
  }

  /**
   * Checks if the inventory has free slots
   * @param {Object} bot - Mineflayer bot instance
   * @param {number} requiredSlots - Number of required free slots
   * @returns {boolean} - True if enough free slots are available
   */
  static hasFreeSlots(bot, requiredSlots = 1) {
    if (!bot.inventory) {
      return false;
    }

    const freeSlots = 36 - bot.inventory.items().length;
    return freeSlots >= requiredSlots;
  }

  /**
   * Gets the number of free inventory slots
   * @param {Object} bot - Mineflayer bot instance
   * @returns {number} - Number of free slots
   */
  static getFreeSlotCount(bot) {
    if (!bot.inventory) {
      return 0;
    }

    return 36 - bot.inventory.items().length;
  }

  /**
   * Equips the best armor available
   * @param {Object} bot - Mineflayer bot instance
   * @returns {Promise} - Resolves when armor equipping is complete
   */
  static async equipBestArmor(bot) {
    if (!bot.inventory || !bot.armorManager) {
      Logger.warn('Cannot equip armor: Bot inventory or armor manager not available');
      return;
    }

    try {
      await bot.armorManager.equipAll();
      Logger.info('Equipped best armor');
    } catch (error) {
      Logger.error(`Failed to equip armor: ${error.message}`);
    }
  }

  /**
   * Equips an item in the specified slot
   * @param {Object} bot - Mineflayer bot instance
   * @param {Object|string|number} item - Item, item name, or item ID to equip
   * @param {string} destination - Destination slot ('hand', 'off-hand', 'head', 'torso', 'legs', 'feet')
   * @returns {Promise} - Resolves when item is equipped
   */
  static async equipItem(bot, item, destination = 'hand') {
    if (!bot.inventory) {
      Logger.warn('Cannot equip item: Bot inventory not available');
      return;
    }

    try {
      let itemToEquip = item;

      // If item is a string (name) or number (ID), find the actual item
      if (typeof item === 'string' || typeof item === 'number') {
        const items = this.findItems(bot, item);
        if (items.length === 0) {
          Logger.warn(`Cannot equip item: ${item} not found in inventory`);
          return;
        }
        itemToEquip = items[0];
      }

      await bot.equip(itemToEquip, destination);
      Logger.debug(`Equipped ${itemToEquip.name} in ${destination}`);
    } catch (error) {
      Logger.error(`Failed to equip item: ${error.message}`);
    }
  }

  /**
   * Drops an item from the inventory
   * @param {Object} bot - Mineflayer bot instance
   * @param {Object|string|number} item - Item, item name, or item ID to drop
   * @param {number} count - Number of items to drop (default: all)
   * @returns {Promise} - Resolves when item is dropped
   */
  static async dropItem(bot, item, count = null) {
    if (!bot.inventory) {
      Logger.warn('Cannot drop item: Bot inventory not available');
      return;
    }

    try {
      let itemToDrop = item;

      // If item is a string (name) or number (ID), find the actual item
      if (typeof item === 'string' || typeof item === 'number') {
        const items = this.findItems(bot, item);
        if (items.length === 0) {
          Logger.warn(`Cannot drop item: ${item} not found in inventory`);
          return;
        }
        itemToDrop = items[0];
      }

      // If count is not specified, drop the entire stack
      const dropCount = count === null ? itemToDrop.count : Math.min(count, itemToDrop.count);

      Logger.debug(`Attempting to drop ${dropCount} ${itemToDrop.name}...`);

      // Use toss method to drop items
      await bot.toss(itemToDrop.type, null, dropCount);

      // Add a small delay to ensure the drop completes
      await new Promise(resolve => setTimeout(resolve, 500));

      Logger.debug(`Dropped ${dropCount} ${itemToDrop.name}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to drop item: ${error.message}`);
      return false;
    }
  }
}