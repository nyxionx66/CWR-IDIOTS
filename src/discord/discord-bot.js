import { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { Logger } from '../utils/logger.js';

export class DiscordBot {
    constructor(config) {
        this.config = config;
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.DirectMessages
            ],
            partials: [
                Partials.Channel,
                Partials.Message
            ]
        });

        this.logChannel = null;
        this.commandChannel = null;

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.on('ready', () => this.handleReady());
        this.client.on('messageCreate', (message) => this.handleMessage(message));
        this.client.on('error', (error) => this.handleError(error));
    }

    async start() {
        try {
            await this.client.login(this.config.discord.token);
            Logger.success('Discord bot connected successfully');
        } catch (error) {
            Logger.error(`Failed to connect Discord bot: ${error.message}`);
        }
    }

    async handleReady() {
        Logger.info(`Discord bot logged in as ${this.client.user.tag}`);

        // Set up log channel
        this.logChannel = await this.client.channels.fetch(this.config.discord.logChannelId);
        this.commandChannel = await this.client.channels.fetch(this.config.discord.commandChannelId);

        if (!this.logChannel) {
            Logger.error('Log channel not found!');
        }
        if (!this.commandChannel) {
            Logger.error('Command channel not found!');
        }
    }

    async handleMessage(message) {
        // Ignore bot messages
        if (message.author.bot) return;

        // Only process messages in the command channel
        if (message.channel.id !== this.config.discord.commandChannelId) return;

        // Process commands
        if (message.content.startsWith('!')) {
            await this.handleCommand(message);
        }
    }

    async handleCommand(message) {
        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        switch (command) {
            case 'configs':
                await this.listConfigs(message);
                break;
            case 'load':
                await this.loadConfig(message, args);
                break;
            case 'status':
                await this.showStatus(message);
                break;
            case 'help':
                await this.showHelp(message);
                break;
            default:
                await message.reply('Unknown command. Use !help to see available commands.');
        }
    }

    async listConfigs(message) {
        const configs = this.getAvailableConfigs();

        const embed = new EmbedBuilder()
            .setTitle('Available Bot Configurations')
            .setColor('#0099ff')
            .setDescription(configs.length > 0 ? configs.join('\n') : 'No configurations found');

        await message.reply({ embeds: [embed] });
    }

    async loadConfig(message, args) {
        if (args.length < 1) {
            await message.reply('Please specify a configuration name.');
            return;
        }

        const configName = args[0];
        await message.reply(`Loading configuration: ${configName}`);
    }

    async showStatus(message) {
        const embed = new EmbedBuilder()
            .setTitle('Bot Status')
            .setColor('#00ff00')
            .addFields(
                { name: 'Status', value: 'Online', inline: true },
                { name: 'Uptime', value: this.formatUptime(), inline: true }
            );

        await message.reply({ embeds: [embed] });
    }

    async showHelp(message) {
        const embed = new EmbedBuilder()
            .setTitle('Bot Commands')
            .setColor('#0099ff')
            .setDescription('Available commands:')
            .addFields(
                { name: '!configs', value: 'List available bot configurations' },
                { name: '!load <config>', value: 'Load a bot configuration' },
                { name: '!status', value: 'Show bot status' },
                { name: '!help', value: 'Show this help message' }
            );

        await message.reply({ embeds: [embed] });
    }

    handleError(error) {
        Logger.error(`Discord bot error: ${error.message}`);
    }

    async sendLog(message, type = 'info') {
        if (!this.logChannel) return;

        const colors = {
            info: '#0099ff',
            success: '#00ff00',
            warn: '#ffff00',
            error: '#ff0000',
            debug: '#808080'
        };

        const embed = new EmbedBuilder()
            .setDescription(message)
            .setColor(colors[type] || colors.info)
            .setTimestamp();

        try {
            await this.logChannel.send({ embeds: [embed] });
        } catch (error) {
            Logger.error(`Failed to send log to Discord: ${error.message}`);
        }
    }

    formatUptime() {
        const uptime = this.client.uptime;
        const seconds = Math.floor(uptime / 1000) % 60;
        const minutes = Math.floor(uptime / (1000 * 60)) % 60;
        const hours = Math.floor(uptime / (1000 * 60 * 60));

        return `${hours}h ${minutes}m ${seconds}s`;
    }

    getAvailableConfigs() {
        return ['default', 'mining', 'combat'];
    }
}