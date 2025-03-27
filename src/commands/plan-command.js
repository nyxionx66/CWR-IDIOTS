import { Logger } from '../utils/logger.js';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
            case 'sequence':
            case 'seq':
                this.scheduleSequence(bot, args.slice(1));
                break;
            case 'cancel':
            case 'remove':
                this.cancelCommand(bot, args.slice(1));
                break;
            case 'status':
                this.showStatus(bot);
                break;
            case 'save':
                this.savePlan(bot, args.slice(1));
                break;
            case 'load':
                this.loadPlan(bot, args.slice(1));
                break;
            case 'plans':
                this.listPlans(bot);
                break;
            case 'delete':
                this.deletePlan(bot, args.slice(1));
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
        Logger.info('plan sequence <id> <commands...>  - Schedule a sequence of commands');
        Logger.info('plan cancel <id>             - Cancel a scheduled command');
        Logger.info('plan status                  - Show running commands status');
        Logger.info('plan save <name>             - Save current plans to a file');
        Logger.info('plan load <name>             - Load plans from a file');
        Logger.info('plan plans                   - List all saved plans');
        Logger.info('plan delete <name>           - Delete a saved plan');
        Logger.info('\nScheduling Options:');
        Logger.info('--ticks <number>    Run every X ticks');
        Logger.info('--cron "<expression>" Run using cron schedule');
        Logger.info('--delay <ms>        Run after delay in milliseconds');
        Logger.info('--repeat            Repeat the command');
        Logger.info('--date "<date>"     Run at specific date/time');
        Logger.info('\nSequence Options:');
        Logger.info('--delay <ms>        Delay between commands');
        Logger.info('--repeat            Repeat the sequence');
        Logger.info('--total <number>    Total times to repeat');
        Logger.info('\nExamples:');
        Logger.info('plan add jump "jump" --ticks 40');
        Logger.info('plan add feed "eat" --delay 5000 --repeat');
        Logger.info('plan add daily "say Good morning!" --cron "0 8 * * *"');
        Logger.info('plan sequence login "rg" 2000 "lg" 1000 "d"');
        Logger.info('plan save myplan');
        Logger.divider();
    },

    getPlansDirectory() {
        const plansDir = path.join(__dirname, '../../plans');
        if (!fs.existsSync(plansDir)) {
            fs.mkdirSync(plansDir, { recursive: true });
        }
        return plansDir;
    },

    savePlan(bot, args) {
        if (args.length < 1) {
            Logger.warn('Usage: plan save <name>');
            return;
        }

        const planName = args[0];
        const plansDir = this.getPlansDirectory();
        const planPath = path.join(plansDir, `${planName}.json`);

        try {
            const currentPlans = bot.plannedCommandManager.getScheduledCommands();
            const planData = {
                name: planName,
                savedAt: new Date().toISOString(),
                tickBased: currentPlans.tickBased,
                scheduled: currentPlans.scheduled.map(cmd => ({
                    ...cmd,
                    job: undefined, // Remove non-serializable job object
                    timeout: undefined // Remove non-serializable timeout object
                })),
                sequences: currentPlans.sequences
            };

            fs.writeFileSync(planPath, JSON.stringify(planData, null, 2));
            Logger.success(`Saved current plans to: ${planName}`);
        } catch (error) {
            Logger.error(`Failed to save plan: ${error.message}`);
        }
    },

    loadPlan(bot, args) {
        if (args.length < 1) {
            Logger.warn('Usage: plan load <name>');
            return;
        }

        const planName = args[0];
        const plansDir = this.getPlansDirectory();
        const planPath = path.join(plansDir, `${planName}.json`);

        try {
            if (!fs.existsSync(planPath)) {
                Logger.warn(`Plan not found: ${planName}`);
                return;
            }

            const planData = JSON.parse(fs.readFileSync(planPath, 'utf8'));

            // Cancel all current plans
            const currentPlans = bot.plannedCommandManager.getScheduledCommands();
            [...currentPlans.tickBased, ...currentPlans.scheduled, ...currentPlans.sequences]
                .forEach(cmd => bot.plannedCommandManager.cancelCommand(cmd.id));

            // Load tick-based commands
            planData.tickBased.forEach(cmd => {
                bot.plannedCommandManager.scheduleCommand(cmd.id, cmd.command, { ticks: cmd.interval });
            });

            // Load scheduled commands
            planData.scheduled.forEach(cmd => {
                bot.plannedCommandManager.scheduleCommand(cmd.id, cmd.command, cmd.options);
            });

            // Load sequences
            planData.sequences.forEach(seq => {
                bot.plannedCommandManager.scheduleCommand(seq.id, seq.commands, seq.options);
            });

            Logger.success(`Loaded plan: ${planName}`);
            this.listCommands(bot);
        } catch (error) {
            Logger.error(`Failed to load plan: ${error.message}`);
        }
    },

    listPlans(bot) {
        const plansDir = this.getPlansDirectory();

        try {
            const plans = fs.readdirSync(plansDir)
                .filter(file => file.endsWith('.json'))
                .map(file => {
                    const planPath = path.join(plansDir, file);
                    const planData = JSON.parse(fs.readFileSync(planPath, 'utf8'));
                    return {
                        name: planData.name,
                        savedAt: new Date(planData.savedAt),
                        commands: planData.tickBased.length +
                            planData.scheduled.length +
                            planData.sequences.length
                    };
                });

            if (plans.length === 0) {
                Logger.info('No saved plans found');
                return;
            }

            Logger.divider();
            Logger.info('Saved Plans:');
            plans.forEach(plan => {
                Logger.info(`${plan.name.padEnd(20)} - ${plan.commands} commands (Saved: ${plan.savedAt.toLocaleString()})`);
            });
            Logger.divider();
        } catch (error) {
            Logger.error(`Failed to list plans: ${error.message}`);
        }
    },

    deletePlan(bot, args) {
        if (args.length < 1) {
            Logger.warn('Usage: plan delete <name>');
            return;
        }

        const planName = args[0];
        const plansDir = this.getPlansDirectory();
        const planPath = path.join(plansDir, `${planName}.json`);

        try {
            if (!fs.existsSync(planPath)) {
                Logger.warn(`Plan not found: ${planName}`);
                return;
            }

            fs.unlinkSync(planPath);
            Logger.success(`Deleted plan: ${planName}`);
        } catch (error) {
            Logger.error(`Failed to delete plan: ${error.message}`);
        }
    },

    listCommands(bot) {
        const commands = bot.plannedCommandManager.getScheduledCommands();

        if (commands.tickBased.length === 0 &&
            commands.scheduled.length === 0 &&
            commands.sequences.length === 0) {
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
                const scheduleInfo = cmd.options.cron ||
                    (cmd.options.date ? new Date(cmd.options.date).toLocaleString() :
                        `${cmd.options.delay}ms delay`);
                Logger.info(`${cmd.id.padEnd(15)} - ${scheduleInfo}: ${cmd.command}`);
            }
        }

        if (commands.sequences.length > 0) {
            Logger.info('\nCommand Sequences:');
            for (const seq of commands.sequences) {
                const status = seq.isRunning ? 'Running' : 'Waiting';
                const progress = seq.commands.length > 0 ?
                    `${seq.currentIndex}/${seq.commands.length}` : '0/0';
                Logger.info(`${seq.id.padEnd(15)} - ${status} (${progress} commands)`);
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
                    } else if (arg.startsWith('--date')) {
                        options.date = new Date(currentQuote.slice(0, -1));
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
                    case 'date':
                        if (args[i + 1].startsWith('"')) {
                            i++;
                            inQuotes = true;
                            currentQuote = args[i].slice(1);
                        } else {
                            options.date = new Date(args[++i]);
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

        // Validate cron expression if provided
        if (options.cron && !cron.validate(options.cron)) {
            Logger.warn('Invalid cron expression');
            return;
        }

        if (bot.plannedCommandManager.scheduleCommand(id, command, options)) {
            Logger.success(`Scheduled command "${id}": ${command}`);
        }
    },

    scheduleSequence(bot, args) {
        if (args.length < 3) {
            Logger.warn('Usage: plan sequence <id> <command1> <delay1> <command2> [delay2] ...');
            return;
        }

        const id = args[0];
        const sequence = [];
        const options = {};
        let currentCommand = null;

        // Parse sequence and options
        for (let i = 1; i < args.length; i++) {
            const arg = args[i];

            if (arg.startsWith('--')) {
                const option = arg.slice(2);
                switch (option) {
                    case 'delay':
                        options.delay = parseInt(args[++i]);
                        break;
                    case 'repeat':
                        options.repeat = true;
                        break;
                    case 'total':
                        options.total = parseInt(args[++i]);
                        break;
                }
            } else if (!isNaN(parseInt(arg))) {
                // This is a delay
                if (currentCommand) {
                    sequence.push({
                        command: currentCommand,
                        delay: parseInt(arg)
                    });
                    currentCommand = null;
                }
            } else {
                // This is a command
                if (currentCommand) {
                    sequence.push({
                        command: currentCommand,
                        delay: 1000 // Default delay
                    });
                }
                currentCommand = arg;
            }
        }

        // Add the last command if exists
        if (currentCommand) {
            sequence.push({
                command: currentCommand,
                delay: 1000 // Default delay
            });
        }

        if (sequence.length === 0) {
            Logger.warn('No commands specified in sequence');
            return;
        }

        if (bot.plannedCommandManager.scheduleCommand(id, sequence, options)) {
            Logger.success(`Scheduled sequence "${id}" with ${sequence.length} commands`);
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
    },

    showStatus(bot) {
        const commands = bot.plannedCommandManager.getScheduledCommands();

        Logger.divider();
        Logger.info('Command Scheduler Status:');
        Logger.info(`Active tick-based commands: ${commands.tickBased.length}`);
        Logger.info(`Active scheduled commands: ${commands.scheduled.length}`);
        Logger.info(`Active sequences: ${commands.sequences.length}`);

        if (commands.sequences.length > 0) {
            Logger.info('\nRunning Sequences:');
            for (const seq of commands.sequences) {
                if (seq.isRunning) {
                    Logger.info(`${seq.id}: Command ${seq.currentIndex + 1}/${seq.commands.length}`);
                }
            }
        }

        Logger.divider();
    }
};