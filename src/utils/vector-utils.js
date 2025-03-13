import Vec3 from 'vec3';

export class VectorUtils {
  /**
   * Creates a new Vec3 instance
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} z - Z coordinate
   * @returns {Vec3} - New Vec3 instance
   */
  static create(x, y, z) {
    return new Vec3(x, y, z);
  }

  /**
   * Creates a Vec3 from an object with x, y, z properties
   * @param {Object} obj - Object with x, y, z properties
   * @returns {Vec3} - New Vec3 instance
   */
  static fromObject(obj) {
    return new Vec3(obj.x, obj.y, obj.z);
  }

  /**
   * Creates a Vec3 from block position
   * @param {Block} block - Mineflayer block
   * @returns {Vec3} - New Vec3 instance with block position
   */
  static fromBlock(block) {
    if (!block || !block.position) return null;
    return new Vec3(block.position.x, block.position.y, block.position.z);
  }

  /**
   * Creates a string key from a position
   * @param {Vec3} pos - Position vector
   * @returns {string} - String key in format "x,y,z"
   */
  static positionToKey(pos) {
    return `${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)}`;
  }

  /**
   * Creates a Vec3 from a position key
   * @param {string} key - Position key in format "x,y,z"
   * @returns {Vec3} - New Vec3 instance
   */
  static keyToPosition(key) {
    const [x, y, z] = key.split(',').map(Number);
    return new Vec3(x, y, z);
  }

  /**
   * Calculates Manhattan distance between two positions
   * @param {Vec3} pos1 - First position
   * @param {Vec3} pos2 - Second position
   * @returns {number} - Manhattan distance
   */
  static manhattanDistance(pos1, pos2) {
    return Math.abs(pos1.x - pos2.x) + 
           Math.abs(pos1.y - pos2.y) + 
           Math.abs(pos1.z - pos2.z);
  }

  /**
   * Calculates Euclidean distance between two positions
   * @param {Vec3} pos1 - First position
   * @param {Vec3} pos2 - Second position
   * @returns {number} - Euclidean distance
   */
  static euclideanDistance(pos1, pos2) {
    return Math.sqrt(
      Math.pow(pos1.x - pos2.x, 2) + 
      Math.pow(pos1.y - pos2.y, 2) + 
      Math.pow(pos1.z - pos2.z, 2)
    );
  }

  /**
   * Calculates horizontal distance between two positions (ignoring Y)
   * @param {Vec3} pos1 - First position
   * @param {Vec3} pos2 - Second position
   * @returns {number} - Horizontal distance
   */
  static horizontalDistance(pos1, pos2) {
    return Math.sqrt(
      Math.pow(pos1.x - pos2.x, 2) + 
      Math.pow(pos1.z - pos2.z, 2)
    );
  }

  /**
   * Gets all adjacent positions (6 directions)
   * @param {Vec3} pos - Center position
   * @returns {Vec3[]} - Array of adjacent positions
   */
  static getAdjacent(pos) {
    return [
      pos.offset(1, 0, 0),
      pos.offset(-1, 0, 0),
      pos.offset(0, 1, 0),
      pos.offset(0, -1, 0),
      pos.offset(0, 0, 1),
      pos.offset(0, 0, -1)
    ];
  }

  /**
   * Gets all surrounding positions (26 directions)
   * @param {Vec3} pos - Center position
   * @returns {Vec3[]} - Array of surrounding positions
   */
  static getSurrounding(pos) {
    const surrounding = [];
    
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          // Skip the center position
          if (x === 0 && y === 0 && z === 0) continue;
          
          surrounding.push(pos.offset(x, y, z));
        }
      }
    }
    
    return surrounding;
  }

  /**
   * Checks if two positions are equal
   * @param {Vec3} pos1 - First position
   * @param {Vec3} pos2 - Second position
   * @returns {boolean} - True if positions are equal
   */
  static areEqual(pos1, pos2) {
    return pos1.x === pos2.x && pos1.y === pos2.y && pos1.z === pos2.z;
  }

  /**
   * Rounds a position to block coordinates
   * @param {Vec3} pos - Position to round
   * @returns {Vec3} - New Vec3 with rounded coordinates
   */
  static roundToBlock(pos) {
    return new Vec3(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z));
  }

  /**
   * Gets the center of a block
   * @param {Vec3} blockPos - Block position
   * @returns {Vec3} - Position at the center of the block
   */
  static blockCenter(blockPos) {
    return new Vec3(
      Math.floor(blockPos.x) + 0.5,
      Math.floor(blockPos.y) + 0.5,
      Math.floor(blockPos.z) + 0.5
    );
  }
}