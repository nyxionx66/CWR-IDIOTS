import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Expanded word lists for more variety
const prefixes = [
    // Elemental
    'Fire', 'Ice', 'Wind', 'Storm', 'Thunder', 'Lightning', 'Frost', 'Flame', 'Blaze', 'Inferno',
    'Shadow', 'Light', 'Dark', 'Void', 'Cosmic', 'Solar', 'Lunar', 'Star', 'Moon', 'Sun',

    // Materials
    'Iron', 'Steel', 'Silver', 'Gold', 'Bronze', 'Copper', 'Crystal', 'Diamond', 'Ruby', 'Emerald',
    'Obsidian', 'Titanium', 'Platinum', 'Cobalt', 'Mythril', 'Adamant', 'Rune', 'Stone', 'Onyx',

    // Nature
    'Forest', 'Ocean', 'Mountain', 'River', 'Desert', 'Valley', 'Sky', 'Earth', 'Cloud', 'Tree',

    // Qualities
    'Swift', 'Mighty', 'Brave', 'Silent', 'Stealth', 'Quick', 'Rapid', 'Fierce', 'Wild', 'Calm',
    'Ancient', 'Eternal', 'Mystic', 'Magic', 'Sacred', 'Divine', 'Holy', 'Chaos', 'Peace', 'War',

    // Colors
    'Crimson', 'Azure', 'Violet', 'Golden', 'Silver', 'Ebony', 'Ivory', 'Scarlet', 'Emerald', 'Sapphire',

    // Creatures
    'Dragon', 'Phoenix', 'Griffin', 'Hydra', 'Wyrm', 'Titan', 'Giant', 'Demon', 'Angel', 'Spirit',
    'Wolf', 'Lion', 'Tiger', 'Eagle', 'Hawk', 'Falcon', 'Raven', 'Serpent', 'Bear', 'Shark'
];

const suffixes = [
    // Roles
    'Warrior', 'Knight', 'Mage', 'Hunter', 'Ranger', 'Rogue', 'Archer', 'Paladin', 'Druid', 'Monk',
    'Guardian', 'Sentinel', 'Warden', 'Champion', 'Hero', 'Legend', 'Master', 'Lord', 'King', 'Queen',

    // Actions
    'Slayer', 'Walker', 'Runner', 'Stalker', 'Seeker', 'Watcher', 'Striker', 'Dancer', 'Singer', 'Caller',
    'Breaker', 'Maker', 'Shaper', 'Weaver', 'Bringer', 'Keeper', 'Finder', 'Seeker', 'Chaser', 'Raider',

    // Equipment
    'Blade', 'Sword', 'Shield', 'Bow', 'Arrow', 'Spear', 'Axe', 'Hammer', 'Staff', 'Dagger',
    'Lance', 'Mace', 'Scythe', 'Fist', 'Claw', 'Talon', 'Wing', 'Horn', 'Fang', 'Tooth',

    // Abstracts
    'Soul', 'Spirit', 'Heart', 'Mind', 'Will', 'Fate', 'Destiny', 'Dream', 'Hope', 'Glory',
    'Power', 'Force', 'Might', 'Strength', 'Honor', 'Pride', 'Fury', 'Rage', 'Peace', 'Calm',

    // Nature
    'Storm', 'Flame', 'Frost', 'Wind', 'Wave', 'Rock', 'Mountain', 'River', 'Ocean', 'Forest',

    // Time
    'Dawn', 'Dusk', 'Night', 'Day', 'Twilight', 'Shadow', 'Light', 'Dark', 'Sun', 'Moon'
];

class UsernameManager {
    constructor() {
        this.usedNamesFile = path.join(__dirname, '../../data/used_usernames.json');
        this.usedNames = new Set();
        this.loadUsedNames();
        this.namePatterns = [
            this.generateNameStyle1.bind(this),
            this.generateNameStyle2.bind(this),
            this.generateNameStyle3.bind(this),
            this.generateNameStyle4.bind(this),
            this.generateNameStyle5.bind(this)
        ];
    }

    loadUsedNames() {
        try {
            const dataDir = path.dirname(this.usedNamesFile);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            if (fs.existsSync(this.usedNamesFile)) {
                const data = fs.readFileSync(this.usedNamesFile, 'utf8');
                this.usedNames = new Set(JSON.parse(data));
                Logger.debug(`Loaded ${this.usedNames.size} used usernames`);
            }
        } catch (error) {
            Logger.error(`Failed to load used usernames: ${error.message}`);
        }
    }

    saveUsedNames() {
        try {
            fs.writeFileSync(
                this.usedNamesFile,
                JSON.stringify(Array.from(this.usedNames), null, 2),
                'utf8'
            );
        } catch (error) {
            Logger.error(`Failed to save used usernames: ${error.message}`);
        }
    }

    generateNameStyle1() {
        // PrefixSuffix123
        const prefix = this.getRandomElement(prefixes);
        const suffix = this.getRandomElement(suffixes);
        const number = Math.floor(Math.random() * 999);
        return `${prefix}${suffix}${number}`;
    }

    generateNameStyle2() {
        // xXPrefixXx
        const prefix = this.getRandomElement(prefixes);
        return `xX${prefix}Xx`;
    }

    generateNameStyle3() {
        // Prefix_Suffix
        const prefix = this.getRandomElement(prefixes);
        const suffix = this.getRandomElement(suffixes);
        return `${prefix}_${suffix}`;
    }

    generateNameStyle4() {
        // ThePrefix123
        const prefix = this.getRandomElement(prefixes);
        const number = Math.floor(Math.random() * 999);
        return `The${prefix}${number}`;
    }

    generateNameStyle5() {
        // PrefixSuffix
        const prefix = this.getRandomElement(prefixes);
        const suffix = this.getRandomElement(suffixes);
        return `${prefix}${suffix}`;
    }

    getRandomElement(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    generateUsername() {
        const pattern = this.namePatterns[Math.floor(Math.random() * this.namePatterns.length)];
        let username = pattern();
        let attempts = 0;
        const maxAttempts = 50;

        while (this.usedNames.has(username) && attempts < maxAttempts) {
            username = pattern();
            attempts++;
        }

        if (attempts >= maxAttempts) {
            // Fallback to timestamp-based name
            username = `Player${Date.now().toString(36)}`;
        }

        this.usedNames.add(username);
        this.saveUsedNames();
        return username;
    }

    generateUsernames(count) {
        const usernames = [];
        for (let i = 0; i < count; i++) {
            usernames.push(this.generateUsername());
        }
        return usernames;
    }

    clearUsedNames() {
        this.usedNames.clear();
        this.saveUsedNames();
    }
}

const usernameManager = new UsernameManager();

export function generateRandomUsername(count = 1, returnArray = false) {
    if (returnArray) {
        return usernameManager.generateUsernames(count);
    }
    return usernameManager.generateUsername();
}

export function clearUsedUsernames() {
    usernameManager.clearUsedNames();
}

export function getUsedUsernamesCount() {
    return usernameManager.usedNames.size;
}