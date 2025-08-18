export enum GameStatus {
  PENDING = 'pending',
  ONGOING = 'ongoing',
  CHECKMATE = 'checkmate',
  STALEMATE = 'stalemate',
  DRAW = 'draw',
  RESIGNED = 'resigned',
  TIMEOUT = 'timeout',
  ABORTED = 'aborted',
}

export enum Color {
  WHITE = 'white',
  BLACK = 'black',
}

export enum ResultReason {
  CHECKMATE = 'checkmate',
  STALEMATE = 'stalemate',
  DRAW_50 = 'draw-50-move',
  DRAW_REP = 'draw-repetition',
  DRAW_AGREEMENT = 'draw-agreement',
  RESIGNATION = 'resignation',
  TIMEOUT = 'timeout',
  ABORTED = 'aborted',
  UNDECIDED = 'null',
}

export enum Winner {
  HUMAN = 'human',
  AI = 'ai',
  UNDECICED = 'null',
}

export enum GameLevel {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
  EXPERT = 'expert',
  GRANDMASTER = 'grandmaster',
}
