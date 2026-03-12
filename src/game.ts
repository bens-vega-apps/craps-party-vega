export type BetSide = 'pass' | 'dontPass';

export interface Bet {
  side: BetSide;
  amount: number;
}

export interface Roll {
  die1: number;
  die2: number;
  total: number;
}

export type RollOutcome =
  | 'pass_win'
  | 'pass_lose'
  | 'push'
  | 'point_set'
  | 'no_decision';

export interface RollResolution {
  outcome: RollOutcome;
  nextPoint: number | null;
  status: string;
}

const randomDie = (): number => Math.floor(Math.random() * 6) + 1;

export const rollDice = (): Roll => {
  const die1 = randomDie();
  const die2 = randomDie();
  return {die1, die2, total: die1 + die2};
};

export const resolveRoll = (
  point: number | null,
  total: number,
): RollResolution => {
  if (point === null) {
    if (total === 7 || total === 11) {
      return {
        outcome: 'pass_win',
        nextPoint: null,
        status: `Come-out ${total}. Pass line wins.`,
      };
    }

    if (total === 2 || total === 3) {
      return {
        outcome: 'pass_lose',
        nextPoint: null,
        status: `Come-out ${total}. Craps. Pass line loses.`,
      };
    }

    if (total === 12) {
      return {
        outcome: 'push',
        nextPoint: null,
        status: "Come-out 12. Pass loses and Don't Pass pushes.",
      };
    }

    return {
      outcome: 'point_set',
      nextPoint: total,
      status: `Point is now ${total}. Keep rolling.`,
    };
  }

  if (total === point) {
    return {
      outcome: 'pass_win',
      nextPoint: null,
      status: `Made the point (${point}). Pass line wins.`,
    };
  }

  if (total === 7) {
    return {
      outcome: 'pass_lose',
      nextPoint: null,
      status: 'Seven out. Pass line loses.',
    };
  }

  return {
    outcome: 'no_decision',
    nextPoint: point,
    status: `Rolled ${total}. Point is still ${point}.`,
  };
};

export const settleBet = (
  chips: number,
  bet: Bet | null,
  outcome: RollOutcome,
): number => {
  if (!bet) {
    return chips;
  }

  if (outcome === 'point_set' || outcome === 'no_decision') {
    return chips;
  }

  if (outcome === 'push') {
    // In this simplified ruleset, "push" represents come-out 12:
    // Pass loses while Don't Pass pushes.
    if (bet.side === 'pass') {
      return Math.max(0, chips - bet.amount);
    }
    return chips;
  }

  const deltaPass = outcome === 'pass_win' ? bet.amount : -bet.amount;
  const delta = bet.side === 'pass' ? deltaPass : -deltaPass;
  return Math.max(0, chips + delta);
};

export const isRoundDecision = (
  outcome: RollOutcome,
): outcome is 'pass_win' | 'pass_lose' | 'push' => {
  return (
    outcome === 'pass_win' || outcome === 'pass_lose' || outcome === 'push'
  );
};

export const sideLabel = (side: BetSide): string => {
  return side === 'pass' ? 'Pass' : "Don't Pass";
};
