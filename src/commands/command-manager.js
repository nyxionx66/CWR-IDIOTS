import { Logger } from '../utils/logger.js';

export class CommandManager {
    constructor(bot, config) {
        this.bot = bot;
        this.config = config;
        this.commands = new Map();
        this.aliases = new Map();
    }

    /**
     * Register a command
     * @param {Object} command - Command object
     * @param {string} command.name - Command name
     * @param {string[]} command.aliases - Command aliases
     * @param {Function} command.execute - Command execution function
     * @param {string} command.description - Command description
     */
    registerCommand(command) {
        if (!command.name || typeof command.execute !== 'function') {
            Logger.warn('Invalid command format. Commands must have a name and execute function.');
            return false;
        }

        // Register the command
        this.commands.set(command.name.toLowerCase(), command);
        Logger.debug(`Registered command: ${command.name}`);

        // Register aliases if any
        if (Array.isArray(command.aliases)) {
            command.aliases.forEach(alias => {
                this.aliases.set(alias.toLowerCase(), command.name.toLowerCase());
                Logger.debug(`Registered alias: ${alias} -> ${command.name}`);
            });
        }

        return true;
    }

    /**
     * Execute a command
     * @param {string} input - Full command input
     * @returns {boolean} - Whether the command was executed
     */
    executeCommand(input) {
        const [commandName, ...args] = input.split(' ');

        if (!commandName) return false;

        // Check if it's a registered command
        let command = this.commands.get(commandName.toLowerCase());

        // If not found, check aliases
        if (!command) {
            const aliasedName = this.aliases.get(commandName.toLowerCase());
            if (aliasedName) {
                command = this.commands.get(aliasedName);
            }
        }

        // If still not found, check custom commands from config
        if (!command && this.config.customCommands && this.config.customCommands[commandName]) {
            try {
                if (this.bot.chat) {
                    this.bot.chat(this.config.customCommands[commandName]);
                    Logger.info(`Executed custom command: ${commandName} -> ${this.config.customCommands[commandName]}`);
                } else {
                    Logger.warn(`Cannot execute command: Bot chat function not available`);
                }
                return true;
            } catch (error) {
                Logger.error(`Error executing custom command ${commandName}: ${error.message}`);
                return false;
            }
        }

        // Execute the command if found
        if (command) {
            try {
                // Store the alias used to invoke the command
                command.usedAlias = commandName.toLowerCase();
                command.execute(this.bot, args, this.config);
                return true;
            } catch (error) {
                Logger.error(`Error executing command ${commandName}: ${error.message}`);
                return false;
            } finally {
                // Clean up the temporary property
                delete command.usedAlias;
            }
        }

        return false;
    }

    /**
     * Get all registered commands
     * @returns {Map} - Map of commands
     */
    getCommands() {
        return this.commands;
    }

    /**
     * Get a specific command
     * @param {string} name - Command name
     * @returns {Object|undefined} - Command object or undefined if not found
     */
    getCommand(name) {
        return this.commands.get(name.toLowerCase());
    }

    /**
     * Load all commands from the commands directory
     * @param {Array} commandModules - Array of command modules
     */
    loadCommands(commandModules) {
        // Clear existing commands and aliases
        this.clearCommands();

        // Load new commands
        for (const commandModule of commandModules) {
            try {
                this.registerCommand(commandModule);
            } catch (error) {
                Logger.error(`Failed to load command: ${error.message}`);
            }
        }

        Logger.info(`Loaded ${this.commands.size} commands with ${this.aliases.size} aliases`);
    }

    /**
     * Clear all registered commands and aliases
     */
    clearCommands() {
        const commandCount = this.commands.size;
        const aliasCount = this.aliases.size;

        this.commands.clear();
        this.aliases.clear();

        Logger.debug(`Cleared ${commandCount} commands and ${aliasCount} aliases`);
    }
}