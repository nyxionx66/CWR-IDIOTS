import { Logger } from '../utils/logger.js';

export default {
    name: 'antiafk',
    aliases: ['afk', 'noafk'],
    description: 'Toggle anti-AFK mode to prevent being kicked for inactivity',

    execute(bot, args, config) {
        // Check if we should enable or disable
        if (args[0] && (args[0].toLowerCase() === 'off' || args[0].toLowerCase() === 'stop')) {
            this.stopAntiAFK(bot);
            return;
        }

        // Parse interval if provided
        let interval = 30000; // Default: 30 seconds
        if (args[0] && !isNaN(parseInt(args[0]))) {
            interval = parseInt(args[0]) * 1000; // Convert to milliseconds
        }

        this.startAntiAFK(bot, interval);
    },

    startAntiAFK(bot, interval) {
        // Stop any existing anti-AFK task
        this.stopAntiAFK(bot);

        // Store the interval for later reference
        bot.antiAFKInterval = interval;

        // Create a new interval for anti-AFK actions
        bot.antiAFKTask = setInterval(() => {
            this.performAntiAFKAction(bot);
        }, interval);

        Logger.success(`Anti-AFK mode enabled (interval: ${interval/1000} seconds)`);
    },

    stopAntiAFK(bot) {
        if (bot.antiAFKTask) {
            clearInterval(bot.antiAFKTask);
            bot.antiAFKTask = null;
            bot.antiAFKInterval = null;
            Logger.info('Anti-AFK mode disabled');
        } else {
            Logger.info('Anti-AFK mode was not active');
        }
    },

    performAntiAFKAction(bot) {
        // Choose a random action to perform
        const actions = [
            this.jump,
            this.sneak,
            this.lookAround,
            this.swingArm,
            this.smallMove
        ];

        const randomAction = actions[Math.floor(Math.random() * actions.length)];
        randomAction(bot);

        Logger.debug('Performed anti-AFK action');
    },

    // Anti-AFK actions
    jump(bot) {
        bot.setControlState('jump', true);
        setTimeout(() => {
            bot.setControlState('jump', false);
        }, 500);
        Logger.debug('Anti-AFK: Jump');
    },

    sneak(bot) {
        bot.setControlState('sneak', true);
        setTimeout(() => {
            bot.setControlState('sneak', false);
        }, 1000);
        Logger.debug('Anti-AFK: Sneak');
    },

    lookAround(bot) {
        // Look in a random direction
        const yaw = Math.random() * Math.PI * 2;
        const pitch = Math.random() * Math.PI - (Math.PI / 2);
        bot.look(yaw, pitch, false);
        Logger.debug('Anti-AFK: Look around');
    },

    swingArm(bot) {
        bot.swingArm();
        Logger.debug('Anti-AFK: Swing arm');
    },

    smallMove(bot) {
        // Make a small movement in a random direction
        const directions = ['forward', 'back', 'left', 'right'];
        const direction = directions[Math.floor(Math.random() * directions.length)];

        bot.setControlState(direction, true);
        setTimeout(() => {
            bot.setControlState(direction, false);
        }, 500);
        Logger.debug(`Anti-AFK: Small move (${direction})`);
    }
};