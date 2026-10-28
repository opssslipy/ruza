import { emptySave, loadSave, writeSave } from '../save';
import { newGame, type GameState } from './state';

// One shared game state for all scenes; every scene mutates it and calls persist().
let state: GameState | null = null;

export function getState(): GameState {
  if (!state) state = loadSave().game;
  return state;
}

export function persist(): void {
  if (state) writeSave({ ...emptySave(), game: state });
}

export function restart(): GameState {
  state = newGame();
  persist();
  return state;
}
