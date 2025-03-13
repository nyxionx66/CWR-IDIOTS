import { MultiBotManager } from './src/core/multi-bot-manager.js';
import { Logger } from './src/utils/logger.js';
import { ConfigManager } from './src/utils/config-manager.js';
import { commands } from './src/commands/index.js';

async function initializeBotSystem() {
    try {
        // Load the main config
        const configManager = new ConfigManager();
        const config = configManager.getConfig();

        // Create the multi-bot manager
        const multiBotManager = new MultiBotManager();

        // Create the default bot using the main config
        const defaultBot = await multiBotManager.createBot('default', config);

        if (!defaultBot) {
            throw new Error('Failed to create default bot');
        }

        // Load all commands
        defaultBot.commandManager.loadCommands(commands);

        // Set up console input handling for the active bot
        process.stdin.on('data', (data) => {
            const input = data.toString().trim();

            // Skip empty input
            if (!input) return;

            // Get the active bot
            const activeBot = multiBotManager.getActiveBot();

            if (!activeBot) {
                Logger.error('No active bot available to handle command');
                return;
            }

            // Use the command manager to handle the input
            if (!activeBot.commandManager.executeCommand(input)) {
                // Check if it's a direct custom command from config
                if (activeBot.config.customCommands && activeBot.config.customCommands[input]) {
                    if (activeBot.bot.chat) {
                        activeBot.bot.chat(activeBot.config.customCommands[input]);
                        Logger.info(`Executed custom command: ${input} -> ${activeBot.config.customCommands[input]}`);
                    } else {
                        Logger.warn(`Cannot execute command: Bot chat function not available`);
                    }
                } else {
                    Logger.warn(`Unknown command. Type "help" for available commands.`);
                }
            }
        });

        // Make the multiBotManager globally accessible
        global.multiBotManager = multiBotManager;

        Logger.info('Humini multi-bot system initialized successfully!');
        Logger.info('Type "help" for available commands');
    } catch (error) {
        Logger.error(`Failed to initialize bot system: ${error.message}`);
        process.exit(1);
    }
}

// Start the bot system
initializeBotSystem();