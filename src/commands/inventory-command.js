import { Logger } from '../utils/logger.js';
import { InventoryUtils } from '../utils/inventory-utils.js';

export default {
    name: 'inventory',
    aliases: ['inv', 'items'],
    description: 'Manage bot inventory items',

    execute(bot, args, config) {
        if (!args.length || args[0] === 'help') {
            this.showHelp();
            return;
        }

        const subCommand = args[0].toLowerCase();

        switch (subCommand) {
            case 'list':
            case 'what':
            case 'have':
                this.listInventory(bot);
                break;
            case 'drop':
                this.dropItem(bot, args.slice(1));
                break;
            case 'dropall':
                this.dropAllItems(bot);
                break;
            case 'count':
                this.countItem(bot, args.slice(1));
                break;
            case 'equip':
                this.equipItem(bot, args.slice(1));
                break;
            default:
                Logger.warn(`Unknown subcommand: ${subCommand}`);
                this.showHelp();
        }
    },

    showHelp() {
        Logger.divider();
        Logger.info('Inventory Management Commands:');
        Logger.info('inventory list           - List all items in inventory');
        Logger.info('inventory have           - Same as list (alias)');
        Logger.info('inventory what           - Same as list (alias)');
        Logger.info('inventory drop <item> [count] - Drop specific item');
        Logger.info('inventory dropall        - Drop all items in inventory');
        Logger.info('inventory count <item>   - Count how many of an item you have');
        Logger.info('inventory equip <item>   - Equip an item in hand');
        Logger.divider();
    },

    listInventory(bot) {
        if (!bot.inventory) {
            Logger.warn('Cannot access inventory');
            return;
        }

        const items = bot.inventory.items();

        if (items.length === 0) {
            Logger.info('Inventory is empty');
            return;
        }

        // Group items by name and count them
        const itemCounts = {};
        for (const item of items) {
            if (itemCounts[item.name]) {
                itemCounts[item.name] += item.count;
            } else {
                itemCounts[item.name] = item.count;
            }
        }

        // Sort items by count (descending)
        const sortedItems = Object.entries(itemCounts)
            .sort((a, b) => b[1] - a[1]);

        Logger.divider();
        Logger.info(`Inventory Contents (${items.length} slots used):`);

        for (const [name, count] of sortedItems) {
            Logger.info(`${name.padEnd(20)} x ${count}`);
        }

        Logger.divider();
    },

    async dropItem(bot, args) {
        if (args.length < 1) {
            Logger.warn('Usage: inventory drop <item> [count]');
            return;
        }

        let count = 0;
        let itemName;

        // Check if the first argument is a number (count)
        if (!isNaN(parseInt(args[0]))) {
            count = parseInt(args[0]);
            itemName = args.slice(1).join('_').toLowerCase();
        } else {
            // Check if the last argument is a number (count)
            const lastArg = args[args.length - 1];
            if (!isNaN(parseInt(lastArg))) {
                count = parseInt(lastArg);
                itemName = args.slice(0, args.length - 1).join('_').toLowerCase();
            } else {
                // No count specified, drop all of the item
                count = null;
                itemName = args.join('_').toLowerCase();
            }
        }

        // Find the item in inventory
        const items = InventoryUtils.findItems(bot, itemName, { partialMatch: true });

        if (items.length === 0) {
            Logger.warn(`No ${itemName} found in inventory`);
            return;
        }

        // Get the total count of the item
        const totalCount = items.reduce((sum, item) => sum + item.count, 0);

        // If count is null or greater than total, drop all
        if (count === null || count > totalCount) {
            count = totalCount;
        }

        Logger.info(`Dropping ${count} ${itemName}...`);

        try {
            // Drop the items
            let remaining = count;

            for (const item of items) {
                if (remaining <= 0) break;

                const toDrop = Math.min(remaining, item.count);
                await InventoryUtils.dropItem(bot, item, toDrop);
                remaining -= toDrop;
            }

            Logger.success(`Dropped ${count} ${itemName}`);
        } catch (error) {
            Logger.error(`Failed to drop items: ${error.message}`);
        }
    },

    async dropAllItems(bot) {
        if (!bot.inventory) {
            Logger.warn('Cannot access inventory');
            return;
        }

        const items = bot.inventory.items();

        if (items.length === 0) {
            Logger.info('Inventory is already empty');
            return;
        }

        Logger.info(`Dropping all items (${items.length} slots)...`);

        try {
            // Drop each item
            for (const item of items) {
                await InventoryUtils.dropItem(bot, item);
                // Small delay to prevent server lag
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            Logger.success('All items dropped');
        } catch (error) {
            Logger.error(`Failed to drop all items: ${error.message}`);
        }
    },

    countItem(bot, args) {
        if (args.length < 1) {
            Logger.warn('Usage: inventory count <item>');
            return;
        }

        const itemName = args.join('_').toLowerCase();

        // Count the items
        const count = InventoryUtils.countItems(bot, itemName);

        Logger.info(`You have ${count} ${itemName} in your inventory`);
    },

    async equipItem(bot, args) {
        if (args.length < 1) {
            Logger.warn('Usage: inventory equip <item>');
            return;
        }

        const itemName = args.join('_').toLowerCase();

        // Find the item
        const items = InventoryUtils.findItems(bot, itemName, { partialMatch: true });

        if (items.length === 0) {
            Logger.warn(`No ${itemName} found in inventory`);
            return;
        }

        try {
            // Equip the item
            await InventoryUtils.equipItem(bot, items[0]);
            Logger.success(`Equipped ${items[0].name}`);
        } catch (error) {
            Logger.error(`Failed to equip item: ${error.message}`);
        }
    }
};