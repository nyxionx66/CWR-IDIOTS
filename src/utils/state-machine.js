import { BotStateMachine, BehaviorIdle, NestedStateMachine } from 'mineflayer-statemachine';
import { Logger } from './logger.js';

export class StateMachineManager {
  constructor(bot) {
    this.bot = bot;
    this.stateMachines = new Map();
    this.rootStateMachine = null;
  }

  createStateMachine(name, states, transitions, rootState = null) {
    try {
      // Create a new state machine
      const stateMachine = new BotStateMachine(this.bot, states, transitions, rootState);
      
      // Store the state machine
      this.stateMachines.set(name, stateMachine);
      
      Logger.debug(`Created state machine: ${name}`);
      return stateMachine;
    } catch (error) {
      Logger.error(`Failed to create state machine '${name}': ${error.message}`);
      return null;
    }
  }

  createRootStateMachine() {
    // Create a default idle state
    const idleState = new BehaviorIdle();
    
    // Create the root state machine with just the idle state
    this.rootStateMachine = this.createStateMachine('root', [idleState], [], idleState);
    
    return this.rootStateMachine;
  }

  createNestedStateMachine(name, parentMachine, parentState, states, transitions, rootState = null) {
    try {
      // Create a nested state machine
      const nestedMachine = new NestedStateMachine(
        parentMachine,
        parentState,
        states,
        transitions,
        rootState
      );
      
      // Store the nested state machine
      this.stateMachines.set(name, nestedMachine);
      
      Logger.debug(`Created nested state machine: ${name}`);
      return nestedMachine;
    } catch (error) {
      Logger.error(`Failed to create nested state machine '${name}': ${error.message}`);
      return null;
    }
  }

  getStateMachine(name) {
    return this.stateMachines.get(name);
  }

  startStateMachine(name) {
    const stateMachine = this.stateMachines.get(name);
    
    if (!stateMachine) {
      Logger.warn(`Cannot start state machine '${name}': Not found`);
      return false;
    }
    
    try {
      stateMachine.start();
      Logger.info(`Started state machine: ${name}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to start state machine '${name}': ${error.message}`);
      return false;
    }
  }

  stopStateMachine(name) {
    const stateMachine = this.stateMachines.get(name);
    
    if (!stateMachine) {
      Logger.warn(`Cannot stop state machine '${name}': Not found`);
      return false;
    }
    
    try {
      stateMachine.stop();
      Logger.info(`Stopped state machine: ${name}`);
      return true;
    } catch (error) {
      Logger.error(`Failed to stop state machine '${name}': ${error.message}`);
      return false;
    }
  }

  getCurrentState(name) {
    const stateMachine = this.stateMachines.get(name);
    
    if (!stateMachine) {
      Logger.warn(`Cannot get current state of '${name}': State machine not found`);
      return null;
    }
    
    return stateMachine.currentState;
  }

  transitionTo(machineName, stateName) {
    const stateMachine = this.stateMachines.get(machineName);
    
    if (!stateMachine) {
      Logger.warn(`Cannot transition in '${machineName}': State machine not found`);
      return false;
    }
    
    const targetState = stateMachine.states.find(state => state.name === stateName);
    
    if (!targetState) {
      Logger.warn(`Cannot transition to '${stateName}': State not found in machine '${machineName}'`);
      return false;
    }
    
    try {
      stateMachine.setCurrentState(targetState);
      Logger.debug(`Transitioned to state '${stateName}' in machine '${machineName}'`);
      return true;
    } catch (error) {
      Logger.error(`Failed to transition to state '${stateName}': ${error.message}`);
      return false;
    }
  }
}