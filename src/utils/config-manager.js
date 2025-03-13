import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ConfigManager {
  constructor(botId = 'default') {
    this.botId = botId;

    // If botId is 'default', use the root config.json
    if (botId === 'default') {
      this.configPath = path.join(__dirname, '../../config.json');
    } else {
      // Otherwise, use the configs directory
      const configsDir = path.join(__dirname, '../../configs');

      // Ensure the configs directory exists
      if (!fs.existsSync(configsDir)) {
        fs.mkdirSync(configsDir, { recursive: true });
      }

      this.configPath = path.join(configsDir, `${botId}.json`);

      // If the specific config doesn't exist, copy the default one
      if (!fs.existsSync(this.configPath) && fs.existsSync(path.join(__dirname, '../../config.json'))) {
        try {
          fs.copyFileSync(
              path.join(__dirname, '../../config.json'),
              this.configPath
          );
        } catch (error) {
          Logger.warn(`Failed to copy default config: ${error.message}`);
          // We'll create a default config later if needed
        }
      }
    }

    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      if (!fs.existsSync(this.configPath)) {
        Logger.warn(`Config file not found: ${this.configPath}`);
        return this.createDefaultConfig();
      }

      const configData = fs.readFileSync(this.configPath, 'utf8');
      const config = JSON.parse(configData);
      Logger.debug(`Configuration for bot ${this.botId} loaded successfully`);
      return config;
    } catch (error) {
      Logger.error(`Error loading config for bot ${this.botId}: ${error.message}`);
      return this.createDefaultConfig();
    }
  }

  createDefaultConfig() {
    const defaultConfig = {
      bot: {
        host: 'localhost',
        port: 25565,
        username: `HuminiBot_${this.botId}`,
        version: '1.20.1'
      },
      autoEat: {
        startAt: 19,
        priority: 'foodPoints',
        bannedFood: [],
        cooldown: 5000
      },
      movement: {
        followDistance: 1,
        lookInterval: 800
      },
      dashboard: {
        enabled: true,
        port: 3000
      },
      customCommands: {}
    };

    try {
      // Make sure we're writing a string, not undefined
      const configString = JSON.stringify(defaultConfig, null, 2);
      if (!configString) {
        throw new Error('Failed to stringify default config');
      }

      fs.writeFileSync(this.configPath, configString, 'utf8');
      Logger.info(`Created default configuration for bot ${this.botId}`);
      return defaultConfig;
    } catch (error) {
      Logger.error(`Failed to create default config for bot ${this.botId}: ${error.message}`);
      return defaultConfig; // Return the default config even if we couldn't save it
    }
  }

  getConfig() {
    return this.config;
  }

  reloadConfig() {
    try {
      this.config = this.loadConfig();
      Logger.info(`Configuration for bot ${this.botId} reloaded successfully`);
      return this.config;
    } catch (error) {
      Logger.error(`Error reloading config for bot ${this.botId}: ${error.message}`);
      return this.config; // Return existing config on error
    }
  }

  updateConfig(newConfig) {
    try {
      if (!newConfig) {
        throw new Error('New config is undefined or null');
      }

      // Merge with existing config to ensure all properties are preserved
      this.config = { ...this.config, ...newConfig };

      // Ensure we're writing a string, not undefined
      const configString = JSON.stringify(this.config, null, 2);
      if (!configString) {
        throw new Error('Failed to stringify updated config');
      }

      // Write to file
      fs.writeFileSync(this.configPath, configString, 'utf8');

      Logger.info(`Configuration for bot ${this.botId} updated successfully`);
      return true;
    } catch (error) {
      Logger.error(`Error updating config for bot ${this.botId}: ${error.message}`);
      return false;
    }
  }

  getConfigValue(key, defaultValue = null) {
    // Support nested keys with dot notation (e.g., 'bot.username')
    const keys = key.split('.');
    let value = this.config;

    for (const k of keys) {
      if (value === undefined || value === null) {
        return defaultValue;
      }
      value = value[k];
    }

    return value !== undefined ? value : defaultValue;
  }

  setConfigValue(key, value) {
    // Support nested keys with dot notation
    const keys = key.split('.');
    let current = this.config;

    // Navigate to the nested object
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!current[k] || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k];
    }

    // Set the value
    current[keys[keys.length - 1]] = value;

    // Save the updated config
    return this.updateConfig(this.config);
  }
}

// ## Roadmap
//
// ### Phase 1: Core Improvements (Q2 2025)
// - [ ] Improve error handling and recovery mechanisms
// - [ ] Add comprehensive logging system with file output
// - [ ] Enhance proxy rotation with automatic testing
// - [ ] Implement configuration validation
// - [ ] Add support for Minecraft 1.21
//
// ### Phase 2: Feature Expansion (Q3 2025)
// - [ ] Add combat system with PvP capabilities
// - [ ] Implement advanced pathfinding for complex terrain
// - [ ] Create mining bot with ore detection
// - [ ] Add building capabilities from schematics
// - [ ] Develop inventory management system
//
// ### Phase 3: AI and Automation (Q4 2025)
// - [ ] Enhance AI chat with context awareness
// - [ ] Add voice command support
// - [ ] Implement machine learning for behavior optimization
// - [ ] Create advanced farming system with crop rotation
// - [ ] Develop automatic resource gathering and crafting
//
// ### Phase 4: User Interface (Q1 2026)
// - [ ] Create web dashboard for remote control
// - [ ] Implement real-time monitoring and statistics
// - [ ] Add mobile app for notifications and control
// - [ ] Develop visual map of bot surroundings
// - [ ] Create command scheduler and macro system
//
// ### Phase 5: Multi-Bot Coordination (Q2 2026)
// - [ ] Implement bot-to-bot communication
// - [ ] Create coordinated task distribution
// - [ ] Develop shared inventory management
// - [ ] Add role-based bot specialization
// - [ ] Implement swarm intelligence for efficient resource gathering