import mineflayer from 'mineflayer';
import pathfinderPlugin from 'mineflayer-pathfinder';
import armorManager from 'mineflayer-armor-manager';
import { plugin as autoEatPlugin } from 'mineflayer-auto-eat';
import { plugin as collectBlockPlugin } from 'mineflayer-collectblock';
import { plugin as toolPlugin } from 'mineflayer-tool';
import { plugin as pvpPlugin } from 'mineflayer-pvp';
import minecraftData from 'minecraft-data';

import { ConfigManager } from '../utils/config-manager.js';
import { EventManager } from './event-manager.js';
import { PluginManager } from './plugin-manager.js';
import { CommandManager } from '../commands/command-manager.js';
import { PlannedCommandManager } from './planned-command-manager.js';
import { commands } from '../commands/index.js';
import { Logger } from '../utils/logger.js';
import { generateRandomUsername } from '../utils/name-generator.js';

export class HuminiBot {
  constructor(botId = 'default', customConfig = null) {
    this.botId = botId;
    this.configManager = new ConfigManager(botId);

    if (customConfig) {
      this.config = customConfig;
    } else {
      this.config = this.configManager.getConfig();
    }

    this.bot = null;
    this.eventManager = null;
    this.pluginManager = null;
    this.commandManager = null;
    this.plannedCommandManager = null;

    this.initialize();
  }

  initialize() {
    if (this.botId === 'default' || !this.config.quietMode) {
      Logger.info(`Initializing Humini bot ${this.botId}...`);
    }

    this.createBot();
    this.setupPlugins();
    this.setupEventSystem();
    this.setupCommandSystem();
    this.setupPlannedCommandSystem();
  }

  createBot() {
    const botConfig = this.config.bot;

    try {
      // Generate random username if enabled
      let username = botConfig.username;
      if (botConfig.useRandomUsername) {
        username = generateRandomUsername();
        Logger.info(`Using random username: ${username}`);
      }

      this.bot = mineflayer.createBot({
        host: botConfig.host,
        port: botConfig.port,
        username: username,
        version: botConfig.version,
        auth: 'offline',
        hideErrors: false,
        reconnect: true,
        chatLengthLimit: 100
      });

      this.bot.huminiConfig = this.config;
      this.bot.huminiBot = this;

      // Only log connection info for default bot or when not in quiet mode
      if (this.botId === 'default' || !this.config.quietMode) {
        Logger.info(`Bot ${this.botId} connecting to ${botConfig.host}:${botConfig.port} as ${username}`);
      }

      this.bot.on('error', (err) => {
        Logger.error(`Bot ${this.botId} connection error: ${err.message}`);
      });

      this.bot.on('end', () => {
        if (this.botId === 'default' || !this.config.quietMode) {
          Logger.warn(`Bot ${this.botId} connection ended, will attempt to reconnect...`);
        }
        setTimeout(() => {
          if (this.botId === 'default' || !this.config.quietMode) {
            Logger.info(`Bot ${this.botId} attempting to reconnect...`);
          }
          this.createBot();
        }, 5000);
      });
    } catch (error) {
      Logger.error(`Failed to create bot ${this.botId}: ${error.message}`);
      this.setupDummyBot();
    }
  }

  setupDummyBot() {
    this.bot = {
      chat: (message) => {
        if (this.botId === 'default' || !this.config.quietMode) {
          Logger.info(`[BOT ${this.botId}] ${message}`);
        }
      },
      huminiConfig: this.config,
      huminiBot: this
    };

    if (this.botId === 'default' || !this.config.quietMode) {
      Logger.warn(`Bot ${this.botId} running in console-only mode. Server connection failed.`);
    }
  }

  setupPlugins() {
    this.pluginManager = new PluginManager(this.bot, this.config);

    if (this.bot._client) {
      this.pluginManager.loadPlugin('pathfinder', pathfinderPlugin.pathfinder);
      this.pluginManager.loadPlugin('armorManager', armorManager);
      this.pluginManager.loadPlugin('autoEat', autoEatPlugin);
      this.pluginManager.loadPlugin('collectBlock', collectBlockPlugin);
      this.pluginManager.loadPlugin('tool', toolPlugin);
      this.pluginManager.loadPlugin('pvp', pvpPlugin);

      if (this.bot.pathfinder) {
        const mcData = minecraftData(this.bot.version);
        const { Movements } = pathfinderPlugin;
        const movements = new Movements(this.bot, mcData);
        this.bot.pathfinder.setMovements(movements);
      }
    } else if (this.botId === 'default' || !this.config.quietMode) {
      Logger.warn(`Bot ${this.botId} skipping plugin setup - bot is in console-only mode`);
    }
  }

  setupEventSystem() {
    if (this.bot._client) {
      this.eventManager = new EventManager(this.bot, this.config);
      this.eventManager.registerAllEvents();
      this.bot.eventManager = this.eventManager;
    } else if (this.botId === 'default' || !this.config.quietMode) {
      Logger.warn(`Bot ${this.botId} skipping event system setup - bot is in console-only mode`);
    }
  }

  setupCommandSystem() {
    this.commandManager = new CommandManager(this.bot, this.config);
    this.commandManager.loadCommands(commands);
    this.bot.commandManager = this.commandManager;

    if (this.botId === 'default' || !this.config.quietMode) {
      Logger.info(`Bot ${this.botId} command system initialized`);
    }
  }

  setupPlannedCommandSystem() {
    this.plannedCommandManager = new PlannedCommandManager(this.bot);
    this.bot.plannedCommandManager = this.plannedCommandManager;

    if (this.botId === 'default' || !this.config.quietMode) {
      Logger.info(`Bot ${this.botId} planned command system initialized`);
    }
  }

  reloadConfig() {
    this.config = this.configManager.reloadConfig();
    this.bot.huminiConfig = this.config;

    if (this.botId === 'default' || !this.config.quietMode) {
      Logger.info(`Bot ${this.botId} configuration reloaded`);
    }

    if (this.bot.autoEat) {
      this.bot.autoEat.options = this.config.autoEat;
    }

    return this.config;
  }

  async reloadCommands() {
    if (this.commandManager) {
      try {
        const commandsDir = path.join(__dirname, '../commands');
        const commandFiles = fs.readdirSync(commandsDir)
            .filter(file => file.endsWith('-command.js'))
            .map(file => path.join(commandsDir, file));

        const freshCommands = [];

        for (const filePath of commandFiles) {
          try {
            const fileUrl = `file://${filePath}?t=${Date.now()}`;
            const commandModule = await import(fileUrl);
            const command = commandModule.default;

            if (command && command.name && typeof command.execute === 'function') {
              freshCommands.push(command);
              if (this.botId === 'default' || !this.config.quietMode) {
                Logger.debug(`Bot ${this.botId} loaded command: ${command.name}`);
              }
            }
          } catch (error) {
            Logger.error(`Bot ${this.botId} error loading command file ${path.basename(filePath)}: ${error.message}`);
          }
        }

        this.commandManager.loadCommands(freshCommands);

        if (this.botId === 'default' || !this.config.quietMode) {
          Logger.success(`Bot ${this.botId} reloaded ${this.commandManager.getCommands().size} commands`);
        }

        return true;
      } catch (error) {
        Logger.error(`Bot ${this.botId} failed to reload commands: ${error.message}`);
        return false;
      }
    }

    Logger.error(`Bot ${this.botId} cannot reload commands: Command manager not available`);
    return false;
  }
}