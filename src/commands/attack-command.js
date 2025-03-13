import { Logger } from '../utils/logger.js';
import { VectorUtils } from '../utils/vector-utils.js';
import pkg from 'mineflayer-pathfinder';
const { pathfinder, Movements, goals } = pkg;

export default {
    name: 'attack',
    aliases: ['fight', 'kill'],
    description: 'Attack a specific player',

    execute(bot, args, config) {
        // Check for stop command
        if (args[0] === 'stop' || args[0] === 'off') {
            this.stopAttacking(bot);
            return;
        }

        // If no username provided, show usage
        if (args.length < 1) {
            Logger.warn('Usage: attack <username>');
            Logger.warn('Usage: attack stop - To stop attacking');
            return;
        }

        const username = args[0];
        this.startAttacking(bot, username);
    },

    startAttacking(bot, username) {
        // Check if pvp plugin is available
        if (!bot.pvp) {
            Logger.error('Cannot attack player: PVP plugin not loaded');
            return;
        }

        // Find the player
        const player = bot.players[username];
        if (!player || !player.entity) {
            Logger.warn(`Cannot attack player: ${username} not found or not in range`);
            return;
        }

        // Stop any existing attack
        this.stopAttacking(bot);

        // Store the target
        bot.attackTarget = username;

        // Initialize combat stats
        bot.combatStats = {
            lastAttackTime: 0,
            consecutiveHits: 0,
            missCount: 0,
            lastPosition: null,
            lastJumpTime: 0,
            lastStrafeTime: 0,
            strafeDirection: 1
        };

        Logger.info(`Starting attack on ${username}`);

        // Set up attack interval with variable timing
        bot.attackInterval = setInterval(() => {
            try {
                const target = bot.players[username];
                if (!target || !target.entity) {
                    Logger.warn(`Lost sight of ${username}, stopping attack`);
                    this.stopAttacking(bot);
                    return;
                }

                this.performCombatActions(bot, target.entity);
            } catch (error) {
                Logger.error(`Attack error: ${error.message}`);
            }
        }, this.getRandomInterval(200, 350)); // Variable attack interval

        // Set up equipment check interval
        bot.equipInterval = setInterval(() => {
            try {
                this.equipBestGear(bot);
            } catch (error) {
                Logger.error(`Equipment error: ${error.message}`);
            }
        }, 1000);
    },

    async performCombatActions(bot, target) {
        const now = Date.now();
        const stats = bot.combatStats;
        const distance = VectorUtils.euclideanDistance(bot.entity.position, target.position);

        // Add random delays between actions
        if (now - stats.lastAttackTime < this.getRandomInterval(150, 300)) {
            return;
        }

        // Randomize combat behavior
        if (Math.random() < 0.1) {
            await this.performRandomCombatMove(bot);
        }

        // Movement logic
        if (distance > 3) {
            // Move closer with pathfinding
            if (bot.pathfinder) {
                const goal = new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2);
                bot.pathfinder.setGoal(goal);
            }
        } else {
            // In range - stop pathfinding and perform combat moves
            if (bot.pathfinder) {
                bot.pathfinder.stop();
            }

            // Strafe movement
            if (now - stats.lastStrafeTime > this.getRandomInterval(800, 1200)) {
                this.performStrafe(bot);
                stats.lastStrafeTime = now;
            }

            // Random jumping
            if (now - stats.lastJumpTime > this.getRandomInterval(1500, 2500) && Math.random() < 0.3) {
                this.performJump(bot);
                stats.lastJumpTime = now;
            }
        }

        // Look at target with slight randomization
        const lookHeight = target.height * (0.8 + Math.random() * 0.4); // Random height between 80-120% of target height
        await bot.lookAt(target.position.offset(0, lookHeight, 0), true);

        // Attack with variable timing
        await this.performAttack(bot, target);

        // Update stats
        stats.lastAttackTime = now;
        stats.lastPosition = target.position.clone();
    },

    async performAttack(bot, target) {
        const stats = bot.combatStats;

        try {
            // Add some randomization to hit accuracy
            if (Math.random() < 0.9) { // 90% hit chance
                await bot.attack(target);
                stats.consecutiveHits++;
                stats.missCount = 0;
            } else {
                stats.missCount++;
                stats.consecutiveHits = 0;
            }

            // Prevent too many consecutive hits
            if (stats.consecutiveHits > 4) {
                await new Promise(resolve => setTimeout(resolve, this.getRandomInterval(200, 400)));
                stats.consecutiveHits = 0;
            }
        } catch (error) {
            Logger.debug(`Attack failed: ${error.message}`);
            stats.missCount++;
        }
    },

    performStrafe(bot) {
        const stats = bot.combatStats;

        // Change strafe direction occasionally
        if (Math.random() < 0.3) {
            stats.strafeDirection *= -1;
        }

        // Apply strafe movement
        bot.setControlState('left', stats.strafeDirection > 0);
        bot.setControlState('right', stats.strafeDirection < 0);

        // Reset strafe after a short duration
        setTimeout(() => {
            bot.setControlState('left', false);
            bot.setControlState('right', false);
        }, this.getRandomInterval(200, 400));
    },

    async performJump(bot) {
        bot.setControlState('jump', true);
        await new Promise(resolve => setTimeout(resolve, 200));
        bot.setControlState('jump', false);
    },

    async performRandomCombatMove(bot) {
        const moves = [
            async () => {
                // Quick forward dash
                bot.setControlState('forward', true);
                await new Promise(resolve => setTimeout(resolve, this.getRandomInterval(100, 200)));
                bot.setControlState('forward', false);
            },
            async () => {
                // Quick backward step
                bot.setControlState('back', true);
                await new Promise(resolve => setTimeout(resolve, this.getRandomInterval(100, 200)));
                bot.setControlState('back', false);
            },
            async () => {
                // Sprint jump
                bot.setControlState('sprint', true);
                bot.setControlState('forward', true);
                bot.setControlState('jump', true);
                await new Promise(resolve => setTimeout(resolve, 200));
                bot.setControlState('sprint', false);
                bot.setControlState('forward', false);
                bot.setControlState('jump', false);
            }
        ];

        const randomMove = moves[Math.floor(Math.random() * moves.length)];
        await randomMove();
    },

    getRandomInterval(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    },

    stopAttacking(bot) {
        // Clear intervals
        if (bot.attackInterval) {
            clearInterval(bot.attackInterval);
            bot.attackInterval = null;
        }

        if (bot.equipInterval) {
            clearInterval(bot.equipInterval);
            bot.equipInterval = null;
        }

        // Stop all movement
        ['forward', 'back', 'left', 'right', 'jump', 'sprint'].forEach(control => {
            bot.setControlState(control, false);
        });

        // Stop pathfinding
        if (bot.pathfinder) {
            bot.pathfinder.stop();
        }

        // Clear target and stats
        const wasAttacking = bot.attackTarget;
        bot.attackTarget = null;
        bot.combatStats = null;

        if (wasAttacking) {
            Logger.info(`Stopped attacking ${wasAttacking}`);
        }
    },

    equipBestGear(bot) {
        // Get all items in inventory
        const items = bot.inventory.items();

        // Find best weapon
        const weapons = items.filter(item =>
            item.name.includes('sword') ||
            item.name.includes('axe')
        );

        // Weapon tiers with slight randomization in selection
        const weaponTiers = {
            'netherite': 4.8 + Math.random() * 0.4,
            'diamond': 3.8 + Math.random() * 0.4,
            'iron': 2.8 + Math.random() * 0.4,
            'stone': 1.8 + Math.random() * 0.4,
            'golden': 0.8 + Math.random() * 0.4,
            'wooden': 0.3 + Math.random() * 0.4
        };

        // Find best weapon with some randomization
        const bestWeapon = weapons.reduce((best, current) => {
            const currentTier = Object.entries(weaponTiers)
                .find(([material]) => current.name.includes(material));

            const bestTier = best ? Object.entries(weaponTiers)
                .find(([material]) => best.name.includes(material)) : null;

            if (!bestTier || (currentTier && weaponTiers[currentTier[0]] > weaponTiers[bestTier[0]])) {
                return current;
            }

            return best;
        }, null);

        // Equip best weapon with random delay
        if (bestWeapon) {
            setTimeout(() => {
                bot.equip(bestWeapon, 'hand').catch(error => {
                    Logger.error(`Failed to equip weapon: ${error.message}`);
                });
            }, this.getRandomInterval(50, 150));
        }

        // Equip best armor if armor manager is available
        if (bot.armorManager) {
            setTimeout(() => {
                bot.armorManager.equipAll().catch(error => {
                    Logger.error(`Failed to equip armor: ${error.message}`);
                });
            }, this.getRandomInterval(100, 300));
        }
    }
};