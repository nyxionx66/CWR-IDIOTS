import { Logger } from '../utils/logger.js';

export default {
    name: 'say',
    aliases: ['chat', 'msg'],
    description: 'Send a chat message',

    execute(bot, args, config) {
        const message = args.join(' ');

        if (!message) {
            Logger.warn('Usage: say <message>');
            return;
        }

        try {
            if (bot.chat) {
                bot.chat(message);
                Logger.info(`Sent message: ${message}`);
            } else {
                Logger.warn('Cannot send message: Bot chat function not available');
            }
        } catch (error) {
            Logger.error(`Failed to send message: ${error.message}`);
        }
    }
};