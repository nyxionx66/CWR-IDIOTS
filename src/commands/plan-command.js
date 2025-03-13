import { Logger } from '../utils/logger.js';

export default {
    name: 'plan',
    aliases: ['schedule', 'planned'],
    description: 'Schedule commands to run at specific times or intervals',

    execute(bot, args, config) {
        if (!args.length || args[0] === 'help') {
            this.showHelp();
            return;
        }

        const subCommand = args[0].toLowerCase();

        if (!bot.plannedCommandManager) {
            Logger.error('Planned command manager not available');
            return;
        }

        switch (subCommand) {
            case 'list':
                this.listCommands(bot);
                break;
            case 'add':
            case 'schedule':
                this.scheduleCommand(bot, args.slice(1));
                break;
            case 'cancel':
            case 'remove':
                this.cancelCommand(bot, args.slice(1));
                break;
            default:
                Logger.warn(`Unknown subcommand: ${subCommand}`);
                this.showHelp();
        }
    },

    showHelp() {
        Logger.divider();
        Logger.info('Planned Command Usage:');
        Logger.info('plan list                    - List all scheduled commands');
        Logger.info('plan add <id> <command> [options] - Schedule a new command');
        Logger.info('plan cancel <id>             - Cancel a scheduled command');
        Logger.info('\nScheduling Options:');
        Logger.info('--ticks <number>    Run every X ticks');
        Logger.info('--cron "<expression>" Run using cron schedule');
        Logger.info('--delay <ms>        Run after delay in milliseconds');
        Logger.info('--repeat            Repeat the command');
        Logger.info('\nExamples:');
        Logger.info('plan add jump "jump" --ticks 40');
        Logger.info('plan add feed "eat" --delay 5000 --repeat');
        Logger.info('plan add daily "say Good morning!" --cron "0 8 * * *"');
        Logger.divider();
    },

    listCommands(bot) {
        const commands = bot.plannedCommandManager.getScheduledCommands();

        if (commands.tickBased.length === 0 && commands.scheduled.length === 0) {
            Logger.info('No commands currently scheduled');
            return;
        }

        Logger.divider();
        Logger.info('Scheduled Commands:');

        if (commands.tickBased.length > 0) {
            Logger.info('\nTick-based Commands:');
            for (const cmd of commands.tickBased) {
                Logger.info(`${cmd.id.padEnd(15)} - Every ${cmd.interval} ticks: ${cmd.command}`);
            }
        }

        if (commands.scheduled.length > 0) {
            Logger.info('\nTime-based Commands:');
            for (const cmd of commands.scheduled) {
                const scheduleInfo = cmd.options.cron || `${cmd.options.delay}ms delay`;
                Logger.info(`${cmd.id.padEnd(15)} - ${scheduleInfo}: ${cmd.command}`);
            }
        }

        Logger.divider();
    },

    scheduleCommand(bot, args) {
        if (args.length < 2) {
            Logger.warn('Usage: plan add <id> <command> [options]');
            return;
        }

        const id = args[0];
        let command = '';
        const options = {};
        let inQuotes = false;
        let currentQuote = '';

        // Parse command and options
        for (let i = 1; i < args.length; i++) {
            const arg = args[i];

            if (arg.startsWith('"')) {
                inQuotes = true;
                currentQuote = arg.slice(1);
            } else if (inQuotes) {
                currentQuote += ' ' + arg;
                if (arg.endsWith('"')) {
                    inQuotes = false;
                    if (!command) {
                        command = currentQuote.slice(0, -1);
                    } else if (arg.startsWith('--cron')) {
                        options.cron = currentQuote.slice(0, -1);
                    }
                    currentQuote = '';
                }
            } else if (arg.startsWith('--')) {
                const option = arg.slice(2);
                switch (option) {
                    case 'ticks':
                        options.ticks = parseInt(args[++i]);
                        break;
                    case 'delay':
                        options.delay = parseInt(args[++i]);
                        break;
                    case 'repeat':
                        options.repeat = true;
                        break;
                    case 'cron':
                        if (args[i + 1].startsWith('"')) {
                            i++;
                            inQuotes = true;
                            currentQuote = args[i].slice(1);
                        } else {
                            options.cron = args[++i];
                        }
                        break;
                }
            } else if (!command) {
                command = arg;
            }
        }

        if (!command) {
            Logger.warn('No command specified');
            return;
        }

        if (Object.keys(options).length === 0) {
            Logger.warn('No scheduling options specified');
            return;
        }

        if (bot.plannedCommandManager.scheduleCommand(id, command, options)) {
            Logger.success(`Scheduled command "${id}": ${command}`);
        }
    },

    cancelCommand(bot, args) {
        if (args.length < 1) {
            Logger.warn('Usage: plan cancel <id>');
            return;
        }

        const id = args[0];

        if (bot.plannedCommandManager.cancelCommand(id)) {
            Logger.success(`Cancelled scheduled command: ${id}`);
        } else {
            Logger.warn(`No scheduled command found with ID: ${id}`);
        }
    }
};