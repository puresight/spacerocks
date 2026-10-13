export type GamePhase = 'ready' | 'playing' | 'gameover';

export interface GameState {
  phase: GamePhase;
  wave: number;
  score: number;
  lives: number;
}

export type GameStateListener = (state: GameState) => void;
