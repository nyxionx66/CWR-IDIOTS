import { Logger } from '../utils/logger.js';
import schedule from 'node-schedule';
import cron from 'node-cron';

export class PlannedCommandManager {
    constructor(bot) {
        this.bot = bot;
        this.scheduledCommands = new Map();
        this.tickBasedCommands = new Map();
        this.sequences = new Map();
        this.tickCount = 0;
        this.tickInterval = 50; // Minecraft tick is 50ms
        this.isRunning = false;
        this.tickTimer = null;

        this.setupTickSystem();
    }

    setupTickSystem() {
        if (this.isRunning) return;

        this.tickTimer = setInterval(() => {
            this.tick();
        }, this.tickInterval);

        this.isRunning = true;
        Logger.debug('Tick system initialized');
    }

    tick() {
        this.tickCount++;

        // Execute tick-based commands
        for (const [id, command] of this.tickBasedCommands.entries()) {
            if (this.tickCount % command.interval === 0) {
                this.executeCommand(command);
            }
        }
    }

    /**
     * Schedule a command or sequence to run
     * @param {string} id - Unique identifier for the command
     * @param {string|Array} command - Command(s) to execute
     * @param {Object} options - Scheduling options
     */
    scheduleCommand(id, command, options = {}) {
        if (!id || !command) {
            Logger.warn('Command ID and command are required');
            return false;
        }

        // Cancel any existing schedule with this ID
        this.cancelCommand(id);

        const commandObj = {
            id,
            command,
            options,
            createdAt: Date.now()
        };

        // Handle command sequences
        if (Array.isArray(command)) {
            return this.scheduleSequence(id, command, options);
        }

        if (options.ticks) {
            // Tick-based scheduling
            this.tickBasedCommands.set(id, {
                ...commandObj,
                interval: options.ticks
            });
            Logger.info(`Scheduled command "${id}" to run every ${options.ticks} ticks`);
        } else if (options.cron) {
            // Cron-based scheduling
            if (!cron.validate(options.cron)) {
                Logger.warn(`Invalid cron expression: ${options.cron}`);
                return false;
            }

            const job = schedule.scheduleJob(options.cron, () => {
                this.executeCommand(commandObj);
                if (!options.repeat) {
                    this.cancelCommand(id);
                }
            });
            this.scheduledCommands.set(id, { ...commandObj, job });
            Logger.info(`Scheduled command "${id}" with cron: ${options.cron}`);
        } else if (options.date) {
            // Date-based scheduling
            const job = schedule.scheduleJob(options.date, () => {
                this.executeCommand(commandObj);
                this.cancelCommand(id);
            });
            this.scheduledCommands.set(id, { ...commandObj, job });
            Logger.info(`Scheduled command "${id}" for: ${options.date}`);
        } else if (options.delay) {
            // Delay-based scheduling
            const timeout = setTimeout(() => {
                this.executeCommand(commandObj);
                if (!options.repeat) {
                    this.cancelCommand(id);
                }
            }, options.delay);
            this.scheduledCommands.set(id, { ...commandObj, timeout });
            Logger.info(`Scheduled command "${id}" with ${options.delay}ms delay`);
        } else {
            Logger.warn('Invalid scheduling options provided');
            return false;
        }

        return true;
    }

    /**
     * Schedule a sequence of commands
     * @param {string} id - Sequence identifier
     * @param {Array} commands - Array of command objects
     * @param {Object} options - Scheduling options
     */
    scheduleSequence(id, commands, options = {}) {
        if (!Array.isArray(commands) || commands.length === 0) {
            Logger.warn('Invalid command sequence');
            return false;
        }

        const sequence = {
            id,
            commands: commands.map((cmd, index) => ({
                command: typeof cmd === 'string' ? cmd : cmd.command,
                delay: typeof cmd === 'string' ? (index * 1000) : (cmd.delay || index * 1000)
            })),
            options,
            currentIndex: 0,
            isRunning: false
        };

        this.sequences.set(id, sequence);

        // Schedule the start of the sequence
        if (options.cron) {
            const job = schedule.scheduleJob(options.cron, () => {
                this.executeSequence(id);
            });
            this.scheduledCommands.set(id, { id, job, type: 'sequence' });
        } else if (options.date) {
            const job = schedule.scheduleJob(options.date, () => {
                this.executeSequence(id);
            });
            this.scheduledCommands.set(id, { id, job, type: 'sequence' });
        } else if (options.delay) {
            const timeout = setTimeout(() => {
                this.executeSequence(id);
            }, options.delay);
            this.scheduledCommands.set(id, { id, timeout, type: 'sequence' });
        } else {
            // Start immediately if no timing options
            this.executeSequence(id);
        }

        Logger.info(`Scheduled command sequence "${id}" with ${commands.length} commands`);
        return true;
    }

    /**
     * Execute a sequence of commands
     * @param {string} id - Sequence identifier
     */
    async executeSequence(id) {
        const sequence = this.sequences.get(id);
        if (!sequence || sequence.isRunning) return;

        sequence.isRunning = true;
        sequence.currentIndex = 0;

        for (const cmd of sequence.commands) {
            if (!sequence.isRunning) break; // Check if sequence was cancelled

            // Wait for the specified delay
            if (cmd.delay > 0) {
                await new Promise(resolve => setTimeout(resolve, cmd.delay));
            }

            // Execute the command
            this.executeCommand({ command: cmd.command });
            sequence.currentIndex++;
        }

        sequence.isRunning = false;

        // Handle repeat option
        if (sequence.options.repeat) {
            // Schedule the next run
            const delay = sequence.options.repeatDelay || 1000;
            setTimeout(() => this.executeSequence(id), delay);
        } else {
            this.sequences.delete(id);
        }
    }

    /**
     * Cancel a scheduled command or sequence
     * @param {string} id - Command ID to cancel
     */
    cancelCommand(id) {
        // Check sequences
        if (this.sequences.has(id)) {
            const sequence = this.sequences.get(id);
            sequence.isRunning = false;
            this.sequences.delete(id);
            Logger.info(`Cancelled sequence: ${id}`);
            return true;
        }

        // Check tick-based commands
        if (this.tickBasedCommands.has(id)) {
            this.tickBasedCommands.delete(id);
            Logger.info(`Cancelled tick-based command: ${id}`);
            return true;
        }

        // Check scheduled commands
        const scheduled = this.scheduledCommands.get(id);
        if (scheduled) {
            if (scheduled.job) {
                scheduled.job.cancel();
            }
            if (scheduled.timeout) {
                clearTimeout(scheduled.timeout);
            }
            this.scheduledCommands.delete(id);
            Logger.info(`Cancelled scheduled command: ${id}`);
            return true;
        }

        return false;
    }

    /**
     * Execute a command
     * @param {Object} commandObj - Command object to execute
     */
    executeCommand(commandObj) {
        try {
            if (this.bot.commandManager) {
                this.bot.commandManager.executeCommand(commandObj.command);
                Logger.debug(`Executed scheduled command: ${commandObj.id || commandObj.command}`);
            } else {
                Logger.warn(`Cannot execute command: Command manager not available`);
            }
        } catch (error) {
            Logger.error(`Failed to execute scheduled command ${commandObj.id || ''}: ${error.message}`);
        }
    }

    /**
     * Get all scheduled commands and sequences
     * @returns {Object} - Object containing all scheduled commands
     */
    getScheduledCommands() {
        const commands = {
            tickBased: Array.from(this.tickBasedCommands.entries()).map(([id, cmd]) => ({
                id,
                command: cmd.command,
                interval: cmd.interval,
                type: 'tick'
            })),
            scheduled: Array.from(this.scheduledCommands.entries()).map(([id, cmd]) => ({
                id,
                command: cmd.command,
                options: cmd.options,
                createdAt: cmd.createdAt,
                type: cmd.job ? 'cron' : 'delay'
            })),
            sequences: Array.from(this.sequences.entries()).map(([id, seq]) => ({
                id,
                commands: seq.commands,
                currentIndex: seq.currentIndex,
                isRunning: seq.isRunning,
                options: seq.options
            }))
        };

        return commands;
    }

    /**
     * Stop the tick system and clean up
     */
    cleanup() {
        if (this.tickTimer) {
            clearInterval(this.tickTimer);
            this.tickTimer = null;
        }

        // Cancel all scheduled commands
        for (const id of this.scheduledCommands.keys()) {
            this.cancelCommand(id);
        }

        // Clear tick-based commands
        this.tickBasedCommands.clear();

        // Clear sequences
        this.sequences.clear();

        this.isRunning = false;
        Logger.debug('Planned command manager cleaned up');
    }
}