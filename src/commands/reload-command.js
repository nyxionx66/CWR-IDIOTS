import { Logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

export default {
    name: 'reload',
    aliases: ['refresh'],
    description: 'Reload configuration and commands',

    execute(bot, args, config) {
        // Check if we should reload specific components or everything
        const reloadAll = !args.length || args[0].toLowerCase() === 'all';
        const reloadConfig = reloadAll || args.some(arg => arg.toLowerCase() === 'config');
        const reloadCommands = reloadAll || args.some(arg => arg.toLowerCase() === 'commands');

        if (reloadConfig) {
            this.reloadConfiguration(bot);
        }

        if (reloadCommands) {
            this.reloadCommands(bot);
        }

        if (!reloadConfig && !reloadCommands) {
            Logger.warn('Usage: reload [all|config|commands]');
        }
    },

    reloadConfiguration(bot) {
        // Access the huminiBot instance through the bot
        if (bot.huminiBot && typeof bot.huminiBot.reloadConfig === 'function') {
            const newConfig = bot.huminiBot.reloadConfig();
            Logger.success('Configuration reloaded successfully');

            // Update any runtime configurations that depend on config
            this.updateRuntimeConfigurations(bot, newConfig);
        } else {
            Logger.error('Cannot reload config: HuminiBot instance not available');
        }
    },

    updateRuntimeConfigurations(bot, config) {
        // Update autoEat configuration if available
        if (bot.autoEat) {
            bot.autoEat.options = config.autoEat;
            Logger.debug('Updated autoEat configuration');
        }

        // Update other runtime configurations as needed
        // ...
    },

    async reloadCommands(bot) {
        if (!bot.commandManager) {
            Logger.error('Cannot reload commands: Command manager not available');
            return;
        }

        try {
            // Get current command count for comparison
            const currentCommandCount = bot.commandManager.getCommands().size;

            // Get a list of all command files
            const commandFiles = this.getCommandFiles();

            // Load each command file directly
            const freshCommands = await this.loadCommandsFromFiles(commandFiles);

            // Reload all commands
            bot.commandManager.loadCommands(freshCommands);

            // Get new command count
            const newCommandCount = bot.commandManager.getCommands().size;
            const newCommandsAdded = newCommandCount - currentCommandCount;

            if (newCommandsAdded > 0) {
                Logger.success(`Reloaded commands: ${newCommandCount} total (${newCommandsAdded} new commands added)`);
            } else {
                Logger.success(`Reloaded ${newCommandCount} commands successfully`);
            }
        } catch (error) {
            Logger.error(`Failed to reload commands: ${error.message}`);
        }
    },

    getCommandFiles() {
        // Get the commands directory path
        const commandsDir = __dirname;

        // Read all command files
        return fs.readdirSync(commandsDir)
            .filter(file => file.endsWith('-command.js'))
            .map(file => path.join(commandsDir, file));
    },

    async loadCommandsFromFiles(commandFiles) {
        const commands = [];

        for (const filePath of commandFiles) {
            try {
                // Delete the file from require cache if it exists
                const requirePath = filePath.replace(/\\/g, '/');
                if (require.cache[requirePath]) {
                    delete require.cache[requirePath];
                }

                // Import the file with a cache-busting query parameter
                const fileUrl = `file://${filePath}?t=${Date.now()}`;
                const commandModule = await import(fileUrl);

                // Get the default export
                const command = commandModule.default;

                if (command && command.name && typeof command.execute === 'function') {
                    commands.push(command);
                    Logger.debug(`Loaded command: ${command.name}`);
                } else {
                    Logger.warn(`Invalid command format in file: ${path.basename(filePath)}`);
                }
            } catch (error) {
                Logger.error(`Error loading command file ${path.basename(filePath)}: ${error.message}`);
            }
        }

        return commands;
    }
};