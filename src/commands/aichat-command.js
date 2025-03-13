import { Logger } from '../utils/logger.js';
import fetch from 'node-fetch';
import { InventoryUtils } from '../utils/inventory-utils.js';
import { VectorUtils } from '../utils/vector-utils.js';
import pkg from 'mineflayer-pathfinder';
const { pathfinder, Movements, goals } = pkg;

export default {
    name: 'aichat',
    aliases: ['ai', 'chatai'],
    description: 'Toggle AI chat responses to in-game messages',

    execute(bot, args, config) {
        // Check if we should enable or disable
        if (args[0] && (args[0].toLowerCase() === 'off' || args[0].toLowerCase() === 'stop')) {
            this.disableAIChat(bot);
            return;
        }

        // Get API key from args or config
        let apiKey = args[0];

        // If no API key provided in args, check if one exists in config
        if (!apiKey && config.aiChat && config.aiChat.apiKey) {
            apiKey = config.aiChat.apiKey;
        }

        // If still no API key, show usage
        if (!apiKey) {
            Logger.warn('Usage: aichat <api_key> - Enable AI chat responses');
            Logger.warn('Usage: aichat off - Disable AI chat responses');
            return;
        }

        this.enableAIChat(bot, apiKey);
    },

    enableAIChat(bot, apiKey) {
        // Store API key
        if (!bot.aiChat) {
            bot.aiChat = {};
        }

        bot.aiChat.apiKey = apiKey;
        bot.aiChat.enabled = true;
        bot.aiChat.cooldown = false;
        bot.aiChat.pendingRequests = new Map();
        bot.aiChat.botInstance = bot; // Store bot instance for use in event handler

        // Register chat event handler if not already registered
        if (!bot.aiChat.eventRegistered) {
            // Use an arrow function to maintain the correct 'this' context and pass the bot instance
            bot.on('chat', (username, message) => this.handleChat(bot, username, message));
            bot.aiChat.eventRegistered = true;
        }

        Logger.success('AI chat responses enabled');

        // Save API key to config if possible
        if (bot.huminiBot && bot.huminiBot.configManager) {
            const config = bot.huminiBot.configManager.getConfig();

            if (!config.aiChat) {
                config.aiChat = {};
            }

            config.aiChat.apiKey = apiKey;
            bot.huminiBot.configManager.updateConfig(config);
            Logger.debug('Saved API key to config');
        }
    },

    disableAIChat(bot) {
        if (bot.aiChat) {
            bot.aiChat.enabled = false;
            Logger.info('AI chat responses disabled');
        } else {
            Logger.info('AI chat was not active');
        }
    },

    async handleChat(bot, username, message) {
        // Skip messages from the bot itself
        if (username === bot.username) return;

        // Check if AI chat is enabled
        if (!bot.aiChat || !bot.aiChat.enabled) return;

        // Check if we're in cooldown
        if (bot.aiChat.cooldown) return;

        // Check if we already have a pending request for this user
        if (bot.aiChat.pendingRequests.has(username)) return;

        // Set cooldown to prevent spam
        bot.aiChat.cooldown = true;
        setTimeout(() => {
            bot.aiChat.cooldown = false;
        }, 3000); // 3 second cooldown

        // Mark this user as having a pending request
        bot.aiChat.pendingRequests.set(username, true);

        try {
            Logger.debug(`Processing message from ${username}: "${message}"`);

            // First, analyze the intent of the message
            const intent = await this.analyzeMessageIntent(bot, message);
            Logger.debug(`Detected intent: ${intent}`);

            // Handle different intents
            switch (intent) {
                case 'follow':
                    await this.handleFollowCommand(bot, username, message);
                    break;
                case 'give_item':
                    await this.handleGiveCommand(bot, username, message);
                    break;
                case 'come_here':
                    await this.handleComeHereCommand(bot, username);
                    break;
                case 'stop_following':
                    await this.handleStopFollowingCommand(bot, username);
                    break;
                case 'inventory':
                    await this.handleInventoryCommand(bot, username);
                    break;
                case 'greeting':
                    await this.handleGreetingCommand(bot, username);
                    break;
                case 'give_specific_item':
                    await this.handleGiveSpecificItemCommand(bot, username, message);
                    break;
                default:
                    // Check for advanced commands in the message
                    if (message.toLowerCase().includes('make fully advanced')) {
                        await this.handleAdvancedCommand(bot, username, message);
                    } else {
                        // Generate AI response for normal chat
                        const response = await this.generateAIResponse(bot, username, message);

                        if (response) {
                            // Send the response in-game
                            bot.chat(response);
                            Logger.info(`Sent AI response to ${username}`);
                        }
                    }
            }
        } catch (error) {
            Logger.error(`Failed to process message: ${error.message}`);
            bot.chat(`Sorry ${username}, I had trouble understanding that.`);
        } finally {
            // Clear the pending request
            bot.aiChat.pendingRequests.delete(username);
        }
    },

    async handleAdvancedCommand(bot, username, message) {
        try {
            Logger.info(`Processing advanced command from ${username}`);

            // First, stop following if currently following
            if (bot.followingPlayer) {
                await this.handleStopFollowingCommand(bot, username);
            }

            // Try to extract an item name from the message
            const itemName = await this.extractItemFromMessage(bot, message);

            if (itemName) {
                // If an item was mentioned, try to give it
                await this.handleGiveSpecificItemCommand(bot, username, message);
            } else {
                // No specific item mentioned, just acknowledge the command
                bot.chat(`I'm now in advanced mode, ${username}. What would you like me to do?`);
            }

            Logger.success(`Processed advanced command for ${username}`);
        } catch (error) {
            Logger.error(`Error in advanced command: ${error.message}`);
            bot.chat(`Sorry ${username}, I couldn't process that advanced command.`);
        }
    },

    async analyzeMessageIntent(bot, message) {
        try {
            const apiKey = bot.aiChat.apiKey;
            const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'mistral-tiny',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an intent classifier for a Minecraft bot. Classify the intent of the message into one of these categories: follow, give_item, come_here, stop_following, inventory, greeting, give_specific_item, other. Only respond with the category name, nothing else.'
                        },
                        {
                            role: 'user',
                            content: `Classify this message: "${message}"`
                        }
                    ],
                    max_tokens: 10,
                    temperature: 0.2
                })
            });

            if (!response.ok) {
                return 'other';
            }

            const data = await response.json();

            if (data.choices && data.choices.length > 0) {
                const intent = data.choices[0].message.content.trim().toLowerCase();

                // Map the intent to one of our categories
                if (intent.includes('follow')) return 'follow';
                if (intent.includes('give') && intent.includes('specific')) return 'give_specific_item';
                if (intent.includes('give') || intent.includes('item')) return 'give_item';
                if (intent.includes('come')) return 'come_here';
                if (intent.includes('stop')) return 'stop_following';
                if (intent.includes('inventory')) return 'inventory';
                if (intent.includes('greet')) return 'greeting';

                return 'other';
            }

            return 'other';
        } catch (error) {
            Logger.error(`Error analyzing intent: ${error.message}`);
            return 'other';
        }
    },

    async handleFollowCommand(bot, username, message) {
        try {
            // Check if the follow command is available
            if (!bot.commandManager) {
                bot.chat(`I'll follow you, ${username}!`);
                Logger.warn('Command manager not available for follow command');
                return;
            }

            // Get the follow command
            const followCommand = bot.commandManager.getCommand('follow');

            if (!followCommand) {
                bot.chat(`I'll follow you, ${username}!`);
                Logger.warn('Follow command not found');
                return;
            }

            // Execute the follow command
            followCommand.execute(bot, [username], bot.huminiConfig);

            // Send a response
            bot.chat(`I'm following you now, ${username}!`);
            Logger.info(`Started following ${username} via AI command`);
        } catch (error) {
            Logger.error(`Error in follow command: ${error.message}`);
            bot.chat(`Sorry, I couldn't follow you: ${error.message}`);
        }
    },

    async handleStopFollowingCommand(bot, username) {
        try {
            // Check if the follow command is available
            if (!bot.commandManager) {
                bot.chat(`I'll stop following, ${username}.`);
                Logger.warn('Command manager not available for follow command');
                return;
            }

            // Get the follow command
            const followCommand = bot.commandManager.getCommand('follow');

            if (!followCommand) {
                bot.chat(`I'll stop following, ${username}.`);
                Logger.warn('Follow command not found');
                return;
            }

            // Execute the follow command with stop parameter
            followCommand.execute(bot, ['stop'], bot.huminiConfig);

            // Send a response
            bot.chat(`I've stopped following, ${username}.`);
            Logger.info(`Stopped following via AI command`);
        } catch (error) {
            Logger.error(`Error in stop following command: ${error.message}`);
            bot.chat(`Sorry, I couldn't stop following: ${error.message}`);
        }
    },

    async handleComeHereCommand(bot, username) {
        try {
            // Find the player
            const player = bot.players[username];
            if (!player || !player.entity) {
                bot.chat(`I can't see you, ${username}. Where are you?`);
                return;
            }

            // Check if pathfinder is available
            if (!bot.pathfinder) {
                bot.chat(`I'll try to come to you, ${username}!`);
                Logger.warn('Pathfinder not available for come here command');
                return;
            }

            // Create a goal to move to the player
            const { goals } = pkg;
            const goal = new goals.GoalNear(player.entity.position.x, player.entity.position.y, player.entity.position.z, 2);

            // Set the goal
            bot.pathfinder.setGoal(goal);

            // Send a response
            bot.chat(`Coming to you, ${username}!`);
            Logger.info(`Moving to ${username} via AI command`);
        } catch (error) {
            Logger.error(`Error in come here command: ${error.message}`);
            bot.chat(`Sorry, I couldn't come to you: ${error.message}`);
        }
    },

    async handleGiveCommand(bot, username, message) {
        try {
            // Extract what the player wants
            const itemName = await this.extractItemFromMessage(bot, message);

            if (!itemName) {
                bot.chat(`What would you like me to give you, ${username}?`);
                return;
            }

            // Check if the give command is available
            if (!bot.commandManager) {
                bot.chat(`I'd like to give you ${itemName}, but I can't right now.`);
                Logger.warn('Command manager not available for give command');
                return;
            }

            // Get the give command
            const giveCommand = bot.commandManager.getCommand('give');

            if (!giveCommand) {
                bot.chat(`I'd like to give you ${itemName}, but I can't right now.`);
                Logger.warn('Give command not found');
                return;
            }

            // Check if we have the item
            const items = InventoryUtils.findItems(bot, itemName, { partialMatch: true });

            if (items.length === 0) {
                bot.chat(`Sorry ${username}, I don't have any ${itemName}.`);
                return;
            }

            // Execute the give command
            giveCommand.execute(bot, [username, '1', itemName], bot.huminiConfig);

            // Send a response
            bot.chat(`Here's your ${itemName}, ${username}!`);
            Logger.info(`Gave ${itemName} to ${username} via AI command`);
        } catch (error) {
            Logger.error(`Error in give command: ${error.message}`);
            bot.chat(`Sorry, I couldn't give you that: ${error.message}`);
        }
    },

    async handleGiveSpecificItemCommand(bot, username, message) {
        try {
            // Extract what the player wants with more detailed analysis
            const itemDetails = await this.extractSpecificItemDetails(bot, message);

            if (!itemDetails || !itemDetails.name) {
                bot.chat(`What specific item would you like me to give you, ${username}?`);
                return;
            }

            const itemName = itemDetails.name;
            const count = itemDetails.count || 1;

            // Check if the give command is available
            if (!bot.commandManager) {
                bot.chat(`I'd like to give you ${count}x ${itemName}, but I can't right now.`);
                Logger.warn('Command manager not available for give command');
                return;
            }

            // Get the give command
            const giveCommand = bot.commandManager.getCommand('give');

            if (!giveCommand) {
                bot.chat(`I'd like to give you ${count}x ${itemName}, but I can't right now.`);
                Logger.warn('Give command not found');
                return;
            }

            // Check if we have the item
            const items = InventoryUtils.findItems(bot, itemName, { partialMatch: true });

            if (items.length === 0) {
                bot.chat(`Sorry ${username}, I don't have any ${itemName}.`);
                return;
            }

            // Check if we have enough of the item
            const availableCount = items.reduce((total, item) => total + item.count, 0);
            const actualCount = Math.min(count, availableCount);

            if (actualCount < count) {
                bot.chat(`I only have ${actualCount}x ${itemName}, but I'll give you what I can.`);
            }

            // Execute the give command
            giveCommand.execute(bot, [username, actualCount.toString(), itemName], bot.huminiConfig);

            // Send a response
            bot.chat(`Here's your ${actualCount}x ${itemName}, ${username}!`);
            Logger.info(`Gave ${actualCount}x ${itemName} to ${username} via AI command`);
        } catch (error) {
            Logger.error(`Error in give specific item command: ${error.message}`);
            bot.chat(`Sorry, I couldn't give you that specific item: ${error.message}`);
        }
    },

    async handleInventoryCommand(bot, username) {
        try {
            // Get a list of items in the bot's inventory
            const items = bot.inventory.items();

            if (items.length === 0) {
                bot.chat(`My inventory is empty, ${username}.`);
                return;
            }

            // Group items by name and count them
            const itemCounts = {};
            for (const item of items) {
                if (itemCounts[item.name]) {
                    itemCounts[item.name] += item.count;
                } else {
                    itemCounts[item.name] = item.count;
                }
            }

            // Format the inventory list
            const inventoryList = Object.entries(itemCounts)
                .map(([name, count]) => `${count}x ${name}`)
                .join(', ');

            // Send the inventory list
            bot.chat(`My inventory: ${inventoryList}`);
            Logger.info(`Sent inventory to ${username} via AI command`);
        } catch (error) {
            Logger.error(`Error in inventory command: ${error.message}`);
            bot.chat(`Sorry, I couldn't check my inventory: ${error.message}`);
        }
    },

    async handleGreetingCommand(bot, username) {
        // Simple greeting response
        const greetings = [
            `Hello, ${username}! How can I help you today?`,
            `Hi there, ${username}! What's up?`,
            `Hey ${username}! Nice to see you!`,
            `Greetings, ${username}! How are you doing?`
        ];

        const greeting = greetings[Math.floor(Math.random() * greetings.length)];
        bot.chat(greeting);
        Logger.info(`Greeted ${username} via AI command`);
    },

    async extractItemFromMessage(bot, message) {
        try {
            const apiKey = bot.aiChat.apiKey;
            const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'mistral-tiny',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an assistant that extracts item names from messages. Only respond with the exact item name, nothing else. If no item is mentioned, respond with "unknown".'
                        },
                        {
                            role: 'user',
                            content: `Extract the Minecraft item name from this message: "${message}"`
                        }
                    ],
                    max_tokens: 20,
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                return null;
            }

            const data = await response.json();

            if (data.choices && data.choices.length > 0) {
                let itemName = data.choices[0].message.content.trim().toLowerCase();

                // If the AI couldn't identify an item
                if (itemName === 'unknown' || itemName.includes('no item')) {
                    return null;
                }

                // Clean up the item name
                itemName = itemName.replace(/^(a|an|the|some) /i, '');

                // Convert common item names to Minecraft format
                const itemMappings = {
                    'wood': 'log',
                    'wooden planks': 'planks',
                    'stone': 'cobblestone',
                    'iron': 'iron_ingot',
                    'gold': 'gold_ingot',
                    'diamond': 'diamond',
                    'stick': 'stick',
                    'coal': 'coal',
                    'food': 'bread',
                    'sword': 'iron_sword',
                    'pickaxe': 'iron_pickaxe',
                    'axe': 'iron_axe',
                    'shovel': 'iron_shovel',
                    'hoe': 'iron_hoe',
                    'bow': 'bow',
                    'arrow': 'arrow',
                    'torch': 'torch',
                    'dirt': 'dirt',
                    'sand': 'sand',
                    'gravel': 'gravel',
                    'apple': 'apple'
                };

                // Check if we have a mapping for this item
                if (itemMappings[itemName]) {
                    itemName = itemMappings[itemName];
                }

                return itemName;
            }

            return null;
        } catch (error) {
            Logger.error(`Error extracting item from message: ${error.message}`);
            return null;
        }
    },

    async extractSpecificItemDetails(bot, message) {
        try {
            const apiKey = bot.aiChat.apiKey;
            const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'mistral-tiny',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an assistant that extracts item details from messages. Respond with a JSON object containing "name" (string) and "count" (number) properties. If no item is mentioned, set name to null. If no count is specified, default to 1.'
                        },
                        {
                            role: 'user',
                            content: `Extract the Minecraft item details from this message: "${message}"`
                        }
                    ],
                    max_tokens: 100,
                    temperature: 0.3
                })
            });

            if (!response.ok) {
                return { name: null, count: 1 };
            }

            const data = await response.json();

            if (data.choices && data.choices.length > 0) {
                const content = data.choices[0].message.content.trim();

                try {
                    // Try to parse as JSON
                    const jsonMatch = content.match(/\{.*\}/s);
                    if (jsonMatch) {
                        const itemDetails = JSON.parse(jsonMatch[0]);

                        // Validate and clean up the item name
                        if (itemDetails.name && typeof itemDetails.name === 'string') {
                            let itemName = itemDetails.name.toLowerCase();

                            // Clean up the item name
                            itemName = itemName.replace(/^(a|an|the|some) /i, '');

                            // Convert common item names to Minecraft format
                            const itemMappings = {
                                'wood': 'log',
                                'wooden planks': 'planks',
                                'stone': 'cobblestone',
                                'iron': 'iron_ingot',
                                'gold': 'gold_ingot',
                                'diamond': 'diamond',
                                'stick': 'stick',
                                'coal': 'coal',
                                'food': 'bread',
                                'sword': 'iron_sword',
                                'pickaxe': 'iron_pickaxe',
                                'axe': 'iron_axe',
                                'shovel': 'iron_shovel',
                                'hoe': 'iron_hoe',
                                'bow': 'bow',
                                'arrow': 'arrow',
                                'torch': 'torch',
                                'dirt': 'dirt',
                                'sand': 'sand',
                                'gravel': 'gravel',
                                'apple': 'apple'
                            };

                            // Check if we have a mapping for this item
                            if (itemMappings[itemName]) {
                                itemName = itemMappings[itemName];
                            }

                            // Ensure count is a number
                            const count = typeof itemDetails.count === 'number' ?
                                itemDetails.count :
                                parseInt(itemDetails.count) || 1;

                            return {
                                name: itemName,
                                count: Math.max(1, count) // Ensure count is at least 1
                            };
                        }
                    }

                    // If JSON parsing failed, try to extract manually
                    const itemName = await this.extractItemFromMessage(bot, message);

                    // Try to find a number in the message
                    const countMatch = message.match(/\b(\d+)\b/);
                    const count = countMatch ? parseInt(countMatch[1]) : 1;

                    return {
                        name: itemName,
                        count: count
                    };
                } catch (parseError) {
                    Logger.error(`Error parsing item details: ${parseError.message}`);

                    // Fallback to basic extraction
                    const itemName = await this.extractItemFromMessage(bot, message);
                    return {
                        name: itemName,
                        count: 1
                    };
                }
            }

            return { name: null, count: 1 };
        } catch (error) {
            Logger.error(`Error extracting specific item details: ${error.message}`);
            return { name: null, count: 1 };
        }
    },

    async generateAIResponse(bot, username, message) {
        try {
            const apiKey = bot.aiChat.apiKey;
            const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'mistral-tiny',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a helpful Minecraft bot assistant. Keep your responses short, friendly, and suitable for Minecraft chat (max 100 characters). Avoid complex formatting or long explanations. If someone asks you to follow them, respond that you will follow them. If someone asks for items, respond that you will try to give them what they need.'
                        },
                        {
                            role: 'user',
                            content: `Player ${username} said: "${message}". Respond to them in a brief, friendly way.`
                        }
                    ],
                    max_tokens: 100,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API error: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();

            if (data.choices && data.choices.length > 0) {
                let aiResponse = data.choices[0].message.content.trim();

                // Ensure the response isn't too long for Minecraft chat
                if (aiResponse.length > 100) {
                    aiResponse = aiResponse.substring(0, 97) + '...';
                }

                return aiResponse;
            } else {
                throw new Error('No response generated');
            }
        } catch (error) {
            Logger.error(`AI API error: ${error.message}`);
            return null;
        }
    }
};