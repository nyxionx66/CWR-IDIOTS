import { Logger } from '../utils/logger.js';

export class EventManager {
  constructor(bot, config) {
    this.bot = bot;
    this.config = config;
    this.registeredEvents = new Map();
    this.eventHandlers = {};
    this.printMessages = false; // Default to not printing messages

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Connection events
    this.eventHandlers.spawn = this.handleSpawn.bind(this);
    this.eventHandlers.end = this.handleDisconnect.bind(this);
    this.eventHandlers.kicked = this.handleKicked.bind(this);
    this.eventHandlers.error = this.handleError.bind(this);

    // Game events
    this.eventHandlers.health = this.handleHealth.bind(this);
    this.eventHandlers.death = this.handleDeath.bind(this);
    this.eventHandlers.playerJoin = this.handlePlayerJoin.bind(this);
    this.eventHandlers.playerLeave = this.handlePlayerLeave.bind(this);
    this.eventHandlers.chat = this.handleChat.bind(this);
    this.eventHandlers.whisper = this.handleWhisper.bind(this);
    this.eventHandlers.message = this.handleMessage.bind(this);

    // World events
    this.eventHandlers.blockUpdate = this.handleBlockUpdate.bind(this);
    this.eventHandlers.chunkColumnLoad = this.handleChunkLoad.bind(this);

    // Inventory events
    this.eventHandlers.playerCollect = this.handlePlayerCollect.bind(this);
    this.eventHandlers.windowOpen = this.handleWindowOpen.bind(this);
    this.eventHandlers.windowClose = this.handleWindowClose.bind(this);
  }

  registerAllEvents() {
    // Register all event handlers
    for (const [event, handler] of Object.entries(this.eventHandlers)) {
      this.registerEvent(event, handler);
    }

    Logger.info('All event handlers registered');
  }

  registerEvent(eventName, handler) {
    if (this.registeredEvents.has(eventName)) {
      Logger.warn(`Event handler for '${eventName}' is already registered`);
      return;
    }

    this.bot.on(eventName, handler);
    this.registeredEvents.set(eventName, handler);
    Logger.debug(`Registered event handler for '${eventName}'`);
  }

  unregisterEvent(eventName) {
    const handler = this.registeredEvents.get(eventName);
    if (handler) {
      this.bot.removeListener(eventName, handler);
      this.registeredEvents.delete(eventName);
      Logger.debug(`Unregistered event handler for '${eventName}'`);
    }
  }

  unregisterAllEvents() {
    for (const [eventName, handler] of this.registeredEvents.entries()) {
      this.bot.removeListener(eventName, handler);
    }

    this.registeredEvents.clear();
    Logger.info('All event handlers unregistered');
  }

  // Toggle message printing
  toggleMessagePrinting(enabled = null) {
    if (enabled === null) {
      // Toggle current state if no value provided
      this.printMessages = !this.printMessages;
    } else {
      // Set to specified value
      this.printMessages = enabled;
    }

    Logger.info(`In-game message printing is now ${this.printMessages ? 'enabled' : 'disabled'}`);
    return this.printMessages;
  }

  // Connection event handlers
  handleSpawn() {
    Logger.success('Bot spawned in the world');

    // Execute auto-login command if configured
    if (this.config.customCommands && this.config.customCommands.autoLogin) {
      setTimeout(() => {
        this.bot.chat(this.config.customCommands.autoLogin);
        Logger.info('Auto-login command executed');
      }, 2000);
    }

    // Emit custom ready event
    this.bot.emit('humini:ready');
  }

  handleDisconnect(reason) {
    let disconnectReason = 'Unknown reason';

    if (typeof reason === 'string') {
      disconnectReason = reason;
    } else if (reason && typeof reason === 'object') {
      if (reason.message) {
        disconnectReason = reason.message;
      } else if (reason.code) {
        disconnectReason = `Error code: ${reason.code}`;
      }
    }

    Logger.error(`Disconnected: ${disconnectReason}`);

    // Emit custom disconnect event with formatted reason
    this.bot.emit('humini:disconnect', disconnectReason);
  }

  handleKicked(reason, loggedIn) {
    let readableReason = reason;

    try {
      // Try to parse as JSON, but handle non-JSON reasons gracefully
      const reasonJson = JSON.parse(reason);
      readableReason = reasonJson.text || reasonJson.translate || reason;
    } catch (e) {
      // If it's not valid JSON, use the raw reason string
      readableReason = reason.toString();
    }

    Logger.error(`Bot was kicked! Reason: ${readableReason}`);
    Logger.info(`Login status: ${loggedIn ? 'Logged in' : 'Not logged in'}`);

    // Emit custom kicked event with formatted reason
    this.bot.emit('humini:kicked', readableReason, loggedIn);
  }

  handleError(error) {
    Logger.error(`Bot error: ${error.message}`);

    // Emit custom error event
    this.bot.emit('humini:error', error);
  }

  // Game event handlers
  handleHealth() {
    const { health, food } = this.bot;

    // Log low health warning
    if (health < 5) {
      Logger.warn(`Low health warning: ${health}/20`);

      // Emit custom low health event
      this.bot.emit('humini:lowHealth', health);
    }

    // Emit custom health update event
    this.bot.emit('humini:healthUpdate', { health, food });
  }

  handleDeath() {
    Logger.error('Bot died! Respawning...');

    // Emit custom death event
    this.bot.emit('humini:death');
  }

  handlePlayerJoin(player) {
    if (this.printMessages) {
      Logger.info(`Player joined: ${player.username}`);
    }

    // Emit custom player join event
    this.bot.emit('humini:playerJoin', player);
  }

  handlePlayerLeave(player) {
    if (this.printMessages) {
      Logger.info(`Player left: ${player.username}`);
    }

    // Emit custom player leave event
    this.bot.emit('humini:playerLeave', player);
  }

  handleChat(username, message) {
    if (username === this.bot.username) return;

    if (this.printMessages) {
      Logger.info(`${username}: ${message}`);
    }

    // Emit custom chat event
    this.bot.emit('humini:chat', username, message);
  }

  handleWhisper(username, message) {
    if (this.printMessages) {
      Logger.info(`[WHISPER] ${username}: ${message}`);
    }

    // Emit custom whisper event
    this.bot.emit('humini:whisper', username, message);
  }

  handleMessage(message, position) {
    // Only process system messages and other non-chat messages
    const formattedMessage = message.toString();

    // Skip empty messages
    if (!formattedMessage || formattedMessage.trim() === '') return;

    // Skip chat messages that are handled by the chat event
    if (formattedMessage.match(/^<[^>]+> .+$/)) return;

    if (this.printMessages) {
      Logger.debug(`Message (${position}): ${formattedMessage}`);
    }

    // Emit custom message event
    this.bot.emit('humini:message', formattedMessage, position);
  }

  // World event handlers
  handleBlockUpdate(oldBlock, newBlock) {
    // Only log important block updates to avoid spam
    if (!oldBlock || !newBlock) return;

    // Check if this is an ore or important block
    const importantBlocks = Object.keys(this.config.mining?.orePriority || {});

    if (importantBlocks.includes(newBlock.name)) {
      if (this.printMessages) {
        Logger.debug(`Block updated: ${oldBlock.name} -> ${newBlock.name} at ${newBlock.position}`);
      }

      // Emit custom block update event for important blocks
      this.bot.emit('humini:importantBlockUpdate', oldBlock, newBlock);
    }
  }

  handleChunkLoad(columnX, columnZ) {
    // Emit custom chunk load event
    this.bot.emit('humini:chunkLoad', columnX, columnZ);
  }

  // Inventory event handlers
  handlePlayerCollect(collector, collected) {
    if (collector.username === this.bot.username) {
      if (this.printMessages) {
        Logger.debug(`Collected item: ${collected.name}`);
      }

      // Emit custom collect event
      this.bot.emit('humini:itemCollected', collected);
    }
  }

  handleWindowOpen(window) {
    if (this.printMessages) {
      Logger.debug(`Window opened: ${window.title}`);
    }

    // Emit custom window open event
    this.bot.emit('humini:windowOpen', window);
  }

  handleWindowClose(window) {
    if (this.printMessages) {
      Logger.debug(`Window closed: ${window.title}`);
    }

    // Emit custom window close event
    this.bot.emit('humini:windowClose', window);
  }
}