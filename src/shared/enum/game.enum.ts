export enum GameStatus {
  PENDING = 'pending',
  ONGOING = 'ongoing',
  ENDED = 'ended',
  CHECKMATE = 'checkmate',
  STALEMATE = 'stalemate',
  DRAW = 'draw',
  RESIGNED = 'resigned',
  TIMEOUT = 'timeout',
  ABORTED = 'aborted',
  WAITING = 'waiting',
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
  INSUFFICIENT_MATERIAL = 'insufficient-material',
  THREEFOLD_REPETITION = 'threefold-repetition',
  TIMEOUT = 'timeout',
  ABORTED = 'aborted',
  UNDECIDED = 'null',
}

export enum Winner {
  HUMAN = 'human',
  AI = 'ai',
  UNDECICED = 'null',
  WHITE = 'white',
  BLACK = 'black',
}

export enum GameLevel {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
  EXPERT = 'expert',
  GRANDMASTER = 'grandmaster',
}
