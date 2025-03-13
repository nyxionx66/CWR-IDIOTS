import { Logger } from '../utils/logger.js';
import { VectorUtils } from '../utils/vector-utils.js';
import { InventoryUtils } from '../utils/inventory-utils.js';
import pkg from 'mineflayer-pathfinder';
import Vec3 from 'vec3';

const { pathfinder, Movements, goals } = pkg;

export default {
    name: 'blockquest',
    aliases: ['bq', 'blockq'],
    description: 'Place and break a specific block multiple times',

    execute(bot, args, config) {
        // Check for logging toggle commands
        if (args[0] === 'logs' || args[0] === 'logging') {
            if (args[1] === 'on' || args[1] === 'enable') {
                this.toggleLogging(bot, true);
                return;
            } else if (args[1] === 'off' || args[1] === 'disable') {
                this.toggleLogging(bot, false);
                return;
            }
        }

        // Check for status command
        if (args[0] === 'status') {
            this.showStatus(bot);
            return;
        }

        // Check for stop command
        if (args[0] === 'stop' || args[0] === 'cancel') {
            this.stopBlockQuest(bot);
            return;
        }

        if (args.length < 2) {
            Logger.warn('Usage: blockquest <block_name> <times> [radius]');
            Logger.warn('Usage: blockquest logs <on|off> - Toggle detailed logging');
            Logger.warn('Usage: blockquest status - Show current status');
            Logger.warn('Usage: blockquest stop - Stop current task');
            Logger.warn('Example: blockquest dirt 10 5');
            return;
        }

        const blockName = args[0].toLowerCase();
        const times = parseInt(args[1]);
        const radius = args[2] ? parseInt(args[2]) : 3;

        if (isNaN(times) || times <= 0) {
            Logger.warn('Times must be a positive number');
            return;
        }

        if (isNaN(radius) || radius <= 0 || radius > 10) {
            Logger.warn('Radius must be between 1 and 10');
            return;
        }

        // Check if already running
        if (bot.blockQuestTask) {
            this.stopBlockQuest(bot);
            Logger.info('Stopped previous BlockQuest task');
        }

        this.startBlockQuest(bot, blockName, times, radius);
    },

    toggleLogging(bot, enabled = null) {
        // Initialize the logging setting if it doesn't exist
        if (!bot.blockQuestLogging && bot.blockQuestLogging !== false) {
            bot.blockQuestLogging = true;
        }

        // Toggle or set the logging state
        if (enabled === null) {
            bot.blockQuestLogging = !bot.blockQuestLogging;
        } else {
            bot.blockQuestLogging = enabled;
        }

        Logger.info(`BlockQuest detailed logging is now ${bot.blockQuestLogging ? 'enabled' : 'disabled'}`);

        // Save the setting to the bot's config if possible
        if (bot.huminiBot && bot.huminiBot.configManager) {
            const config = bot.huminiBot.configManager.getConfig();

            if (!config.blockQuest) {
                config.blockQuest = {};
            }

            config.blockQuest.detailedLogging = bot.blockQuestLogging;
            bot.huminiBot.configManager.updateConfig(config);
        }
    },

    showStatus(bot) {
        if (!bot.blockQuestTask) {
            Logger.info('No BlockQuest task is currently running');
            return;
        }

        const task = bot.blockQuestTask;
        const elapsedTime = ((Date.now() - task.startTime) / 1000).toFixed(1);
        const stats = task.stats;
        const progress = `${task.currentCount}/${task.targetTimes}`;
        const percentage = ((task.currentCount / task.targetTimes) * 100).toFixed(1);
        const blocksPerMinute = ((stats.placed / (elapsedTime / 60)) || 0).toFixed(1);

        Logger.divider();
        Logger.info(`BlockQuest Status:`);
        Logger.info(`Block: ${task.blockName}`);
        Logger.info(`Progress: ${progress} (${percentage}%)`);
        Logger.info(`Time elapsed: ${elapsedTime} seconds`);
        Logger.info(`Blocks placed: ${stats.placed}`);
        Logger.info(`Blocks broken: ${stats.broken}`);
        Logger.info(`Failed attempts: ${stats.failed}`);
        Logger.info(`Rate: ${blocksPerMinute} blocks/minute`);
        Logger.info(`Logging: ${bot.blockQuestLogging ? 'Enabled' : 'Disabled'}`);

        if (task.clearLaggPaused) {
            Logger.info(`Status: Paused (waiting for ClearLagg)`);
        } else {
            Logger.info(`Status: Running`);
        }

        Logger.divider();
    },

    async startBlockQuest(bot, blockName, times, radius) {
        // Initialize task state
        bot.blockQuestTask = {
            blockName: blockName,
            targetTimes: times,
            currentCount: 0,
            radius: radius,
            running: true,
            placedBlock: null,
            startTime: Date.now(),
            lastProgressUpdate: Date.now(),
            progressUpdateInterval: 10, // Update progress every 10 blocks
            stats: {
                placed: 0,
                broken: 0,
                failed: 0
            },
            // Add possible variations of the block name for better matching
            possibleNames: this.generatePossibleBlockNames(blockName),
            // ClearLagg detection
            clearLaggPaused: false,
            clearLaggTimeout: null
        };

        // Initialize logging setting from config if available
        if (bot.huminiBot && bot.huminiBot.configManager) {
            const config = bot.huminiBot.configManager.getConfig();
            if (config.blockQuest && config.blockQuest.detailedLogging !== undefined) {
                bot.blockQuestLogging = config.blockQuest.detailedLogging;
            } else if (bot.blockQuestLogging === undefined) {
                bot.blockQuestLogging = true; // Default to true if not set
            }
        } else if (bot.blockQuestLogging === undefined) {
            bot.blockQuestLogging = true; // Default to true if not set
        }

        Logger.success(`Starting BlockQuest for ${blockName} (${times} times, radius: ${radius})`);
        if (bot.blockQuestLogging) {
            Logger.debug(`Looking for block variations: ${bot.blockQuestTask.possibleNames.join(', ')}`);
        }

        // Register message handler for ClearLagg detection
        this.registerClearLaggDetection(bot);

        try {
            // Start the main loop
            await this.blockQuestLoop(bot);
        } catch (error) {
            Logger.error(`BlockQuest error: ${error.message}`);
            this.stopBlockQuest(bot);
        }
    },

    stopBlockQuest(bot) {
        if (bot.blockQuestTask) {
            bot.blockQuestTask.running = false;

            // Clear any pending ClearLagg timeouts
            if (bot.blockQuestTask.clearLaggTimeout) {
                clearTimeout(bot.blockQuestTask.clearLaggTimeout);
            }

            // Unregister message handler
            this.unregisterClearLaggDetection(bot);

            // Display stats if we had any activity
            if (bot.blockQuestTask.currentCount > 0) {
                const stats = bot.blockQuestTask.stats;
                const duration = ((Date.now() - bot.blockQuestTask.startTime) / 1000).toFixed(1);
                const blocksPerMinute = ((stats.placed / (duration / 60)) || 0).toFixed(1);

                Logger.divider();
                Logger.info(`BlockQuest Results:`);
                Logger.info(`Block: ${bot.blockQuestTask.blockName}`);
                Logger.info(`Completed: ${bot.blockQuestTask.currentCount}/${bot.blockQuestTask.targetTimes}`);
                Logger.info(`Duration: ${duration} seconds`);
                Logger.info(`Blocks placed: ${stats.placed}`);
                Logger.info(`Blocks broken: ${stats.broken}`);
                Logger.info(`Failed attempts: ${stats.failed}`);
                Logger.info(`Rate: ${blocksPerMinute} blocks/minute`);
                Logger.divider();
            }

            delete bot.blockQuestTask;
            Logger.info('BlockQuest task stopped');
        } else {
            Logger.info('No BlockQuest task was running');
        }
    },

    registerClearLaggDetection(bot) {
        // Save the original message handler if it exists
        bot._originalBlockQuestMessageHandler = bot._events.message;

        // Set up the message handler to detect ClearLagg warnings
        bot.on('message', (message) => this.handleServerMessage(bot, message));
    },

    unregisterClearLaggDetection(bot) {
        // Remove our handler
        bot.removeListener('message', (message) => this.handleServerMessage(bot, message));

        // Restore original handler if it existed
        if (bot._originalBlockQuestMessageHandler) {
            bot.on('message', bot._originalBlockQuestMessageHandler);
            delete bot._originalBlockQuestMessageHandler;
        }
    },

    handleServerMessage(bot, message) {
        if (!bot.blockQuestTask) return;

        const messageStr = message.toString().toLowerCase();

        // Check for ClearLagg warning messages
        // Common formats:
        // "Ground items will be removed in 10 seconds!"
        // "[ClearLagg] Clearing all entities in 10 seconds"
        // "Server cleanup in 10 seconds"
        // "Cleaner » Entities will be removed in 20 seconds!"
        if (
            (messageStr.includes('ground items') && messageStr.includes('removed')) ||
            (messageStr.includes('clearlagg') && messageStr.includes('clearing')) ||
            (messageStr.includes('server cleanup')) ||
            (messageStr.includes('clearing entities')) ||
            (messageStr.includes('clear lag')) ||
            (messageStr.includes('cleaner') && messageStr.includes('entities') && messageStr.includes('removed')) ||
            (messageStr.includes('cleaner') && messageStr.includes('entities') && messageStr.includes('will be removed'))
        ) {
            // Try to extract the time from the message
            const timeMatch = messageStr.match(/(\d+) seconds/);
            const seconds = timeMatch ? parseInt(timeMatch[1]) : 10; // Default to 10 seconds if not specified

            Logger.warn(`ClearLagg detected! Server will clear items in ${seconds} seconds`);

            // Pause the BlockQuest task
            this.pauseForClearLagg(bot, seconds);
        }

        // Check for completion messages
        if (
            messageStr.includes('ground items cleared') ||
            messageStr.includes('entities removed') ||
            messageStr.includes('cleanup complete') ||
            messageStr.includes('cleared entities') ||
            (messageStr.includes('cleaner') && messageStr.includes('entities have been removed'))
        ) {
            Logger.info('ClearLagg cleanup completed, resuming BlockQuest');

            // Resume the BlockQuest task
            this.resumeAfterClearLagg(bot);
        }
    },

    pauseForClearLagg(bot, seconds) {
        const task = bot.blockQuestTask;
        if (!task) return;

        // Set the pause flag
        task.clearLaggPaused = true;
        Logger.warn(`BlockQuest paused for ${seconds} seconds due to upcoming server cleanup`);

        // Set a timeout to resume after the cleanup (add 2 seconds buffer)
        if (task.clearLaggTimeout) {
            clearTimeout(task.clearLaggTimeout);
        }

        task.clearLaggTimeout = setTimeout(() => {
            this.resumeAfterClearLagg(bot);
        }, (seconds + 2) * 1000);
    },

    resumeAfterClearLagg(bot) {
        const task = bot.blockQuestTask;
        if (!task) return;

        // Clear the pause flag
        task.clearLaggPaused = false;

        if (task.clearLaggTimeout) {
            clearTimeout(task.clearLaggTimeout);
            task.clearLaggTimeout = null;
        }

        Logger.success('BlockQuest resumed after server cleanup');
    },

    async blockQuestLoop(bot) {
        const task = bot.blockQuestTask;

        // Main task loop
        while (task && task.running && task.currentCount < task.targetTimes) {
            try {
                // Check if we're paused due to ClearLagg
                if (task.clearLaggPaused) {
                    if (bot.blockQuestLogging) {
                        Logger.debug('BlockQuest is paused due to ClearLagg, waiting...');
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }

                // Check if we have the block in inventory using all possible name variations
                let blocks = [];
                for (const name of task.possibleNames) {
                    const foundBlocks = InventoryUtils.findItems(bot, name, { partialMatch: true });
                    if (foundBlocks.length > 0) {
                        blocks = foundBlocks;
                        if (bot.blockQuestLogging) {
                            Logger.debug(`Found ${blocks.length} blocks matching '${name}'`);
                        }
                        break;
                    }
                }

                // Also try to find by direct inventory scan (for cases where name matching fails)
                if (blocks.length === 0) {
                    blocks = this.scanInventoryForBlocks(bot);
                    if (blocks.length > 0 && bot.blockQuestLogging) {
                        Logger.debug(`Found ${blocks.length} blocks through direct inventory scan`);
                    }
                }

                if (blocks.length === 0) {
                    Logger.warn(`No ${task.blockName} found in inventory. Please add some to your inventory.`);

                    // Wait a bit before checking again
                    await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 1000ms
                    continue;
                }

                // Find a suitable place to put the block
                const placePosition = await this.findPlacePosition(bot, task.radius);

                if (!placePosition) {
                    Logger.warn('Could not find a suitable place to put the block');
                    task.stats.failed++;

                    // Try to move to a different location
                    await this.moveToNewLocation(bot, 3);

                    // Wait a bit before retrying
                    await new Promise(resolve => setTimeout(resolve, 250)); // Reduced from 500ms
                    continue;
                }

                // Add a small delay before placing (100-200ms) - Reduced from 300-600ms
                await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));

                // Place the block - OPTIMIZED FOR SPEED
                const success = await this.placeBlockFast(bot, blocks[0], placePosition);

                if (!success) {
                    task.stats.failed++;

                    // If we've failed multiple times, try moving to a new location
                    if (task.stats.failed % 3 === 0) {
                        await this.moveToNewLocation(bot, 5);
                    }

                    // Wait a bit before retrying
                    await new Promise(resolve => setTimeout(resolve, 250)); // Reduced from 500ms
                    continue;
                }

                task.stats.placed++;
                task.placedBlock = placePosition;

                // Add a small delay before breaking (150-300ms) - Reduced from 400-800ms
                await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 150));

                // Break the block - OPTIMIZED FOR SPEED
                const brokenSuccess = await this.breakBlockFast(bot, placePosition);

                if (brokenSuccess) {
                    task.stats.broken++;

                    // Increment counter
                    task.currentCount++;

                    // Only log progress at intervals or if logging is enabled
                    const shouldLogProgress =
                        task.currentCount % task.progressUpdateInterval === 0 ||
                        task.currentCount === task.targetTimes ||
                        (Date.now() - task.lastProgressUpdate) > 10000; // At least every 10 seconds

                    if (shouldLogProgress) {
                        const percentage = ((task.currentCount / task.targetTimes) * 100).toFixed(1);
                        Logger.info(`BlockQuest progress: ${task.currentCount}/${task.targetTimes} (${percentage}%)`);
                        task.lastProgressUpdate = Date.now();
                    } else if (bot.blockQuestLogging) {
                        Logger.debug(`BlockQuest progress: ${task.currentCount}/${task.targetTimes}`);
                    }

                    // Add a shorter delay between cycles (200-400ms) - Reduced from 500-1000ms
                    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 200));
                } else {
                    task.stats.failed++;
                    Logger.warn('Failed to break the block, retrying...');

                    // If we've failed to break multiple times, try moving to a new location
                    if (task.stats.failed % 3 === 0) {
                        await this.moveToNewLocation(bot, 5);
                    }

                    // Wait a bit before retrying
                    await new Promise(resolve => setTimeout(resolve, 400)); // Reduced from 800ms
                }
            } catch (error) {
                Logger.error(`Error in BlockQuest cycle: ${error.message}`);
                task.stats.failed++;
                // Wait a bit before retrying
                await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 1000ms
            }
        }

        // Task completed or stopped
        if (task && task.running && task.currentCount >= task.targetTimes) {
            Logger.success(`BlockQuest completed! Placed and broke ${task.blockName} ${task.targetTimes} times.`);
            this.stopBlockQuest(bot);
        }
    },

    async moveToPosition(bot, position) {
        try {
            if (!bot.pathfinder) {
                return false;
            }

            // Create a goal to move to the position
            const goal = new goals.GoalNear(position.x, position.y, position.z, 1);

            // Set the goal
            bot.pathfinder.setGoal(goal);

            // Wait for the bot to reach the goal or timeout
            await new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (!bot.pathfinder.isMoving()) {
                        clearInterval(checkInterval);
                        clearTimeout(timeoutId);
                        resolve();
                    }
                }, 200); // Reduced from 300ms

                const timeoutId = setTimeout(() => {
                    clearInterval(checkInterval);
                    bot.pathfinder.stop();
                    resolve();
                }, 2000); // Reduced from 3000ms (3 second timeout)
            });

            return true;
        } catch (error) {
            if (bot.blockQuestLogging) {
                Logger.debug(`Error moving to position: ${error.message}`);
            }
            return false;
        }
    },

    async findPlacePosition(bot, radius) {
        // Get the bot's position
        const botPos = bot.entity.position.clone();

        // First try positions very close to the bot for faster placement
        for (let r = 1; r <= 2; r++) {
            // Try positions at the current radius
            for (let x = -r; x <= r; x++) {
                for (let z = -r; z <= r; z++) {
                    // Only check positions at the current radius (perimeter)
                    if (Math.abs(x) !== r && Math.abs(z) !== r) continue;

                    // Check positions at different heights
                    for (let y = -1; y <= 1; y++) {
                        const pos = botPos.clone().add(new Vec3(x, y, z));

                        // Check if this position is suitable for placing a block
                        if (await this.isSuitableForPlacement(bot, pos)) {
                            return pos;
                        }
                    }
                }
            }
        }

        // If we couldn't find a close position, try a wider search
        for (let r = 3; r <= radius; r++) {
            // Try positions at the current radius
            for (let x = -r; x <= r; x++) {
                for (let z = -r; z <= r; z++) {
                    // Only check positions at the current radius (perimeter)
                    if (Math.abs(x) !== r && Math.abs(z) !== r) continue;

                    // Check positions at different heights
                    for (let y = -1; y <= 1; y++) {
                        const pos = botPos.clone().add(new Vec3(x, y, z));

                        // Check if this position is suitable for placing a block
                        if (await this.isSuitableForPlacement(bot, pos)) {
                            return pos;
                        }
                    }
                }
            }
        }

        // If we still couldn't find a position, try a more thorough search
        for (let x = -radius; x <= radius; x++) {
            for (let z = -radius; z <= radius; z++) {
                for (let y = -1; y <= 1; y++) {
                    const pos = botPos.clone().add(new Vec3(x, y, z));

                    // Check if this position is suitable for placing a block
                    if (await this.isSuitableForPlacement(bot, pos)) {
                        return pos;
                    }
                }
            }
        }

        return null;
    },

    async isSuitableForPlacement(bot, position) {
        try {
            // Check if the position is air or water (we now allow water for placement)
            const block = bot.blockAt(position);
            if (!block) {
                return false;
            }

            // Allow air or water for placement
            if (block.name !== 'air' && block.name !== 'water') {
                return false;
            }

            // Check if there's a solid block below (including underwater blocks)
            const blockBelow = bot.blockAt(position.clone().add(new Vec3(0, -1, 0)));
            if (!blockBelow || blockBelow.name === 'air' || blockBelow.name === 'lava') {
                return false;
            }

            // Check if the bot can reach this position
            const canSee = bot.canSeeBlock(blockBelow);
            if (!canSee) {
                return false;
            }

            // Check if the position is within reach distance (increased to 4 for faster placement)
            const distance = VectorUtils.euclideanDistance(bot.entity.position, position);
            if (distance > 4) {
                return false;
            }

            return true;
        } catch (error) {
            if (bot.blockQuestLogging) {
                Logger.debug(`Error checking placement suitability: ${error.message}`);
            }
            return false;
        }
    },

    async placeBlockFast(bot, blockItem, position) {
        try {
            // Find the block we're placing against (the one below)
            const referenceBlock = bot.blockAt(position.clone().add(new Vec3(0, -1, 0)));

            if (!referenceBlock) {
                Logger.warn('No reference block found for placement');
                return false;
            }

            // Equip the block
            await bot.equip(blockItem, 'hand');

            // Reduced delay after equipping (50-100ms) - Was 100-200ms
            await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));

            // Look at the placement position - with a small delay
            await bot.lookAt(position, false);

            // Reduced delay after looking (75-125ms) - Was 150-250ms
            await new Promise(resolve => setTimeout(resolve, 75 + Math.random() * 50));

            // Place the block
            await bot.placeBlock(referenceBlock, new Vec3(0, 1, 0));

            if (bot.blockQuestLogging) {
                Logger.debug(`Placed ${blockItem.name} at ${position}`);
            }
            return true;
        } catch (error) {
            Logger.warn(`Failed to place block: ${error.message}`);
            return false;
        }
    },

    async breakBlockFast(bot, position) {
        try {
            // Get the block at the position
            const block = bot.blockAt(position);

            if (!block || block.name === 'air') {
                Logger.warn('No block found to break');
                return false;
            }

            // Look at the block - with a small delay
            await bot.lookAt(position.clone().add(new Vec3(0.5, 0.5, 0.5)), false);

            // Reduced delay after looking (75-125ms) - Was 150-250ms
            await new Promise(resolve => setTimeout(resolve, 75 + Math.random() * 50));

            // Equip the best tool for the job
            const tool = InventoryUtils.findBestTool(bot, block);
            if (tool) {
                await bot.equip(tool, 'hand');

                // Reduced delay after equipping (50-100ms) - Was 100-200ms
                await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));
            }

            // Dig the block with faster speed
            await bot.dig(block, true, 'raycast');

            if (bot.blockQuestLogging) {
                Logger.debug(`Broke ${block.name} at ${position}`);
            }
            return true;
        } catch (error) {
            Logger.warn(`Failed to break block: ${error.message}`);
            return false;
        }
    },

    async moveToNewLocation(bot, distance) {
        try {
            if (!bot.pathfinder) {
                Logger.warn('Pathfinder not available for movement');
                return false;
            }

            // Get a random direction
            const angle = Math.random() * Math.PI * 2;
            const dx = Math.cos(angle) * distance;
            const dz = Math.sin(angle) * distance;

            // Calculate target position
            const currentPos = bot.entity.position;
            const targetPos = currentPos.clone().add(new Vec3(dx, 0, dz));

            // Create a goal to move to the new position
            const goal = new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 1);

            // Set the goal
            bot.pathfinder.setGoal(goal);

            // Wait for the bot to reach the goal or timeout
            await new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (!bot.pathfinder.isMoving()) {
                        clearInterval(checkInterval);
                        clearTimeout(timeoutId);
                        resolve();
                    }
                }, 200); // Reduced from 300ms

                const timeoutId = setTimeout(() => {
                    clearInterval(checkInterval);
                    bot.pathfinder.stop();
                    resolve();
                }, 2000); // Reduced from 3000ms
            });

            // Reduced delay after moving (150-300ms) - Was 300-600ms
            await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 150));

            if (bot.blockQuestLogging) {
                Logger.debug(`Moved to new location for better block placement`);
            }
            return true;
        } catch (error) {
            Logger.warn(`Failed to move to new location: ${error.message}`);
            return false;
        }
    },

    generatePossibleBlockNames(blockName) {
        // Generate variations of the block name to improve matching
        const variations = [blockName];

        // Common misspellings and variations
        if (blockName.includes('_')) {
            variations.push(blockName.replace(/_/g, ''));
        } else {
            // Try adding underscores between words
            for (let i = 1; i < blockName.length; i++) {
                if (
                    (blockName[i] >= 'A' && blockName[i] <= 'Z') ||
                    (blockName[i-1] >= 'a' && blockName[i-1] <= 'z' &&
                        blockName[i] >= 'a' && blockName[i] <= 'z')
                ) {
                    const withUnderscore = blockName.slice(0, i) + '_' + blockName.slice(i);
                    variations.push(withUnderscore);
                }
            }
        }

        // Handle common block name patterns
        if (blockName.endsWith('_block')) {
            variations.push(blockName.replace('_block', ''));
        } else {
            variations.push(blockName + '_block');
        }

        // Handle ore blocks
        if (blockName.endsWith('_ore')) {
            variations.push(blockName.replace('_ore', ''));
        }

        // Handle common misspellings
        const commonMisspellings = {
            'emerald': 'emereld',
            'emereld': 'emerald',
            'diamond': 'dimond',
            'dimond': 'diamond',
            'gold': 'golden',
            'golden': 'gold',
            'iron': 'steel',
            'steel': 'iron',
            'stone': 'cobble',
            'cobble': 'stone',
            'wood': 'log',
            'log': 'wood'
        };

        // Add misspelling variations
        for (const [correct, misspelled] of Object.entries(commonMisspellings)) {
            if (blockName.includes(correct)) {
                variations.push(blockName.replace(correct, misspelled));
            }
        }

        // Remove duplicates and return
        return [...new Set(variations)];
    },

    scanInventoryForBlocks(bot) {
        // This is a fallback method to find blocks in inventory when name matching fails
        if (!bot.inventory) return [];

        // Get all items that are likely to be blocks
        return bot.inventory.items().filter(item => {
            // Most blocks have "block" in their name
            if (item.name.includes('block')) return true;

            // Many blocks end with specific materials
            if (item.name.endsWith('stone') ||
                item.name.endsWith('wood') ||
                item.name.endsWith('planks') ||
                item.name.endsWith('log') ||
                item.name.endsWith('dirt') ||
                item.name.endsWith('sand') ||
                item.name.endsWith('gravel') ||
                item.name.endsWith('ore')) {
                return true;
            }

            // Check if the item is placeable (has a "place" function)
            return item.name.startsWith('minecraft:') && !item.name.includes('sword') &&
                !item.name.includes('pickaxe') && !item.name.includes('axe') &&
                !item.name.includes('shovel') && !item.name.includes('hoe');
        });
    }
};