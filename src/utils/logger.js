import chalk from 'chalk';
import figlet from 'figlet';

export class Logger {
  static colors = {
    info: chalk.cyan,
    success: chalk.green,
    warn: chalk.yellow,
    error: chalk.red,
    debug: chalk.blue,
    chat: chalk.white,
    whisper: chalk.hex('#FFA500'), // Orange
    combat: chalk.hex('#FF4500'),  // Red-Orange
    movement: chalk.hex('#4169E1'), // Royal Blue
    primary: chalk.hex('#8B5CF6'),  // Purple
    secondary: chalk.hex('#10B981') // Green
  };

  static prefix = '[HUMINI]';
  static debugMode = false;

  static formatMessage(message, type) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = this.colors.primary(this.prefix);
    const typeLabel = type.toUpperCase();
    return `${prefix} ${this.colors[type](`[${typeLabel}] ${message}`)} (${timestamp})`;
  }

  static log(message, type = 'info') {
    const formattedMessage = this.formatMessage(message, type);
    console.log(formattedMessage);
  }

  static info(message) {
    this.log(message, 'info');
  }

  static success(message) {
    this.log(message, 'success');
  }

  static warn(message) {
    this.log(message, 'warn');
  }

  static error(message) {
    this.log(message, 'error');
  }

  static debug(message) {
    if (this.debugMode) {
      this.log(message, 'debug');
    }
  }

  static chat(username, message) {
    this.log(`${username}: ${message}`, 'chat');
  }

  static whisper(username, message) {
    this.log(`[WHISPER] ${username}: ${message}`, 'whisper');
  }

  static combat(message) {
    this.log(message, 'combat');
  }

  static movement(message) {
    this.log(message, 'movement');
  }

  static table(data, title = '') {
    if (title) {
      console.log(this.colors.primary(`\n${this.prefix} ${title}`));
    }
    console.table(data);
  }

  static divider() {
    console.log(this.colors.secondary('\n' + '='.repeat(50) + '\n'));
  }

  static enableDebug() {
    this.debugMode = true;
    this.debug('Debug mode enabled');
  }

  static disableDebug() {
    this.debug('Debug mode disabled');
    this.debugMode = false;
  }
}