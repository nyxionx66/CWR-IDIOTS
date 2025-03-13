import { Logger } from '../utils/logger.js';

export default {
    name: 'help',
    aliases: ['?', 'commands'],
    description: 'Shows available commands',

    execute(bot, args, config) {
        const commandManager = bot.commandManager;

        Logger.divider();
        Logger.info('Available Console Commands:');

        // Get all commands and sort them alphabetically
        const commands = Array.from(commandManager.getCommands().values())
            .sort((a, b) => a.name.localeCompare(b.name));

        // Display each command with its description
        for (const command of commands) {
            const aliases = command.aliases ? ` (${command.aliases.join(', ')})` : '';
            Logger.info(`${command.name.padEnd(15)}${aliases.padEnd(15)} - ${command.description}`);
        }

        // Show custom commands from config
        const customCommands = config.customCommands || {};
        if (Object.keys(customCommands).length > 0) {
            Logger.info('\nCustom Commands:');
            for (const [cmd, action] of Object.entries(customCommands)) {
                Logger.info(`${cmd.padEnd(20)} - ${action}`);
            }
        }

        Logger.divider();
    }
};