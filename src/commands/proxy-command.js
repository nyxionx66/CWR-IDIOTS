import { Logger } from '../utils/logger.js';

export default {
    name: 'proxy',
    aliases: ['proxies', 'ip'],
    description: 'Manage proxy settings for IP rotation',

    execute(bot, args, config) {
        if (!args.length || args[0] === 'help') {
            this.showHelp();
            return;
        }

        const subCommand = args[0].toLowerCase();

        switch (subCommand) {
            case 'list':
                this.listProxies(bot);
                break;
            case 'add':
                this.addProxy(bot, args.slice(1), config);
                break;
            case 'remove':
            case 'delete':
                this.removeProxy(bot, args.slice(1), config);
                break;
            case 'test':
                this.testProxies(bot, args.slice(1));
                break;
            case 'rotate':
                this.rotateProxy(bot);
                break;
            case 'current':
                this.showCurrentProxy(bot);
                break;
            case 'interval':
                this.setRotationInterval(bot, args.slice(1), config);
                break;
            case 'type':
                this.setProxyType(bot, args.slice(1), config);
                break;
            default:
                Logger.warn(`Unknown subcommand: ${subCommand}`);
                this.showHelp();
        }
    },

    showHelp() {
        Logger.divider();
        Logger.info('Proxy Command Usage:');
        Logger.info('proxy list                - List all configured proxies');
        Logger.info('proxy add <host:port:user:pass> - Add a new proxy');
        Logger.info('proxy remove <host:port>  - Remove a proxy');
        Logger.info('proxy test [all]          - Test current or all proxies');
        Logger.info('proxy rotate              - Rotate to next proxy');
        Logger.info('proxy current             - Show current proxy');
        Logger.info('proxy interval <minutes>  - Set rotation interval');
        Logger.info('proxy type <http|socks4|socks5> - Set proxy type');
        Logger.divider();
    },

    listProxies(bot) {
        if (!bot.proxyManager) {
            Logger.error('Proxy manager not available');
            return;
        }

        const proxies = bot.proxyManager.getAllProxies();

        if (proxies.length === 0) {
            Logger.info('No proxies configured.');
            return;
        }

        Logger.divider();
        Logger.info(`Configured Proxies (${proxies.length}):`);

        for (let i = 0; i < proxies.length; i++) {
            const proxy = proxies[i];
            const current = i === bot.proxyManager.currentProxyIndex ? '(current) ' : '';
            const status = proxy.working ? 'working' : 'not working';
            const auth = proxy.username ? `${proxy.username}:***` : 'no auth';

            Logger.info(`${i + 1}. ${current}${proxy.host}:${proxy.port} - ${proxy.type} - ${auth} - ${status}`);
        }

        Logger.divider();
    },

    addProxy(bot, args, config) {
        if (args.length < 1) {
            Logger.warn('Usage: proxy add <host:port:username:password>');
            return;
        }

        const proxyString = args[0];

        if (!bot.proxyManager) {
            Logger.error('Proxy manager not available');
            return;
        }

        if (bot.proxyManager.addProxy(proxyString)) {
            // Update config if possible
            if (bot.huminiBot && bot.huminiBot.configManager) {
                const configManager = bot.huminiBot.configManager;

                // Ensure proxy section exists in config
                if (!config.proxy) {
                    config.proxy = {
                        proxies: []
                    };
                }

                if (!config.proxy.proxies) {
                    config.proxy.proxies = [];
                }

                // Add to config
                config.proxy.proxies.push(proxyString);

                // Save config
                if (configManager.updateConfig(config)) {
                    Logger.success('Proxy added and saved to config');
                } else {
                    Logger.warn('Proxy added but failed to save to config');
                }
            } else {
                Logger.success('Proxy added (not saved to config)');
            }
        } else {
            Logger.error('Failed to add proxy');
        }
    },

    removeProxy(bot, args, config) {
        if (args.length < 1) {
            Logger.warn('Usage: proxy remove <host:port>');
            return;
        }

        if (!bot.proxyManager) {
            Logger.error('Proxy manager not available');
            return;
        }

        const hostPort = args[0].split(':');
        if (hostPort.length < 2) {
            Logger.warn('Invalid format. Use: host:port');
            return;
        }

        const host = hostPort[0];
        const port = parseInt(hostPort[1]);

        if (bot.proxyManager.removeProxy(host, port)) {
            // Update config if possible
            if (bot.huminiBot && bot.huminiBot.configManager) {
                const configManager = bot.huminiBot.configManager;

                if (config.proxy && config.proxy.proxies) {
                    // Remove from config
                    config.proxy.proxies = config.proxy.proxies.filter(proxy => {
                        const parts = proxy.split(':');
                        return !(parts[0] === host && parseInt(parts[1]) === port);
                    });

                    // Save config
                    if (configManager.updateConfig(config)) {
                        Logger.success('Proxy removed and config updated');
                    } else {
                        Logger.warn('Proxy removed but failed to update config');
                    }
                }
            } else {
                Logger.success('Proxy removed (not saved to config)');
            }
        } else {
            Logger.error(`Proxy ${host}:${port} not found`);
        }
    },

    async testProxies(bot, args) {
        if (!bot.proxyManager) {
            Logger.error('Proxy manager not available');
            return;
        }

        const testAll = args[0] === 'all';

        if (testAll) {
            Logger.info('Testing all proxies...');
            const workingCount = await bot.proxyManager.testAllProxies();
            Logger.success(`Proxy testing complete: ${workingCount} working proxies`);
        } else {
            const proxy = bot.proxyManager.getCurrentProxy();

            if (!proxy) {
                Logger.warn('No current proxy to test');
                return;
            }

            Logger.info(`Testing current proxy ${proxy.host}:${proxy.port}...`);
            const working = await bot.proxyManager.testProxy(proxy);

            if (working) {
                Logger.success(`Proxy ${proxy.host}:${proxy.port} is working`);
                proxy.working = true;
            } else {
                Logger.error(`Proxy ${proxy.host}:${proxy.port} is not working`);
                proxy.working = false;
            }
        }
    },

    rotateProxy(bot) {
        if (!bot.proxyManager) {
            Logger.error('Proxy manager not available');
            return;
        }

        const proxy = bot.proxyManager.rotateProxy();

        if (proxy) {
            Logger.success(`Rotated to proxy: ${proxy.host}:${proxy.port}`);
            Logger.info('Note: You need to reconnect for the new proxy to take effect');
        } else {
            Logger.warn('No proxies available for rotation');
        }
    },

    showCurrentProxy(bot) {
        if (!bot.proxyManager) {
            Logger.error('Proxy manager not available');
            return;
        }

        const proxy = bot.proxyManager.getCurrentProxy();

        if (proxy) {
            Logger.divider();
            Logger.info('Current Proxy:');
            Logger.info(`Host: ${proxy.host}`);
            Logger.info(`Port: ${proxy.port}`);
            Logger.info(`Type: ${proxy.type}`);
            Logger.info(`Authentication: ${proxy.username ? 'Yes' : 'No'}`);
            Logger.info(`Status: ${proxy.working ? 'Working' : 'Not tested or not working'}`);
            Logger.divider();
        } else {
            Logger.warn('No current proxy configured');
        }
    },

    setRotationInterval(bot, args, config) {
        if (args.length < 1) {
            Logger.warn('Usage: proxy interval <minutes>');
            return;
        }

        if (!bot.proxyManager) {
            Logger.error('Proxy manager not available');
            return;
        }

        const minutes = parseInt(args[0]);

        if (isNaN(minutes) || minutes <= 0) {
            Logger.warn('Interval must be a positive number of minutes');
            return;
        }

        const intervalMs = minutes * 60 * 1000;
        bot.proxyManager.setRotationInterval(intervalMs);

        // Update config if possible
        if (bot.huminiBot && bot.huminiBot.configManager) {
            const configManager = bot.huminiBot.configManager;

            // Ensure proxy section exists in config
            if (!config.proxy) {
                config.proxy = {};
            }

            // Update config
            config.proxy.proxyRotationInterval = intervalMs;

            // Save config
            if (configManager.updateConfig(config)) {
                Logger.success(`Rotation interval set to ${minutes} minutes and saved to config`);
            } else {
                Logger.warn(`Rotation interval set to ${minutes} minutes but failed to save to config`);
            }
        } else {
            Logger.success(`Rotation interval set to ${minutes} minutes (not saved to config)`);
        }
    },

    setProxyType(bot, args, config) {
        if (args.length < 1) {
            Logger.warn('Usage: proxy type <http|socks4|socks5>');
            return;
        }

        if (!bot.proxyManager) {
            Logger.error('Proxy manager not available');
            return;
        }

        const type = args[0].toLowerCase();

        if (!['http', 'socks4', 'socks5'].includes(type)) {
            Logger.warn('Type must be one of: http, socks4, socks5');
            return;
        }

        bot.proxyManager.setProxyType(type);

        // Update config if possible
        if (bot.huminiBot && bot.huminiBot.configManager) {
            const configManager = bot.huminiBot.configManager;

            // Ensure proxy section exists in config
            if (!config.proxy) {
                config.proxy = {};
            }

            // Update config
            config.proxy.proxyType = type;

            // Save config
            if (configManager.updateConfig(config)) {
                Logger.success(`Proxy type set to ${type} and saved to config`);
            } else {
                Logger.warn(`Proxy type set to ${type} but failed to save to config`);
            }
        } else {
            Logger.success(`Proxy type set to ${type} (not saved to config)`);
        }
    }
};