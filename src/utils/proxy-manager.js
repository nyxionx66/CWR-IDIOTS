import { Logger } from './logger.js';
import { SocksClient } from 'socks';
import { HttpsProxyAgent } from 'https-proxy-agent';
import ProxyChain from 'proxy-chain';
import fetch from 'node-fetch';

export class ProxyManager {
    constructor(config) {
        this.config = config || {};
        this.proxies = [];
        this.currentProxyIndex = 0;
        this.lastRotationTime = Date.now();
        this.rotationInterval = this.config.proxyRotationInterval || 30 * 60 * 1000; // Default: 30 minutes
        this.proxyType = this.config.proxyType || 'http'; // Default: http (alternatives: socks4, socks5)
        this.proxyTestUrl = this.config.proxyTestUrl || 'https://api.ipify.org?format=json';
        this.proxyTestTimeout = this.config.proxyTestTimeout || 10000; // 10 seconds
        this.localProxyServer = null;
        this.localProxyPort = null;
    }

    /**
     * Initialize the proxy manager with a list of proxies
     * @param {Array} proxyList - List of proxy strings in format "host:port:username:password"
     * @returns {Promise<boolean>} - True if initialization was successful
     */
    async initialize(proxyList) {
        try {
            if (!proxyList || !Array.isArray(proxyList) || proxyList.length === 0) {
                // If no proxies provided, try to load from config
                if (this.config.proxies && Array.isArray(this.config.proxies) && this.config.proxies.length > 0) {
                    proxyList = this.config.proxies;
                } else {
                    Logger.warn('No proxies provided for rotation. IP rotation will be disabled.');
                    return false;
                }
            }

            this.proxies = proxyList.map(proxy => this.parseProxyString(proxy));

            Logger.info(`Initialized proxy manager with ${this.proxies.length} proxies`);
            Logger.debug(`Proxy type: ${this.proxyType}`);

            // Test proxies if enabled
            if (this.config.testProxiesOnInit) {
                await this.testAllProxies();
            }

            return true;
        } catch (error) {
            Logger.error(`Failed to initialize proxy manager: ${error.message}`);
            return false;
        }
    }

    /**
     * Parse a proxy string into a proxy object
     * @param {string} proxyString - Proxy string in format "host:port:username:password" or "host:port"
     * @returns {Object} - Proxy object
     */
    parseProxyString(proxyString) {
        const parts = proxyString.split(':');

        if (parts.length >= 2) {
            return {
                host: parts[0],
                port: parseInt(parts[1]),
                username: parts[2] || undefined,
                password: parts[3] || undefined,
                type: this.proxyType,
                working: true // Assume working until tested
            };
        }

        Logger.warn(`Invalid proxy format: ${proxyString}. Expected format: host:port:username:password`);
        return null;
    }

    /**
     * Get the next proxy in the rotation
     * @returns {Object} - Next proxy object
     */
    getNextProxy() {
        // Check if it's time to rotate
        const now = Date.now();
        if (now - this.lastRotationTime >= this.rotationInterval) {
            this.rotateProxy();
        }

        // If no proxies available, return null
        if (this.proxies.length === 0) {
            return null;
        }

        // Find a working proxy
        let attempts = 0;
        let proxy = null;

        while (attempts < this.proxies.length) {
            proxy = this.proxies[this.currentProxyIndex];

            if (proxy && proxy.working) {
                break;
            }

            // Move to next proxy
            this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
            attempts++;
        }

        if (!proxy || !proxy.working) {
            Logger.warn('No working proxies available');
            return null;
        }

        return proxy;
    }

    /**
     * Rotate to the next proxy
     * @returns {Object} - New current proxy
     */
    rotateProxy() {
        if (this.proxies.length === 0) {
            return null;
        }

        // Update rotation time
        this.lastRotationTime = Date.now();

        // Move to next proxy
        this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;

        const proxy = this.proxies[this.currentProxyIndex];
        Logger.info(`Rotated to proxy: ${proxy.host}:${proxy.port}`);

        return proxy;
    }

    /**
     * Get the current proxy
     * @returns {Object} - Current proxy object
     */
    getCurrentProxy() {
        if (this.proxies.length === 0) {
            return null;
        }

        return this.proxies[this.currentProxyIndex];
    }

    /**
     * Test if a proxy is working
     * @param {Object} proxy - Proxy object to test
     * @returns {Promise<boolean>} - True if proxy is working
     */
    async testProxy(proxy) {
        if (!proxy) return false;

        try {
            Logger.debug(`Testing proxy ${proxy.host}:${proxy.port}...`);

            let agent;

            // Create appropriate agent based on proxy type
            if (proxy.type === 'socks4' || proxy.type === 'socks5') {
                // For SOCKS proxies, we need to create a local proxy server
                const socksOptions = {
                    proxy: {
                        host: proxy.host,
                        port: proxy.port,
                        type: proxy.type === 'socks5' ? 5 : 4,
                        userId: proxy.username,
                        password: proxy.password
                    },
                    command: 'connect',
                    destination: {
                        host: new URL(this.proxyTestUrl).hostname,
                        port: 443
                    }
                };

                // Test SOCKS connection
                await SocksClient.createConnection(socksOptions);

                // If we get here, the SOCKS connection works
                return true;
            } else {
                // HTTP/HTTPS proxy
                const proxyUrl = `http://${proxy.username ? `${proxy.username}:${proxy.password}@` : ''}${proxy.host}:${proxy.port}`;
                agent = new HttpsProxyAgent(proxyUrl);
            }

            // Test the proxy by making a request
            const response = await fetch(this.proxyTestUrl, {
                agent,
                timeout: this.proxyTestTimeout
            });

            if (!response.ok) {
                throw new Error(`Proxy test failed with status: ${response.status}`);
            }

            const data = await response.json();

            if (data && data.ip) {
                Logger.debug(`Proxy test successful. IP: ${data.ip}`);
                return true;
            }

            return false;
        } catch (error) {
            Logger.debug(`Proxy test failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Test all proxies and mark them as working or not
     * @returns {Promise<number>} - Number of working proxies
     */
    async testAllProxies() {
        Logger.info(`Testing ${this.proxies.length} proxies...`);

        let workingCount = 0;

        for (let i = 0; i < this.proxies.length; i++) {
            const proxy = this.proxies[i];

            if (!proxy) continue;

            proxy.working = await this.testProxy(proxy);

            if (proxy.working) {
                workingCount++;
            }
        }

        Logger.info(`Proxy testing complete. ${workingCount}/${this.proxies.length} proxies working.`);

        return workingCount;
    }

    /**
     * Create a local proxy server that forwards through the selected proxy
     * @returns {Promise<Object>} - Object with host and port of local proxy
     */
    async createLocalProxyServer() {
        try {
            // Close any existing proxy server
            await this.closeLocalProxyServer();

            const proxy = this.getNextProxy();

            if (!proxy) {
                Logger.warn('Cannot create local proxy server: No working proxy available');
                return null;
            }

            // Format the upstream proxy URL
            let upstreamProxyUrl;

            if (proxy.type === 'http' || proxy.type === 'https') {
                upstreamProxyUrl = `http://${proxy.username ? `${proxy.username}:${proxy.password}@` : ''}${proxy.host}:${proxy.port}`;
            } else {
                // For SOCKS proxies, we need to use a different format
                upstreamProxyUrl = `socks${proxy.type === 'socks5' ? '5' : '4'}://${proxy.username ? `${proxy.username}:${proxy.password}@` : ''}${proxy.host}:${proxy.port}`;
            }

            // Create a new proxy server
            this.localProxyServer = await ProxyChain.createServer({
                port: 0, // Let the system assign a free port
                prepareRequestFunction: () => {
                    return {
                        upstreamProxyUrl
                    };
                }
            });

            // Get the port that was assigned
            this.localProxyPort = this.localProxyServer.port;

            Logger.info(`Created local proxy server on port ${this.localProxyPort} using upstream proxy ${proxy.host}:${proxy.port}`);

            return {
                host: '127.0.0.1',
                port: this.localProxyPort
            };
        } catch (error) {
            Logger.error(`Failed to create local proxy server: ${error.message}`);
            return null;
        }
    }

    /**
     * Close the local proxy server
     * @returns {Promise<boolean>} - True if server was closed successfully
     */
    async closeLocalProxyServer() {
        if (this.localProxyServer) {
            try {
                await ProxyChain.closeAnonymizedProxy(this.localProxyServer, true);
                Logger.debug('Closed local proxy server');
                this.localProxyServer = null;
                this.localProxyPort = null;
                return true;
            } catch (error) {
                Logger.error(`Failed to close local proxy server: ${error.message}`);
                return false;
            }
        }

        return true;
    }

    /**
     * Add a new proxy to the rotation
     * @param {string} proxyString - Proxy string in format "host:port:username:password"
     * @returns {boolean} - True if proxy was added successfully
     */
    addProxy(proxyString) {
        const proxy = this.parseProxyString(proxyString);

        if (!proxy) {
            return false;
        }

        this.proxies.push(proxy);
        Logger.info(`Added new proxy: ${proxy.host}:${proxy.port}`);

        return true;
    }

    /**
     * Remove a proxy from the rotation
     * @param {string} host - Proxy host to remove
     * @param {number} port - Proxy port to remove
     * @returns {boolean} - True if proxy was removed successfully
     */
    removeProxy(host, port) {
        const initialLength = this.proxies.length;

        this.proxies = this.proxies.filter(proxy =>
            !(proxy.host === host && proxy.port === port)
        );

        if (this.proxies.length < initialLength) {
            Logger.info(`Removed proxy: ${host}:${port}`);

            // Adjust current index if needed
            if (this.currentProxyIndex >= this.proxies.length) {
                this.currentProxyIndex = 0;
            }

            return true;
        }

        return false;
    }

    /**
     * Get the total number of proxies
     * @returns {number} - Number of proxies
     */
    getProxyCount() {
        return this.proxies.length;
    }

    /**
     * Get the number of working proxies
     * @returns {number} - Number of working proxies
     */
    getWorkingProxyCount() {
        return this.proxies.filter(proxy => proxy && proxy.working).length;
    }

    /**
     * Get all proxies
     * @returns {Array} - Array of proxy objects
     */
    getAllProxies() {
        return [...this.proxies];
    }

    /**
     * Set the proxy rotation interval
     * @param {number} intervalMs - Interval in milliseconds
     */
    setRotationInterval(intervalMs) {
        if (intervalMs > 0) {
            this.rotationInterval = intervalMs;
            Logger.info(`Set proxy rotation interval to ${intervalMs}ms`);
        }
    }

    /**
     * Set the proxy type
     * @param {string} type - Proxy type (http, socks4, socks5)
     */
    setProxyType(type) {
        if (['http', 'socks4', 'socks5'].includes(type)) {
            this.proxyType = type;
            Logger.info(`Set proxy type to ${type}`);
        } else {
            Logger.warn(`Invalid proxy type: ${type}. Must be one of: http, socks4, socks5`);
        }
    }
}