import { Logger } from '../utils/logger.js';

const customCommand = {
    name: 'custom',
    aliases: ['cmd', 'c', 'cm'],
    description: 'Manage custom commands',

    execute(bot, args, config) {
        if (!args.length || args[0] === 'help') {
            this.showHelp();
            return;
        }

        const subCommand = args[0].toLowerCase();

        switch (subCommand) {
            case 'list':
                this.listCustomCommands(config);
                break;
            case 'add':
                this.addCustomCommand(bot, args.slice(1), config);
                break;
            case 'remove':
            case 'delete':
                this.removeCustomCommand(bot, args.slice(1), config);
                break;
            case 'run':
                this.runCustomCommand(bot, args.slice(1), config);
                break;
            default:
                Logger.warn(`Unknown subcommand: ${subCommand}`);
                this.showHelp();
        }
    },

    showHelp() {
        Logger.divider();
        Logger.info('Custom Command Usage:');
        Logger.info('custom list                - List all custom commands');
        Logger.info('custom add <name> <action> - Add a new custom command');
        Logger.info('custom remove <name>       - Remove a custom command');
        Logger.info('custom run <name>          - Run a custom command');
        Logger.divider();
    },

    listCustomCommands(config) {
        const customCommands = config.customCommands || {};

        if (Object.keys(customCommands).length === 0) {
            Logger.info('No custom commands defined.');
            return;
        }

        Logger.divider();
        Logger.info('Custom Commands:');

        for (const [name, action] of Object.entries(customCommands)) {
            Logger.info(`${name.padEnd(15)} - ${action}`);
        }

        Logger.divider();
    },

    addCustomCommand(bot, args, config) {
        if (args.length < 2) {
            Logger.warn('Usage: custom add <name> <action>');
            return;
        }

        const name = args[0];
        const action = args.slice(1).join(' ');

        // Check if the command already exists in the built-in commands
        if (bot.commandManager.getCommand(name) || bot.commandManager.aliases.get(name)) {
            Logger.warn(`Cannot add custom command: '${name}' is already a built-in command or alias.`);
            return;
        }

        // Access the HuminiBot instance to update config
        if (!bot.huminiBot || !bot.huminiBot.configManager) {
            Logger.error('Cannot add custom command: Config manager not available');
            return;
        }

        // Update the config
        const configManager = bot.huminiBot.configManager;

        // Ensure customCommands object exists
        if (!config.customCommands) {
            config.customCommands = {};
        }

        // Add the command
        config.customCommands[name] = action;

        // Save the updated config
        if (configManager.updateConfig(config)) {
            Logger.success(`Added custom command: ${name} -> ${action}`);
        } else {
            Logger.error('Failed to save custom command to config');
        }
    },

    removeCustomCommand(bot, args, config) {
        if (args.length < 1) {
            Logger.warn('Usage: custom remove <name>');
            return;
        }

        const name = args[0];

        // Check if the command exists
        if (!config.customCommands || !config.customCommands[name]) {
            Logger.warn(`Custom command '${name}' does not exist.`);
            return;
        }

        // Access the HuminiBot instance to update config
        if (!bot.huminiBot || !bot.huminiBot.configManager) {
            Logger.error('Cannot remove custom command: Config manager not available');
            return;
        }

        // Update the config
        const configManager = bot.huminiBot.configManager;

        // Remove the command
        delete config.customCommands[name];

        // Save the updated config
        if (configManager.updateConfig(config)) {
            Logger.success(`Removed custom command: ${name}`);
        } else {
            Logger.error('Failed to update config');
        }
    },

    runCustomCommand(bot, args, config) {
        if (args.length < 1) {
            Logger.warn('Usage: custom run <name>');
            return;
        }

        const name = args[0];

        // Check if the command exists
        if (!config.customCommands || !config.customCommands[name]) {
            Logger.warn(`Custom command '${name}' does not exist.`);
            return;
        }

        const action = config.customCommands[name];
        bot.chat(action);
        Logger.info(`Executed custom command: ${name} -> ${action}`);
    }
};

export default customCommand;