import { Logger } from '../utils/logger.js';
import { VectorUtils } from '../utils/vector-utils.js';
import { InventoryUtils } from '../utils/inventory-utils.js';
import pkg from 'mineflayer-pathfinder';
const { pathfinder, Movements, goals } = pkg;

export default {
    name: 'give',
    aliases: ['gimme'],
    description: 'Give items to players by dropping them',

    execute(bot, args, config) {
        if (args.length < 2) {
            Logger.warn('Usage: give <username> [count] <item>');
            Logger.warn('Usage: gimme [count] <item>');
            return;
        }

        let username, count, itemName;

        // Check if this is the 'gimme' alias
        if (this.usedAlias === 'gimme') {
            // For gimme, we need to find who issued the command
            // Since this is a console command, we'll use the bot's username
            // In a real scenario, you'd track the player who issued the command
            username = bot.username;

            // Check if the first argument is a number (count)
            if (!isNaN(parseInt(args[0]))) {
                count = parseInt(args[0]);
                itemName = args.slice(1).join('_').toLowerCase();
            } else {
                count = 1;
                itemName = args.join('_').toLowerCase();
            }
        } else {
            // This is the standard 'give' command
            username = args[0];

            // Check if the second argument is a number (count)
            if (!isNaN(parseInt(args[1]))) {
                count = parseInt(args[1]);
                itemName = args.slice(2).join('_').toLowerCase();
            } else {
                count = 1;
                itemName = args.slice(1).join('_').toLowerCase();
            }
        }

        // Find the target player
        const player = bot.players[username];
        if (!player || !player.entity) {
            Logger.warn(`Cannot give items: Player ${username} not found or not in range`);
            return;
        }

        // Find the item in the bot's inventory
        const items = InventoryUtils.findItems(bot, itemName, { partialMatch: true });
        if (items.length === 0) {
            Logger.warn(`Cannot give items: ${itemName} not found in inventory`);
            return;
        }

        // Get the item to give
        const itemToGive = items[0];

        // Calculate how many we can actually give
        const actualCount = Math.min(count, itemToGive.count);

        if (actualCount <= 0) {
            Logger.warn(`Cannot give items: Not enough ${itemName} in inventory`);
            return;
        }

        // Move to the player
        this.moveToPlayerAndGiveItem(bot, player.entity, itemToGive, actualCount);
    },

    async moveToPlayerAndGiveItem(bot, playerEntity, item, count) {
        try {
            Logger.info(`Moving to player to give ${count} ${item.name}...`);

            // Check if pathfinder is available
            if (!bot.pathfinder) {
                Logger.error('Cannot move to player: Pathfinder plugin not loaded');
                return;
            }

            // Get the player's position
            const playerPos = playerEntity.position;

            // Create a goal to move near the player
            const goal = new goals.GoalNear(playerPos.x, playerPos.y, playerPos.z, 2);

            // Set the goal
            bot.pathfinder.setGoal(goal);

            // Wait for the bot to reach the player or timeout
            await new Promise((resolve) => {
                // Function to check if we've reached the goal
                const checkReached = () => {
                    const botPos = bot.entity.position;
                    const distance = VectorUtils.euclideanDistance(botPos, playerEntity.position);
                    return distance <= 3; // Within 3 blocks is close enough
                };

                // Set up interval to check progress
                const checkInterval = setInterval(() => {
                    // If we're not moving anymore or we've reached the goal
                    if (!bot.pathfinder.isMoving() || checkReached()) {
                        clearInterval(checkInterval);
                        clearTimeout(timeoutId);
                        resolve();
                    }
                }, 500);

                // Set a timeout in case we can't reach the player
                const timeoutId = setTimeout(() => {
                    clearInterval(checkInterval);
                    Logger.warn('Timeout reached while trying to move to player');
                    resolve();
                }, 15000); // 15 second timeout
            });

            // Check if we're close enough to the player
            const finalDistance = VectorUtils.euclideanDistance(
                bot.entity.position,
                playerEntity.position
            );

            if (finalDistance > 5) {
                Logger.warn(`Could not get close enough to player (distance: ${finalDistance.toFixed(2)} blocks)`);
                return;
            }

            // Look at the player before dropping
            await bot.lookAt(playerEntity.position.offset(0, 1.6, 0)); // Look at player's head

            // Wait a moment before dropping
            await new Promise(resolve => setTimeout(resolve, 500));

            // Drop the item
            await InventoryUtils.dropItem(bot, item, count);

            Logger.success(`Gave ${count} ${item.name} to player`);
        } catch (error) {
            Logger.error(`Failed to give item: ${error.message}`);
        }
    }
};