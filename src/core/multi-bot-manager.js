import { HuminiBot } from './bot.js';
import { Logger } from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class MultiBotManager {
    constructor() {
        this.bots = new Map();
        this.configsDir = path.join(__dirname, '../../configs');
        this.activeBot = null;

        // Ensure configs directory exists
        this.ensureConfigsDirectory();
    }

    ensureConfigsDirectory() {
        if (!fs.existsSync(this.configsDir)) {
            try {
                fs.mkdirSync(this.configsDir, { recursive: true });
                Logger.info(`Created configs directory at ${this.configsDir}`);
            } catch (error) {
                Logger.error(`Failed to create configs directory: ${error.message}`);
            }
        }
    }

    createBot(botId, config, isMassBot = false) {
        if (this.bots.has(botId)) {
            Logger.warn(`Bot with ID ${botId} already exists. Use a different ID.`);
            return null;
        }

        try {
            // Save the config to a file
            this.saveConfig(botId, config);

            // Set quiet mode for mass bots
            if (isMassBot) {
                config.quietMode = true;
            }

            // Create a new bot instance with the config
            const bot = new HuminiBot(botId, config);

            // Store the bot
            this.bots.set(botId, bot);

            // Set as active bot if it's the first one and not a mass bot
            if (this.bots.size === 1 && !isMassBot) {
                this.activeBot = botId;
            }

            if (!isMassBot) {
                Logger.success(`Created bot with ID: ${botId}`);
            }
            return bot;
        } catch (error) {
            Logger.error(`Failed to create bot ${botId}: ${error.message}`);
            return null;
        }
    }

    getBot(botId) {
        return this.bots.get(botId) || null;
    }

    getActiveBot() {
        if (!this.activeBot) return null;
        return this.bots.get(this.activeBot) || null;
    }

    setActiveBot(botId) {
        if (!this.bots.has(botId)) {
            Logger.warn(`Cannot set active bot: Bot with ID ${botId} not found`);
            return false;
        }

        this.activeBot = botId;
        Logger.info(`Active bot set to: ${botId}`);
        return true;
    }

    removeBot(botId) {
        if (!this.bots.has(botId)) {
            Logger.warn(`Cannot remove bot: Bot with ID ${botId} not found`);
            return false;
        }

        const bot = this.bots.get(botId);

        if (bot.bot && bot.bot.quit) {
            try {
                bot.bot.quit();
            } catch (error) {
                Logger.debug(`Error disconnecting bot ${botId}: ${error.message}`);
            }
        }

        this.bots.delete(botId);

        if (this.activeBot === botId) {
            this.activeBot = this.bots.size > 0 ? Array.from(this.bots.keys())[0] : null;

            if (this.activeBot) {
                Logger.info(`Active bot set to: ${this.activeBot}`);
            } else {
                Logger.info('No active bot remaining');
            }
        }

        Logger.success(`Removed bot with ID: ${botId}`);
        return true;
    }

    getAllBotIds() {
        return Array.from(this.bots.keys());
    }

    getBotCount() {
        return this.bots.size;
    }

    saveConfig(botId, config) {
        try {
            const configPath = path.join(this.configsDir, `${botId}.json`);
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
            return true;
        } catch (error) {
            Logger.error(`Failed to save configuration for bot ${botId}: ${error.message}`);
            return false;
        }
    }

    loadConfig(botId) {
        try {
            const configPath = path.join(this.configsDir, `${botId}.json`);

            if (!fs.existsSync(configPath)) {
                Logger.warn(`Configuration file for bot ${botId} not found`);
                return null;
            }

            const configData = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            Logger.error(`Failed to load configuration for bot ${botId}: ${error.message}`);
            return null;
        }
    }

    getAvailableConfigs() {
        try {
            const files = fs.readdirSync(this.configsDir);
            return files
                .filter(file => file.endsWith('.json'))
                .map(file => path.basename(file, '.json'));
        } catch (error) {
            Logger.error(`Failed to get available configurations: ${error.message}`);
            return [];
        }
    }

    loadBot(botId) {
        const config = this.loadConfig(botId);

        if (!config) {
            return null;
        }

        return this.createBot(botId, config);
    }

    executeCommand(botId, command) {
        const bot = this.bots.get(botId);

        if (!bot) {
            Logger.warn(`Cannot execute command: Bot with ID ${botId} not found`);
            return false;
        }

        if (!bot.commandManager) {
            Logger.warn(`Cannot execute command: Command manager not available for bot ${botId}`);
            return false;
        }

        return bot.commandManager.executeCommand(command);
    }

    executeCommandOnAll(command) {
        const results = {};

        for (const [botId, bot] of this.bots.entries()) {
            if (bot.commandManager) {
                results[botId] = bot.commandManager.executeCommand(command);
            } else {
                results[botId] = false;
            }
        }

        return results;
    }
}