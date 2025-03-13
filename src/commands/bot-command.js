import { Logger } from '../utils/logger.js';
import { generateRandomUsername } from '../utils/name-generator.js';

export default {
    name: 'bot',
    aliases: ['bots', 'multibot'],
    description: 'Manage multiple bot instances',

    execute(bot, args, config) {
        if (!args.length || args[0] === 'help') {
            this.showHelp();
            return;
        }

        const subCommand = args[0].toLowerCase();
        const multiBotManager = bot.huminiBot?.multiBotManager || global.multiBotManager;

        if (!multiBotManager) {
            Logger.error('Multi-bot manager not available. This is a critical error.');
            return;
        }

        switch (subCommand) {
            case 'list':
                this.listBots(multiBotManager);
                break;
            case 'create':
                this.createBot(multiBotManager, args.slice(1));
                break;
            case 'mass':
                this.createMassBots(multiBotManager, args.slice(1));
                break;
            case 'remove':
            case 'delete':
                this.removeBot(multiBotManager, args.slice(1));
                break;
            case 'switch':
            case 'select':
                this.switchBot(multiBotManager, args.slice(1));
                break;
            case 'info':
                this.showBotInfo(multiBotManager, args.slice(1));
                break;
            case 'cmd':
            case 'command':
                this.executeCommand(multiBotManager, args.slice(1));
                break;
            case 'all':
                this.executeCommandOnAll(multiBotManager, args.slice(1));
                break;
            case 'configs':
                this.listConfigs(multiBotManager);
                break;
            case 'load':
                this.loadBot(multiBotManager, args.slice(1));
                break;
            default:
                Logger.warn(`Unknown subcommand: ${subCommand}`);
                this.showHelp();
        }
    },

    showHelp() {
        Logger.divider();
        Logger.info('Multi-Bot Management Commands:');
        Logger.info('bot list                - List all active bots');
        Logger.info('bot create <id> [host] [port] [username] - Create a new bot');
        Logger.info('bot mass <count> [host] [port] [delay] - Create multiple bots with random names');
        Logger.info('bot remove <id>         - Remove a bot');
        Logger.info('bot switch <id>         - Switch to a different bot');
        Logger.info('bot info [id]           - Show info about a bot (current bot if no ID)');
        Logger.info('bot cmd <id> <command>  - Execute a command on a specific bot');
        Logger.info('bot all <command>       - Execute a command on all bots');
        Logger.info('bot configs             - List available saved configurations');
        Logger.info('bot load <id>           - Load a bot from a saved configuration');
        Logger.divider();
    },

    async createMassBots(multiBotManager, args) {
        if (args.length < 1) {
            Logger.warn('Usage: bot mass <count> [host] [port] [delay]');
            return;
        }

        const count = parseInt(args[0]);
        if (isNaN(count) || count <= 0) {
            Logger.warn('Count must be a positive number');
            return;
        }

        const defaultBot = multiBotManager.getActiveBot();
        const defaultConfig = defaultBot ? defaultBot.config : { bot: {}, autoEat: {}, movement: {}, dashboard: {} };
        const baseConfig = JSON.parse(JSON.stringify(defaultConfig));

        if (args.length >= 2) baseConfig.bot.host = args[1];
        if (args.length >= 3) baseConfig.bot.port = parseInt(args[2]);

        // Login delay between bots (default: 2000ms)
        const loginDelay = args.length >= 4 ? parseInt(args[3]) : 2000;

        Logger.info(`Creating ${count} bots with ${loginDelay}ms login delay...`);

        let successCount = 0;
        const createdBots = [];

        // Generate all usernames first to ensure uniqueness
        const usernames = generateRandomUsername(count, true);

        for (let i = 0; i < count; i++) {
            const username = usernames[i];
            const botId = `mass_${username.toLowerCase()}`;

            const botConfig = { ...baseConfig };
            botConfig.bot.username = username;
            botConfig.quietMode = true; // Reduce console spam

            // Add random variation to login delay (±20%)
            const randomizedDelay = loginDelay + (Math.random() * 0.4 - 0.2) * loginDelay;

            // Create the bot with mass bot flag
            const bot = multiBotManager.createBot(botId, botConfig, true);

            if (bot) {
                createdBots.push({ bot, username });
                successCount++;

                if (i === 0 || i === count - 1 || i % 5 === 0) {
                    Logger.info(`Created bot ${i + 1}/${count}: ${username}`);
                }

                // Wait for the randomized delay before creating the next bot
                await new Promise(resolve => setTimeout(resolve, randomizedDelay));
            }
        }

        // Execute login commands with delays
        for (const { bot: createdBot, username } of createdBots) {
            try {
                // Random delay between 1-2x base delay for login commands
                const commandDelay = loginDelay + Math.random() * loginDelay;

                // Execute register command
                await new Promise(resolve => setTimeout(resolve, commandDelay));
                createdBot.bot.chat('/register sad321 sad321');

                // Wait before login
                await new Promise(resolve => setTimeout(resolve, 1000));
                createdBot.bot.chat('/login sad321');

                Logger.debug(`Bot ${username} executed login commands`);
            } catch (error) {
                Logger.warn(`Failed to execute login commands for ${username}: ${error.message}`);
            }
        }

        Logger.success(`Successfully created ${successCount}/${count} bots`);
        Logger.info('Use "bot list" to see all bots');
    },

    listBots(multiBotManager) {
        const botIds = multiBotManager.getAllBotIds();
        const activeBot = multiBotManager.activeBot;

        if (botIds.length === 0) {
            Logger.info('No bots are currently active');
            return;
        }

        Logger.divider();
        Logger.info(`Active Bots (${botIds.length}):`);

        for (const botId of botIds) {
            const bot = multiBotManager.getBot(botId);
            const isActive = botId === activeBot ? '(active) ' : '';
            const status = bot.bot && bot.bot._client ? 'connected' : 'disconnected';
            const serverInfo = bot.config.bot ? `${bot.config.bot.host}:${bot.config.bot.port}` : 'N/A';
            const username = bot.config.bot ? bot.config.bot.username : 'N/A';

            Logger.info(`${isActive}${botId.padEnd(15)} - ${status.padEnd(12)} - ${serverInfo.padEnd(25)} - ${username}`);
        }

        Logger.divider();
    },

    createBot(multiBotManager, args) {
        if (args.length < 1) {
            Logger.warn('Usage: bot create <id> [host] [port] [username]');
            return;
        }

        const botId = args[0];

        // Check if a bot with this ID already exists
        if (multiBotManager.getBot(botId)) {
            Logger.warn(`A bot with ID ${botId} already exists`);
            return;
        }

        // Create a new configuration based on the default one
        const defaultBot = multiBotManager.getActiveBot();
        const defaultConfig = defaultBot ? defaultBot.config : { bot: {}, autoEat: {}, movement: {}, dashboard: {} };

        // Clone the config to avoid modifying the original
        const newConfig = JSON.parse(JSON.stringify(defaultConfig));

        // Update the configuration with provided arguments
        if (args.length >= 2) newConfig.bot.host = args[1];
        if (args.length >= 3) newConfig.bot.port = parseInt(args[2]);
        if (args.length >= 4) newConfig.bot.username = args[3];

        // Create the new bot
        const bot = multiBotManager.createBot(botId, newConfig);

        if (bot) {
            Logger.success(`Created new bot with ID: ${botId}`);
            Logger.info(`Use 'bot switch ${botId}' to switch to this bot`);
        }
    },

    removeBot(multiBotManager, args) {
        if (args.length < 1) {
            Logger.warn('Usage: bot remove <id>');
            return;
        }

        const botId = args[0];

        if (multiBotManager.removeBot(botId)) {
            Logger.success(`Removed bot with ID: ${botId}`);
        }
    },

    switchBot(multiBotManager, args) {
        if (args.length < 1) {
            Logger.warn('Usage: bot switch <id>');
            return;
        }

        const botId = args[0];

        if (multiBotManager.setActiveBot(botId)) {
            Logger.success(`Switched to bot: ${botId}`);
        }
    },

    showBotInfo(multiBotManager, args) {
        let botId;

        if (args.length >= 1) {
            botId = args[0];
        } else {
            botId = multiBotManager.activeBot;
        }

        if (!botId) {
            Logger.warn('No active bot to show info for');
            return;
        }

        const bot = multiBotManager.getBot(botId);

        if (!bot) {
            Logger.warn(`Bot with ID ${botId} not found`);
            return;
        }

        const config = bot.config;
        const isConnected = bot.bot && bot.bot._client;
        const health = isConnected && bot.bot.health ? bot.bot.health : 'N/A';
        const food = isConnected && bot.bot.food ? bot.bot.food : 'N/A';
        const position = isConnected && bot.bot.entity ?
            `${Math.floor(bot.bot.entity.position.x)}, ${Math.floor(bot.bot.entity.position.y)}, ${Math.floor(bot.bot.entity.position.z)}` :
            'N/A';

        Logger.divider();
        Logger.info(`Bot Information: ${botId}${botId === multiBotManager.activeBot ? ' (active)' : ''}`);
        Logger.info(`Status: ${isConnected ? 'Connected' : 'Disconnected'}`);
        Logger.info(`Server: ${config.bot ? `${config.bot.host}:${config.bot.port}` : 'N/A'}`);
        Logger.info(`Username: ${config.bot ? config.bot.username : 'N/A'}`);
        Logger.info(`Health: ${health}`);
        Logger.info(`Food: ${food}`);
        Logger.info(`Position: ${position}`);

        if (isConnected) {
            const playerCount = Object.keys(bot.bot.players || {}).length;
            Logger.info(`Players online: ${playerCount}`);
        }

        Logger.divider();
    },

    executeCommand(multiBotManager, args) {
        if (args.length < 2) {
            Logger.warn('Usage: bot cmd <id> <command>');
            return;
        }

        const botId = args[0];
        const command = args.slice(1).join(' ');

        Logger.info(`Executing command on bot ${botId}: ${command}`);

        if (multiBotManager.executeCommand(botId, command)) {
            Logger.success(`Command executed successfully on bot ${botId}`);
        } else {
            Logger.warn(`Failed to execute command on bot ${botId}`);
        }
    },

    executeCommandOnAll(multiBotManager, args) {
        if (args.length < 1) {
            Logger.warn('Usage: bot all <command>');
            return;
        }

        const command = args.join(' ');
        const botIds = multiBotManager.getAllBotIds();

        if (botIds.length === 0) {
            Logger.warn('No bots available to execute command');
            return;
        }

        Logger.info(`Executing command on all bots: ${command}`);

        const results = multiBotManager.executeCommandOnAll(command);

        let successCount = 0;
        let failCount = 0;

        for (const [botId, success] of Object.entries(results)) {
            if (success) {
                successCount++;
            } else {
                failCount++;
                Logger.warn(`Failed to execute command on bot ${botId}`);
            }
        }

        Logger.success(`Command executed on ${successCount} bots (${failCount} failed)`);
    },

    listConfigs(multiBotManager) {
        const configs = multiBotManager.getAvailableConfigs();

        if (configs.length === 0) {
            Logger.info('No saved bot configurations found');
            return;
        }

        Logger.divider();
        Logger.info(`Available Bot Configurations (${configs.length}):`);

        for (const configId of configs) {
            Logger.info(`- ${configId}`);
        }

        Logger.info('\nUse "bot load <id>" to load a configuration');
        Logger.divider();
    },

    loadBot(multiBotManager, args) {
        if (args.length < 1) {
            Logger.warn('Usage: bot load <id>');
            return;
        }

        const botId = args[0];

        const bot = multiBotManager.loadBot(botId);

        if (bot) {
            Logger.success(`Loaded bot with ID: ${botId}`);
            Logger.info(`Use 'bot switch ${botId}' to switch to this bot`);
        } else {
            Logger.error(`Failed to load bot with ID: ${botId}`);
        }
    }
};