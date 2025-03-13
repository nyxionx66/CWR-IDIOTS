import { Logger } from '../utils/logger.js';
import schedule from 'node-schedule';

export class PlannedCommandManager {
    constructor(bot) {
        this.bot = bot;
        this.scheduledCommands = new Map();
        this.tickBasedCommands = new Map();
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
     * Schedule a command to run at specific intervals
     * @param {string} id - Unique identifier for the command
     * @param {string} command - Command to execute
     * @param {Object} options - Scheduling options
     * @param {number} [options.ticks] - Run every X ticks
     * @param {string} [options.cron] - Cron expression for scheduling
     * @param {Date} [options.date] - Specific date/time to run
     * @param {number} [options.delay] - Delay in milliseconds
     * @param {boolean} [options.repeat] - Whether to repeat the command
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

        if (options.ticks) {
            // Tick-based scheduling
            this.tickBasedCommands.set(id, {
                ...commandObj,
                interval: options.ticks
            });
            Logger.info(`Scheduled command "${id}" to run every ${options.ticks} ticks`);
        } else if (options.cron) {
            // Cron-based scheduling
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
     * Cancel a scheduled command
     * @param {string} id - Command ID to cancel
     */
    cancelCommand(id) {
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
                Logger.debug(`Executed scheduled command: ${commandObj.id}`);
            } else {
                Logger.warn(`Cannot execute command: Command manager not available`);
            }
        } catch (error) {
            Logger.error(`Failed to execute scheduled command ${commandObj.id}: ${error.message}`);
        }
    }

    /**
     * Get all scheduled commands
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

        this.isRunning = false;
        Logger.debug('Planned command manager cleaned up');
    }
}