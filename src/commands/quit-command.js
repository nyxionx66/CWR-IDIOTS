import { Logger } from '../utils/logger.js';

export default {
    name: 'quit',
    aliases: ['exit', 'stop'],
    description: 'Shutdown the bot',

    execute(bot, args, config) {
        Logger.info('Shutting down bot...');
        bot.quit();
        setTimeout(() => process.exit(0), 1000);
    }
};