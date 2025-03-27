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
                    await new Promise(resolve => setTimeout(resolve, 500));
                    continue;
                }

                // Find a suitable place to put the block
                const placePosition = await this.findPlacePosition(bot, task.radius);

                if (!placePosition) {
                    Logger.warn('Could not find a suitable place to put the block');
                    task.stats.failed++;
                    await this.moveToNewLocation(bot, 3);
                    await new Promise(resolve => setTimeout(resolve, 250));
                    continue;
                }

                // Add a small delay before placing (50-100ms)
                await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));

                // Place the block - OPTIMIZED FOR SPEED
                const success = await this.placeBlockFast(bot, blocks[0], placePosition);

                if (!success) {
                    task.stats.failed++;
                    if (task.stats.failed % 3 === 0) {
                        await this.moveToNewLocation(bot, 5);
                    }
                    await new Promise(resolve => setTimeout(resolve, 250));
                    continue;
                }

                task.stats.placed++;
                task.placedBlock = placePosition;

                // Add a small delay before breaking (75-125ms)
                await new Promise(resolve => setTimeout(resolve, 75 + Math.random() * 50));

                // Break the block - OPTIMIZED FOR SPEED
                const brokenSuccess = await this.breakBlockFast(bot, placePosition);

                if (brokenSuccess) {
                    task.stats.broken++;
                    task.currentCount++;

                    const shouldLogProgress =
                        task.currentCount % task.progressUpdateInterval === 0 ||
                        task.currentCount === task.targetTimes ||
                        (Date.now() - task.lastProgressUpdate) > 10000;

                    if (shouldLogProgress) {
                        const percentage = ((task.currentCount / task.targetTimes) * 100).toFixed(1);
                        Logger.info(`BlockQuest progress: ${task.currentCount}/${task.targetTimes} (${percentage}%)`);
                        task.lastProgressUpdate = Date.now();
                    } else if (bot.blockQuestLogging) {
                        Logger.debug(`BlockQuest progress: ${task.currentCount}/${task.targetTimes}`);
                    }

                    // Add a shorter delay between cycles (100-200ms)
                    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
                } else {
                    task.stats.failed++;
                    Logger.warn('Failed to break the block, retrying...');

                    if (task.stats.failed % 3 === 0) {
                        await this.moveToNewLocation(bot, 5);
                    }

                    await new Promise(resolve => setTimeout(resolve, 400));
                }
            } catch (error) {
                Logger.error(`Error in BlockQuest cycle: ${error.message}`);
                task.stats.failed++;
                await new Promise(resolve => setTimeout(resolve, 500));
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

            const goal = new goals.GoalNear(position.x, position.y, position.z, 1);
            bot.pathfinder.setGoal(goal);

            await new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (!bot.pathfinder.isMoving()) {
                        clearInterval(checkInterval);
                        clearTimeout(timeoutId);
                        resolve();
                    }
                }, 200);

                const timeoutId = setTimeout(() => {
                    clearInterval(checkInterval);
                    bot.pathfinder.stop();
                    resolve();
                }, 2000);
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
        const botPos = bot.entity.position.clone();

        // First try positions very close to the bot
        for (let r = 1; r <= 2; r++) {
            for (let x = -r; x <= r; x++) {
                for (let z = -r; z <= r; z++) {
                    if (Math.abs(x) !== r && Math.abs(z) !== r) continue;

                    for (let y = -1; y <= 1; y++) {
                        const pos = botPos.clone().add(new Vec3(x, y, z));
                        if (await this.isSuitableForPlacement(bot, pos)) {
                            return pos;
                        }
                    }
                }
            }
        }

        // If we couldn't find a close position, try a wider search
        for (let r = 3; r <= radius; r++) {
            for (let x = -r; x <= r; x++) {
                for (let z = -r; z <= r; z++) {
                    if (Math.abs(x) !== r && Math.abs(z) !== r) continue;

                    for (let y = -1; y <= 1; y++) {
                        const pos = botPos.clone().add(new Vec3(x, y, z));
                        if (await this.isSuitableForPlacement(bot, pos)) {
                            return pos;
                        }
                    }
                }
            }
        }

        return null;
    },

    async isSuitableForPlacement(bot, position) {
        try {
            const block = bot.blockAt(position);
            if (!block) return false;

            if (block.name !== 'air' && block.name !== 'water') {
                return false;
            }

            const blockBelow = bot.blockAt(position.clone().add(new Vec3(0, -1, 0)));
            if (!blockBelow || blockBelow.name === 'air' || blockBelow.name === 'lava') {
                return false;
            }

            const canSee = bot.canSeeBlock(blockBelow);
            if (!canSee) {
                return false;
            }

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
            const referenceBlock = bot.blockAt(position.clone().add(new Vec3(0, -1, 0)));

            if (!referenceBlock) {
                Logger.warn('No reference block found for placement');
                return false;
            }

            await bot.equip(blockItem, 'hand');
            await new Promise(resolve => setTimeout(resolve, 50));
            await bot.lookAt(position, false);
            await new Promise(resolve => setTimeout(resolve, 50));
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
            const block = bot.blockAt(position);

            if (!block || block.name === 'air') {
                Logger.warn('No block found to break');
                return false;
            }

            await bot.lookAt(position.clone().add(new Vec3(0.5, 0.5, 0.5)), false);
            await new Promise(resolve => setTimeout(resolve, 50));

            const tool = InventoryUtils.findBestTool(bot, block);
            if (tool) {
                await bot.equip(tool, 'hand');
                await new Promise(resolve => setTimeout(resolve, 50));
            }

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

            const angle = Math.random() * Math.PI * 2;
            const dx = Math.cos(angle) * distance;
            const dz = Math.sin(angle) * distance;

            const currentPos = bot.entity.position;
            const targetPos = currentPos.clone().add(new Vec3(dx, 0, dz));

            const goal = new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 1);
            bot.pathfinder.setGoal(goal);

            await new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (!bot.pathfinder.isMoving()) {
                        clearInterval(checkInterval);
                        clearTimeout(timeoutId);
                        resolve();
                    }
                }, 200);

                const timeoutId = setTimeout(() => {
                    clearInterval(checkInterval);
                    bot.pathfinder.stop();
                    resolve();
                }, 2000);
            });

            await new Promise(resolve => setTimeout(resolve, 150));

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
        const variations = [blockName];

        if (blockName.includes('_')) {
            variations.push(blockName.replace(/_/g, ''));
        } else {
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

        if (blockName.endsWith('_block')) {
            variations.push(blockName.replace('_block', ''));
        } else {
            variations.push(blockName + '_block');
        }

        if (blockName.endsWith('_ore')) {
            variations.push(blockName.replace('_ore', ''));
        }

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

        for (const [correct, misspelled] of Object.entries(commonMisspellings)) {
            if (blockName.includes(correct)) {
                variations.push(blockName.replace(correct, misspelled));
            }
        }

        return [...new Set(variations)];
    },

    scanInventoryForBlocks(bot) {
        if (!bot.inventory) return [];

        return bot.inventory.items().filter(item => {
            if (item.name.includes('block')) return true;

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

            return item.name.startsWith('minecraft:') && !item.name.includes('sword') &&
                !item.name.includes('pickaxe') && !item.name.includes('axe') &&
                !item.name.includes('shovel') && !item.name.includes('hoe');
        });
    }
};