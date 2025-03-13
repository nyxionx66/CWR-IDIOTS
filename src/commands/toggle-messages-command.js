import { Logger } from '../utils/logger.js';

export default {
    name: 'togglemsgs',
    aliases: ['messages', 'msgs'],
    description: 'Toggle in-game message printing',

    execute(bot, args, config) {
        const enabled = args[0] ? args[0].toLowerCase() === 'on' || args[0].toLowerCase() === 'true' : null;

        // Access the event manager through the bot instance
        if (bot.eventManager) {
            bot.eventManager.toggleMessagePrinting(enabled);
        } else {
            Logger.error('Event manager not available');
        }
    }
};