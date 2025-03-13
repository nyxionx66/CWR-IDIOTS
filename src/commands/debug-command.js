import { Logger } from '../utils/logger.js';

export default {
    name: 'debug',
    aliases: ['verbose'],
    description: 'Toggle debug mode',

    execute(bot, args, config) {
        if (args[0] && (args[0].toLowerCase() === 'on' || args[0].toLowerCase() === 'true')) {
            Logger.enableDebug();
        } else if (args[0] && (args[0].toLowerCase() === 'off' || args[0].toLowerCase() === 'false')) {
            Logger.disableDebug();
        } else {
            // Toggle current state
            Logger.debugMode ? Logger.disableDebug() : Logger.enableDebug();
        }
    }
};