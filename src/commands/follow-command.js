import { Logger } from '../utils/logger.js';
import { VectorUtils } from '../utils/vector-utils.js';
import pkg from 'mineflayer-pathfinder';
const { pathfinder, Movements, goals } = pkg;

export default {
    name: 'follow',
    aliases: ['followplayer'],
    description: 'Follow a player',

    execute(bot, args, config) {
        // Check if this is a stop command
        if (args[0] === 'stop' || args[0] === 'off') {
            this.stopFollowing(bot);
            return;
        }

        // If no username provided, show usage
        if (args.length < 1) {
            Logger.warn('Usage: follow <username>');
            Logger.warn('Usage: follow stop - To stop following');
            return;
        }

        const username = args[0];
        this.startFollowing(bot, username, config);
    },

    startFollowing(bot, username, config) {
        // Check if pathfinder is available
        if (!bot.pathfinder) {
            Logger.error('Cannot follow player: Pathfinder plugin not loaded');
            return;
        }

        // Find the player
        const player = bot.players[username];
        if (!player || !player.entity) {
            Logger.warn(`Cannot follow player: ${username} not found or not in range`);
            return;
        }

        // Get follow distance from config or use default
        const followDistance = config.movement?.followDistance || 1;

        // Create a follow goal using the imported goals
        const goal = new goals.GoalFollow(player.entity, followDistance);

        // Set the goal
        bot.pathfinder.setGoal(goal, true);

        // Store the player being followed
        bot.followingPlayer = username;

        Logger.info(`Now following player: ${username} at distance ${followDistance}`);

        // Set up a position check interval to maintain following
        if (bot.followInterval) clearInterval(bot.followInterval);

        bot.followInterval = setInterval(() => {
            // Check if the player is still valid
            const target = bot.players[username];
            if (!target || !target.entity) {
                Logger.warn(`Lost sight of ${username}, stopping follow`);
                this.stopFollowing(bot);
                return;
            }

            // Update the goal if needed
            if (bot.pathfinder.goal && bot.pathfinder.goal.entity !== target.entity) {
                bot.pathfinder.setGoal(new goals.GoalFollow(target.entity, followDistance), true);
            }

            // Log distance for debugging
            if (Logger.debugMode) {
                const botPos = bot.entity.position;
                const targetPos = target.entity.position;
                const distance = VectorUtils.euclideanDistance(botPos, targetPos);
                Logger.debug(`Distance to ${username}: ${distance.toFixed(2)} blocks`);
            }
        }, config.movement?.lookInterval || 800);
    },

    stopFollowing(bot) {
        // Clear the follow interval
        if (bot.followInterval) {
            clearInterval(bot.followInterval);
            bot.followInterval = null;
        }

        // Stop pathfinding
        if (bot.pathfinder) {
            bot.pathfinder.stop();
        }

        // Clear the following player reference
        const wasFollowing = bot.followingPlayer;
        bot.followingPlayer = null;

        if (wasFollowing) {
            Logger.info(`Stopped following ${wasFollowing}`);
        } else {
            Logger.info('Not currently following anyone');
        }
    }
};