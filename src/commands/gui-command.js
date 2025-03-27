import { Logger } from '../utils/logger.js';

export default {
    name: 'gui',
    aliases: ['screen', 'window', 'inventory'],
    description: 'Interact with GUI screens and inventory slots',

    execute(bot, args, config) {
        if (!args.length || args[0] === 'help') {
            this.showHelp();
            return;
        }

        const subCommand = args[0].toLowerCase();

        switch (subCommand) {
            case 'click':
                this.clickSlot(bot, args.slice(1));
                break;
            case 'list':
                this.listSlots(bot);
                break;
            case 'close':
                this.closeWindow(bot);
                break;
            case 'info':
                this.windowInfo(bot);
                break;
            case 'watch':
                this.watchWindow(bot);
                break;
            case 'auto':
                this.autoClickReward(bot);
                break;
            case 'retry':
                this.retryFailedClick(bot, args.slice(1));
                break;
            default:
                Logger.warn(`Unknown subcommand: ${subCommand}`);
                this.showHelp();
        }
    },

    showHelp() {
        Logger.divider();
        Logger.info('GUI Interaction Commands:');
        Logger.info('gui click <slot> [right|left|middle] - Click a specific slot');
        Logger.info('gui list                            - List all slots in current window');
        Logger.info('gui close                           - Close the current window');
        Logger.info('gui info                            - Show info about current window');
        Logger.info('gui watch                           - Watch for window changes');
        Logger.info('gui auto                            - Auto-detect and click reward slots');
        Logger.info('gui retry <slot> [attempts]         - Retry clicking a slot multiple times');
        Logger.divider();
    },

    async clickSlot(bot, args) {
        if (args.length < 1) {
            Logger.warn('Usage: gui click <slot> [right|left|middle]');
            return;
        }

        const slotNum = parseInt(args[0]);
        if (isNaN(slotNum)) {
            Logger.warn('Slot number must be a valid number');
            return;
        }

        // Default to left click if not specified
        const mouseButton = this.getMouseButton(args[1]);

        const window = bot.currentWindow || bot.inventory.window;
        if (!window) {
            Logger.warn('No window is currently open');
            return;
        }

        // Check if slot exists
        if (slotNum < 0 || slotNum >= window.slots.length) {
            Logger.warn(`Invalid slot number. Must be between 0 and ${window.slots.length - 1}`);
            return;
        }

        try {
            // Click the slot with retry mechanism
            const success = await this.performClick(bot, slotNum, mouseButton, 3);
            if (success) {
                const slot = window.slots[slotNum];
                const itemName = slot ? this.getItemDisplayName(slot) : 'empty';
                Logger.success(`Clicked slot ${slotNum} (${itemName}) with ${this.getMouseButtonName(mouseButton)}`);

                // Auto-close window after successful click if it's a menu
                if (this.isMenuWindow(window)) {
                    await new Promise(resolve => setTimeout(resolve, 250));
                    this.closeWindow(bot);
                }
            } else {
                Logger.error(`Failed to click slot ${slotNum} after multiple attempts`);
            }
        } catch (error) {
            Logger.error(`Error clicking slot: ${error.message}`);
        }
    },

    async performClick(bot, slot, mouseButton, maxAttempts = 3) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                await new Promise((resolve, reject) => {
                    bot.clickWindow(slot, mouseButton, 0, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                return true;
            } catch (error) {
                if (attempt === maxAttempts) {
                    Logger.error(`Click failed after ${maxAttempts} attempts: ${error.message}`);
                    return false;
                }
                Logger.debug(`Click attempt ${attempt} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 250));
            }
        }
        return false;
    },

    async autoClickReward(bot) {
        const window = bot.currentWindow || bot.inventory.window;
        if (!window) {
            Logger.warn('No window is currently open');
            return;
        }

        // Log all slots for debugging
        this.listSlots(bot);

        // Find potential reward slots
        const rewardSlots = this.findRewardSlots(window);

        if (rewardSlots.length === 0) {
            Logger.warn('No reward slots detected in the current window');
            return;
        }

        Logger.info(`Found ${rewardSlots.length} potential reward slots`);

        // Try clicking each reward slot
        for (const slotInfo of rewardSlots) {
            Logger.info(`Attempting to click reward in slot ${slotInfo.slot} (${slotInfo.name})`);
            await this.performClick(bot, slotInfo.slot, 0, 3);
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        // Auto-close the window after clicking rewards
        await new Promise(resolve => setTimeout(resolve, 500));
        this.closeWindow(bot);
    },

    findRewardSlots(window) {
        const rewardSlots = [];
        const rewardKeywords = ['reward', 'prize', 'claim', 'collect', 'gift', 'daily', 'bonus'];

        window.slots.forEach((slot, index) => {
            if (!slot) return;

            const name = this.getItemDisplayName(slot).toLowerCase();
            const lore = this.getItemLore(slot);
            const nbt = this.getNBTData(slot);

            // Check if this slot looks like a reward
            const isReward =
                rewardKeywords.some(keyword => name.includes(keyword)) ||
                (lore && rewardKeywords.some(keyword => lore.toLowerCase().includes(keyword))) ||
                (nbt && nbt.includes('reward'));

            if (isReward) {
                rewardSlots.push({
                    slot: index,
                    name: this.getItemDisplayName(slot),
                    lore: lore
                });
            }
        });

        return rewardSlots;
    },

    async retryFailedClick(bot, args) {
        if (args.length < 1) {
            Logger.warn('Usage: gui retry <slot> [attempts]');
            return;
        }

        const slot = parseInt(args[0]);
        const attempts = args[1] ? parseInt(args[1]) : 5;

        if (isNaN(slot) || isNaN(attempts)) {
            Logger.warn('Invalid slot number or attempts');
            return;
        }

        Logger.info(`Retrying click on slot ${slot} (${attempts} attempts)`);
        const success = await this.performClick(bot, slot, 0, attempts);

        if (success) {
            Logger.success(`Successfully clicked slot ${slot} after retries`);
        } else {
            Logger.error(`Failed to click slot ${slot} after ${attempts} attempts`);
        }
    },

    listSlots(bot) {
        const window = bot.currentWindow || bot.inventory.window;
        if (!window) {
            Logger.warn('No window is currently open');
            return;
        }

        Logger.divider();
        Logger.info(`Window Slots (${window.slots.length} total):`);
        Logger.info(`Window Type: ${window.type}`);
        Logger.info(`Window Title: ${window.title}`);
        Logger.divider();

        // Group slots by rows for better readability
        const slotsPerRow = 9;
        const rows = Math.ceil(window.slots.length / slotsPerRow);

        for (let row = 0; row < rows; row++) {
            const rowStart = row * slotsPerRow;
            const rowEnd = Math.min(rowStart + slotsPerRow, window.slots.length);
            let rowInfo = `Row ${row + 1}: `;

            for (let i = rowStart; i < rowEnd; i++) {
                const slot = window.slots[i];
                if (slot) {
                    const displayName = this.getItemDisplayName(slot);
                    const nbt = this.getNBTData(slot);
                    const lore = this.getItemLore(slot);
                    let slotInfo = `[${i}: ${displayName}`;
                    if (nbt) slotInfo += ` (${nbt})`;
                    if (lore) slotInfo += ` [${lore}]`;
                    slotInfo += ']';
                    rowInfo += slotInfo + ' ';
                } else {
                    rowInfo += `[${i}: empty] `;
                }
            }

            Logger.info(rowInfo);
        }

        Logger.divider();
    },

    closeWindow(bot) {
        if (!bot.currentWindow) {
            Logger.warn('No window is currently open');
            return;
        }

        try {
            bot.closeWindow(bot.currentWindow);
            Logger.success('Closed window');
        } catch (error) {
            Logger.error(`Failed to close window: ${error.message}`);
        }
    },

    windowInfo(bot) {
        const window = bot.currentWindow || bot.inventory.window;
        if (!window) {
            Logger.warn('No window is currently open');
            return;
        }

        Logger.divider();
        Logger.info('Window Information:');
        Logger.info(`Type: ${window.type}`);
        Logger.info(`Title: ${window.title}`);
        Logger.info(`Slot Count: ${window.slots.length}`);
        Logger.info(`Is Inventory: ${window === bot.inventory.window}`);

        // Count filled slots and analyze contents
        const filledSlots = window.slots.filter(slot => slot !== null);
        Logger.info(`Filled Slots: ${filledSlots.length}`);

        // Analyze unique items
        const uniqueItems = new Map();
        filledSlots.forEach(slot => {
            const displayName = this.getItemDisplayName(slot);
            uniqueItems.set(displayName, (uniqueItems.get(displayName) || 0) + 1);
        });

        if (uniqueItems.size > 0) {
            Logger.info('\nUnique Items:');
            uniqueItems.forEach((count, name) => {
                Logger.info(`- ${name} (${count} slots)`);
            });
        }

        // Show menu-specific information
        if (window.title.includes('Menu') || window.title.includes('GUI')) {
            Logger.info('\nMenu Information:');
            Logger.info(`Menu Type: ${this.detectMenuType(window)}`);
            Logger.info(`Interactive Slots: ${this.countInteractiveSlots(window)}`);
        }

        Logger.divider();
    },

    watchWindow(bot) {
        // Remove any existing listeners
        if (bot._guiWatcher) {
            bot.removeListener('windowOpen', bot._guiWatcher.open);
            bot.removeListener('windowClose', bot._guiWatcher.close);
            bot.removeListener('setSlot', bot._guiWatcher.slot);
        }

        // Set up window watchers
        bot._guiWatcher = {
            open: (window) => {
                Logger.info(`Window opened: ${window.type} - ${window.title}`);
                this.listSlots(bot);
            },
            close: (window) => {
                Logger.info(`Window closed: ${window.type} - ${window.title}`);
            },
            slot: (oldItem, newItem) => {
                if (!bot.currentWindow) return;
                const slotNum = newItem.slot;
                const oldName = oldItem ? this.getItemDisplayName(oldItem) : 'empty';
                const newName = newItem ? this.getItemDisplayName(newItem) : 'empty';
                Logger.info(`Slot ${slotNum} changed: ${oldName} -> ${newName}`);
            }
        };

        // Register the watchers
        bot.on('windowOpen', bot._guiWatcher.open);
        bot.on('windowClose', bot._guiWatcher.close);
        bot.on('setSlot', bot._guiWatcher.slot);

        Logger.success('Now watching for window changes. Use "gui watch" again to stop.');
    },

    getMouseButton(button = 'left') {
        const buttons = {
            'left': 0,
            'right': 1,
            'middle': 2
        };
        return buttons[button.toLowerCase()] || 0;
    },

    getMouseButtonName(buttonNum) {
        const buttons = ['left', 'right', 'middle'];
        return buttons[buttonNum] || 'unknown';
    },

    getItemDisplayName(item) {
        if (!item) return 'empty';

        // Try to get the custom name first
        if (item.customName) {
            try {
                // Handle JSON format names
                const customName = typeof item.customName === 'object'
                    ? item.customName.text || item.customName.toString()
                    : item.customName.toString();
                return customName.replace(/§[0-9a-fk-or]/g, ''); // Remove color codes
            } catch (e) {
                // Fallback to basic name if JSON parsing fails
                return item.name;
            }
        }

        // Fallback to basic name
        return item.name;
    },

    getItemLore(item) {
        if (!item || !item.nbt || !item.nbt.display || !item.nbt.display.Lore) {
            return null;
        }

        try {
            const lore = item.nbt.display.Lore;
            if (Array.isArray(lore)) {
                return lore.map(line => {
                    if (typeof line === 'object' && line.text) {
                        return line.text.replace(/§[0-9a-fk-or]/g, '');
                    }
                    return line.toString().replace(/§[0-9a-fk-or]/g, '');
                }).join(' | ');
            }
            return lore.toString().replace(/§[0-9a-fk-or]/g, '');
        } catch (e) {
            return null;
        }
    },

    getNBTData(item) {
        if (!item || !item.nbt) return null;

        try {
            // Extract relevant NBT data
            const nbt = item.nbt;
            const tags = [];

            // Check for common menu item identifiers
            if (nbt.display?.Lore) {
                tags.push('menu');
            }
            if (nbt.SkullOwner) {
                tags.push('head');
            }
            if (nbt.CustomModelData) {
                tags.push(`model:${nbt.CustomModelData}`);
            }
            if (nbt.clickEvent || nbt.ClickEvent) {
                tags.push('clickable');
            }
            if (nbt.reward || nbt.Reward) {
                tags.push('reward');
            }

            return tags.length > 0 ? tags.join(', ') : null;
        } catch (e) {
            return null;
        }
    },

    isMenuWindow(window) {
        if (!window) return false;

        // Check window title
        const title = window.title.toLowerCase();
        if (title.includes('menu') || title.includes('gui') || title.includes('reward')) {
            return true;
        }

        // Check for menu-like characteristics
        const hasCustomItems = window.slots.some(slot =>
                slot && (
                    slot.customName ||
                    (slot.nbt && (slot.nbt.display?.Lore || slot.nbt.ClickEvent))
                )
        );

        return hasCustomItems;
    },

    detectMenuType(window) {
        // Try to detect common menu types
        const title = window.title.toLowerCase();
        const slots = window.slots;

        if (title.includes('deluxe') || title.includes('delux')) {
            return 'DeluxMenus';
        } else if (title.includes('chest') && slots.length === 54) {
            return 'Double Chest Menu';
        } else if (title.includes('chest') && slots.length === 27) {
            return 'Single Chest Menu';
        } else if (title.includes('shop')) {
            return 'Shop Menu';
        } else if (slots.some(slot => slot && slot.nbt?.SkullOwner)) {
            return 'Head-based Menu';
        } else if (title.includes('reward') || title.includes('daily')) {
            return 'Reward Menu';
        }

        return 'Unknown Menu Type';
    },

    countInteractiveSlots(window) {
        return window.slots.filter(slot =>
                slot && (
                    slot.nbt?.display?.Lore || // Has lore (likely clickable)
                    slot.nbt?.ClickEvent || // Has click event
                    slot.customName || // Has custom name
                    this.isRewardSlot(slot) // Is a reward slot
                )
        ).length;
    },

    isRewardSlot(slot) {
        if (!slot) return false;

        const name = this.getItemDisplayName(slot).toLowerCase();
        const lore = this.getItemLore(slot)?.toLowerCase() || '';
        const rewardKeywords = ['reward', 'prize', 'claim', 'collect', 'gift', 'daily', 'bonus'];

        return rewardKeywords.some(keyword =>
            name.includes(keyword) || lore.includes(keyword)
        );
    }
};