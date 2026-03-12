import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Pressable, SafeAreaView, StyleSheet, Text, View} from 'react-native';
import {HWEvent, useTVEventHandler} from '@amazon-devices/react-native-kepler';
import {
  Bet,
  BetSide,
  Roll,
  isRoundDecision,
  resolveRoll,
  rollDice,
  settleBet,
  sideLabel,
} from './game';
import {
  HOST_CHIPS_START,
  JOIN_BASE_URL,
  JOIN_NETWORK_HINT,
  PLAYER_CHIPS_START,
  RELAY_WS_URL,
} from './config';

type ConnectionState = 'connecting' | 'connected' | 'offline';
type PlaceBetTarget =
  | 'place4'
  | 'place5'
  | 'place6'
  | 'place8'
  | 'place9'
  | 'place10';
type BackupBetTarget =
  | 'backup4'
  | 'backup5'
  | 'backup6'
  | 'backup8'
  | 'backup9'
  | 'backup10';
type ComeOddsBetTarget =
  | 'comeOdds4'
  | 'comeOdds5'
  | 'comeOdds6'
  | 'comeOdds8'
  | 'comeOdds9'
  | 'comeOdds10';
type BetTarget =
  | 'passSouth'
  | 'dontPass'
  | 'come'
  | 'field'
  | 'odds'
  | PlaceBetTarget
  | BackupBetTarget
  | ComeOddsBetTarget;
type PointNumber = 4 | 5 | 6 | 8 | 9 | 10;
type ComePointBets = Record<PointNumber, number>;
type TableTokenZone = 'pass' | 'dontPass' | 'come' | 'field' | 'odds';
type PlayerBetTarget =
  | 'pass'
  | 'dontPass'
  | 'come'
  | 'field'
  | 'odds'
  | 'comeOdds'
  | 'place'
  | 'backup';

interface RoomPlayer {
  id: string;
  name: string;
  chips: number;
  passBet: number;
  dontPassBet: number;
  comeBet: number;
  comePointBets: ComePointBets;
  comeOddsBets: ComePointBets;
  fieldBet: number;
  oddsBet: number;
  placeBets: ComePointBets;
  placeBackupBets: ComePointBets;
}

interface RoomPresenceMessage {
  type: 'room_presence';
  players: Array<{id: string; name: string}>;
}

interface PlayerBetMessage {
  type: 'player_bet';
  playerId: string;
  name: string;
  target?: PlayerBetTarget;
  side?: BetSide;
  number?: number;
  amount: number;
}

interface PointMarkerToken {
  id: string;
  label: string;
  amount: number;
  isHost: boolean;
  markerType: 'come' | 'place' | 'backup' | 'comeOdds';
}

interface TableToken {
  id: string;
  label: string;
  amount: number;
  zone: TableTokenZone;
  color: string;
  isHost: boolean;
}

interface GameSnapshot {
  point: number | null;
  hostChips: number;
  hostPassBet: number;
  hostDontPassBet: number;
  hostComeBet: number;
  hostComePointBets: ComePointBets;
  hostComeOddsBets: ComePointBets;
  hostFieldBet: number;
  hostOddsBet: number;
  hostPlaceBets: ComePointBets;
  hostPlaceBackupBets: ComePointBets;
  players: Record<string, RoomPlayer>;
}

interface DiceMotion {
  die1X: number;
  die1Y: number;
  die1Rotation: number;
  die2X: number;
  die2Y: number;
  die2Rotation: number;
}

const MIN_BET = 5;
const ROLL_ANIMATION_MIN_MS = 2000;
const ROLL_ANIMATION_MAX_MS = 3000;
const ROLL_ANIMATION_TICK_MS = 90;
const TABLE_REGION_HEIGHT = 100;
const POINT_BOX_HEIGHT = 256;
const CHIPS_PER_ROW = 2;
const CHIP_COLORS = [
  '#f8e16c',
  '#7fd1b9',
  '#ff9f68',
  '#caa5ff',
  '#f78fb3',
  '#8be5ff',
];
const POINT_BOX_NUMBERS: PointNumber[] = [4, 5, 6, 8, 9, 10];
const PLACE_TARGETS_BY_POINT: Record<PointNumber, PlaceBetTarget> = {
  4: 'place4',
  5: 'place5',
  6: 'place6',
  8: 'place8',
  9: 'place9',
  10: 'place10',
};
const BACKUP_TARGETS_BY_POINT: Record<PointNumber, BackupBetTarget> = {
  4: 'backup4',
  5: 'backup5',
  6: 'backup6',
  8: 'backup8',
  9: 'backup9',
  10: 'backup10',
};
const COME_ODDS_TARGETS_BY_POINT: Record<PointNumber, ComeOddsBetTarget> = {
  4: 'comeOdds4',
  5: 'comeOdds5',
  6: 'comeOdds6',
  8: 'comeOdds8',
  9: 'comeOdds9',
  10: 'comeOdds10',
};
const PLACE_TARGET_POINT_MAP: Record<PlaceBetTarget, PointNumber> = {
  place4: 4,
  place5: 5,
  place6: 6,
  place8: 8,
  place9: 9,
  place10: 10,
};
const BACKUP_TARGET_POINT_MAP: Record<BackupBetTarget, PointNumber> = {
  backup4: 4,
  backup5: 5,
  backup6: 6,
  backup8: 8,
  backup9: 9,
  backup10: 10,
};
const COME_ODDS_TARGET_POINT_MAP: Record<ComeOddsBetTarget, PointNumber> = {
  comeOdds4: 4,
  comeOdds5: 5,
  comeOdds6: 6,
  comeOdds8: 8,
  comeOdds9: 9,
  comeOdds10: 10,
};
const CHIP_DENOMS = [500, 100, 25, 5, 1] as const;
const CHIP_VISUALS: Record<
  number,
  {label: string; fill: string; text: string}
> = {
  1: {label: '1', fill: '#ececec', text: '#111111'},
  5: {label: '5', fill: '#b62025', text: '#ffffff'},
  25: {label: '25', fill: '#2ca85f', text: '#ffffff'},
  100: {label: '100', fill: '#161616', text: '#ffffff'},
  500: {label: '500', fill: '#6a35bd', text: '#ffffff'},
};
const PIP_COORDS = {
  tl: {top: 10, left: 10},
  tc: {top: 10, left: 30},
  tr: {top: 10, left: 50},
  cl: {top: 30, left: 10},
  cc: {top: 30, left: 30},
  cr: {top: 30, left: 50},
  bl: {top: 50, left: 10},
  bc: {top: 50, left: 30},
  br: {top: 50, left: 50},
} as const;
const BOTTOM_RACK_CHIPS = [
  {label: '1', fill: '#ececec', text: '#111111'},
  {label: '5', fill: '#b62025', text: '#ffffff'},
  {label: '25', fill: '#2ca85f', text: '#ffffff'},
  {label: '100', fill: '#161616', text: '#ffffff'},
  {label: '500', fill: '#6a35bd', text: '#ffffff'},
];

const createEmptyComePointBets = (): ComePointBets => ({
  4: 0,
  5: 0,
  6: 0,
  8: 0,
  9: 0,
  10: 0,
});

const createRoomPlayer = (id: string, name: string): RoomPlayer => ({
  id,
  name,
  chips: PLAYER_CHIPS_START,
  passBet: 0,
  dontPassBet: 0,
  comeBet: 0,
  comePointBets: createEmptyComePointBets(),
  comeOddsBets: createEmptyComePointBets(),
  fieldBet: 0,
  oddsBet: 0,
  placeBets: createEmptyComePointBets(),
  placeBackupBets: createEmptyComePointBets(),
});

const createRoomCode = (): string => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let output = '';
  for (let index = 0; index < 4; index += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return output;
};

const clampBet = (value: number): number => {
  return Math.max(MIN_BET, Math.floor(value));
};

const clampBetForChips = (value: number, chips: number): number => {
  if (chips <= 0) {
    return 0;
  }
  return Math.min(chips, clampBet(value));
};

const getTokenLabel = (name: string, isHost: boolean): string => {
  if (isHost) {
    return 'HOST';
  }
  return name.slice(0, 3).toUpperCase();
};

const makeRandomDice = (): Roll => {
  const result = rollDice();
  return {
    die1: result.die1,
    die2: result.die2,
    total: result.die1 + result.die2,
  };
};

const randomBetween = (min: number, max: number): number => {
  return Math.random() * (max - min) + min;
};

const randomBetweenInt = (min: number, max: number): number => {
  return Math.floor(randomBetween(min, max + 1));
};

const makeRollingMotion = (): DiceMotion => {
  return {
    die1X: randomBetween(-18, 18),
    die1Y: randomBetween(-14, 14),
    die1Rotation: randomBetween(-45, 45),
    die2X: randomBetween(-18, 18),
    die2Y: randomBetween(-14, 14),
    die2Rotation: randomBetween(-45, 45),
  };
};

const getPipsForValue = (value: number): Array<keyof typeof PIP_COORDS> => {
  switch (value) {
    case 1:
      return ['cc'];
    case 2:
      return ['tl', 'br'];
    case 3:
      return ['tl', 'cc', 'br'];
    case 4:
      return ['tl', 'tr', 'bl', 'br'];
    case 5:
      return ['tl', 'tr', 'cc', 'bl', 'br'];
    case 6:
      return ['tl', 'tr', 'cl', 'cr', 'bl', 'br'];
    default:
      return ['cc'];
  }
};

const isPointNumber = (value: number): value is PointNumber => {
  return POINT_BOX_NUMBERS.includes(value as PointNumber);
};

const getComePointTotal = (comePointBets: ComePointBets): number => {
  return POINT_BOX_NUMBERS.reduce(
    (sum, number) => sum + (comePointBets[number] ?? 0),
    0,
  );
};

const getFieldPayoutMultiplier = (total: number): number => {
  if (total === 2 || total === 12) {
    return 2;
  }
  return 1;
};

const betTargetLabel = (target: BetTarget): string => {
  if (target === 'passSouth') {
    return 'Pass Line';
  }
  if (target === 'dontPass') {
    return "Don't Pass Bar";
  }
  if (target === 'come') {
    return 'Come';
  }
  if (target === 'field') {
    return 'Field';
  }
  if (target === 'odds') {
    return 'Pass Odds';
  }
  if (target in PLACE_TARGET_POINT_MAP) {
    return `Place ${PLACE_TARGET_POINT_MAP[target as PlaceBetTarget]}`;
  }
  if (target in COME_ODDS_TARGET_POINT_MAP) {
    return `Come Odds ${
      COME_ODDS_TARGET_POINT_MAP[target as ComeOddsBetTarget]
    }`;
  }
  return `Backup ${BACKUP_TARGET_POINT_MAP[target as BackupBetTarget]}`;
};

const playerBetTargetLabel = (target: PlayerBetTarget): string => {
  if (target === 'pass') {
    return 'Pass Line';
  }
  if (target === 'dontPass') {
    return "Don't Pass Bar";
  }
  if (target === 'come') {
    return 'Come';
  }
  if (target === 'field') {
    return 'Field';
  }
  if (target === 'odds') {
    return 'Odds Backup';
  }
  if (target === 'comeOdds') {
    return 'Come Odds';
  }
  if (target === 'backup') {
    return 'Place Backup';
  }
  return 'Place Bet';
};

const getPlacePointForTarget = (target: BetTarget): PointNumber | null => {
  if (target in PLACE_TARGET_POINT_MAP) {
    return PLACE_TARGET_POINT_MAP[target as PlaceBetTarget];
  }
  return null;
};

const getBackupPointForTarget = (target: BetTarget): PointNumber | null => {
  if (target in BACKUP_TARGET_POINT_MAP) {
    return BACKUP_TARGET_POINT_MAP[target as BackupBetTarget];
  }
  return null;
};

const getComeOddsPointForTarget = (target: BetTarget): PointNumber | null => {
  if (target in COME_ODDS_TARGET_POINT_MAP) {
    return COME_ODDS_TARGET_POINT_MAP[target as ComeOddsBetTarget];
  }
  return null;
};

const getMaxOddsMultiple = (point: number | null): number => {
  if (point === null) {
    return 0;
  }
  if (point === 4 || point === 10) {
    return 3;
  }
  if (point === 5 || point === 9) {
    return 4;
  }
  if (point === 6 || point === 8) {
    return 5;
  }
  return 0;
};

const getOddsPayout = (amount: number, point: number): number => {
  if (point === 4 || point === 10) {
    return amount * 2;
  }
  if (point === 5 || point === 9) {
    return Math.floor((amount * 3) / 2);
  }
  return Math.floor((amount * 6) / 5);
};

const getPlacePayout = (amount: number, number: PointNumber): number => {
  if (number === 4 || number === 10) {
    return Math.floor((amount * 9) / 5);
  }
  if (number === 5 || number === 9) {
    return Math.floor((amount * 7) / 5);
  }
  return Math.floor((amount * 7) / 6);
};

const settleOddsBet = (
  chips: number,
  oddsBet: number,
  point: number | null,
  outcome: 'pass_win' | 'pass_lose' | 'push',
): number => {
  if (oddsBet <= 0 || point === null) {
    return chips;
  }
  if (outcome === 'pass_lose') {
    return Math.max(0, chips - oddsBet);
  }
  if (outcome === 'pass_win') {
    return chips + getOddsPayout(oddsBet, point);
  }
  return chips;
};

const decomposeChips = (amount: number): number[] => {
  let remaining = amount;
  const chips: number[] = [];

  CHIP_DENOMS.forEach((denom) => {
    while (remaining >= denom && chips.length < 9) {
      chips.push(denom);
      remaining -= denom;
    }
  });

  if (chips.length === 0) {
    chips.push(1);
  }

  return chips;
};

const getRealChipStyle = (denom: number, chipIndex: number) => {
  return {
    backgroundColor: CHIP_VISUALS[denom].fill,
    marginLeft: chipIndex === 0 ? 0 : -16,
    zIndex: 100 - chipIndex,
  };
};

const getComePointChipStyle = (
  denom: number,
  chipIndex: number,
  compact = false,
) => {
  return {
    backgroundColor: CHIP_VISUALS[denom].fill,
    marginLeft: chipIndex === 0 ? 0 : compact ? -12 : -10,
    zIndex: 10 - chipIndex,
  };
};

export const App = () => {
  const roomCode = useMemo(() => createRoomCode(), []);
  const joinBaseUrl = useMemo(() => JOIN_BASE_URL.replace(/\/$/, ''), []);
  const joinUrl = useMemo(() => {
    return `${joinBaseUrl}/?room=${roomCode}`;
  }, [joinBaseUrl, roomCode]);

  const wsRef = useRef<WebSocket | null>(null);
  const rollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [connectionState, setConnectionState] =
    useState<ConnectionState>('connecting');
  const [point, setPoint] = useState<number | null>(null);
  const [lastRoll, setLastRoll] = useState<string>('No roll yet');
  const [status, setStatus] = useState<string>('Waiting for first roll.');
  const [hostChips, setHostChips] = useState<number>(HOST_CHIPS_START);
  const [hostPassBet, setHostPassBet] = useState<number>(25);
  const [hostDontPassBet, setHostDontPassBet] = useState<number>(0);
  const [hostComeBet, setHostComeBet] = useState<number>(0);
  const [hostComePointBets, setHostComePointBets] = useState<ComePointBets>(
    () => createEmptyComePointBets(),
  );
  const [hostComeOddsBets, setHostComeOddsBets] = useState<ComePointBets>(() =>
    createEmptyComePointBets(),
  );
  const [hostFieldBet, setHostFieldBet] = useState<number>(0);
  const [hostPlaceBets, setHostPlaceBets] = useState<ComePointBets>(() =>
    createEmptyComePointBets(),
  );
  const [hostPlaceBackupBets, setHostPlaceBackupBets] = useState<ComePointBets>(
    () => createEmptyComePointBets(),
  );
  const [betSize, setBetSize] = useState<number>(25);
  const [hostOddsBet, setHostOddsBet] = useState<number>(0);
  const [selectedBetTarget, setSelectedBetTarget] =
    useState<BetTarget>('passSouth');
  const [players, setPlayers] = useState<Record<string, RoomPlayer>>({});
  const [dice, setDice] = useState<Roll>({die1: 1, die2: 1, total: 2});
  const [diceMotion, setDiceMotion] = useState<DiceMotion>({
    die1X: 0,
    die1Y: 0,
    die1Rotation: 0,
    die2X: 0,
    die2Y: 0,
    die2Rotation: 0,
  });
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [, setLogLines] = useState<string[]>([
    'Room created. Waiting for players to join.',
  ]);

  const gameSnapshotRef = useRef<GameSnapshot>({
    point,
    hostChips,
    hostPassBet,
    hostDontPassBet,
    hostComeBet,
    hostComePointBets,
    hostComeOddsBets,
    hostFieldBet,
    hostPlaceBets,
    hostPlaceBackupBets,
    hostOddsBet,
    players,
  });

  useEffect(() => {
    gameSnapshotRef.current = {
      point,
      hostChips,
      hostPassBet,
      hostDontPassBet,
      hostComeBet,
      hostComePointBets,
      hostComeOddsBets,
      hostFieldBet,
      hostPlaceBets,
      hostPlaceBackupBets,
      hostOddsBet,
      players,
    };
  }, [
    hostChips,
    hostComeBet,
    hostComePointBets,
    hostComeOddsBets,
    hostDontPassBet,
    hostFieldBet,
    hostPlaceBets,
    hostPlaceBackupBets,
    hostOddsBet,
    hostPassBet,
    players,
    point,
  ]);

  useEffect(() => {
    setBetSize((previous) => clampBetForChips(previous, hostChips));
  }, [hostChips]);

  useEffect(() => {
    setHostOddsBet((previous) => {
      if (point === null || hostPassBet <= 0) {
        return 0;
      }
      const maxOdds = hostPassBet * getMaxOddsMultiple(point);
      return Math.min(previous, maxOdds, hostChips);
    });
  }, [hostChips, hostPassBet, point]);

  useEffect(() => {
    setHostPlaceBackupBets((previous) => {
      const next: ComePointBets = {...previous};
      POINT_BOX_NUMBERS.forEach((number) => {
        const maxBackup = hostPlaceBets[number] * getMaxOddsMultiple(number);
        next[number] = Math.min(previous[number], maxBackup, hostChips);
      });
      return next;
    });
  }, [hostChips, hostPlaceBets]);

  useEffect(() => {
    setHostComeOddsBets((previous) => {
      const next: ComePointBets = {...previous};
      POINT_BOX_NUMBERS.forEach((number) => {
        const maxComeOdds =
          hostComePointBets[number] * getMaxOddsMultiple(number);
        next[number] = Math.min(previous[number], maxComeOdds, hostChips);
      });
      return next;
    });
  }, [hostChips, hostComePointBets]);

  const availableBetTargets = useMemo(() => {
    const targets: BetTarget[] = ['passSouth', 'dontPass', 'field'];

    if (point !== null) {
      targets.push('come');
    }

    if (point !== null && hostPassBet > 0) {
      targets.push('odds');
    }

    POINT_BOX_NUMBERS.forEach((number) => {
      targets.push(PLACE_TARGETS_BY_POINT[number]);

      if (hostComePointBets[number] > 0) {
        targets.push(COME_ODDS_TARGETS_BY_POINT[number]);
      }

      if (hostPlaceBets[number] > 0) {
        targets.push(BACKUP_TARGETS_BY_POINT[number]);
      }
    });

    return targets;
  }, [hostComePointBets, hostPassBet, hostPlaceBets, point]);

  useEffect(() => {
    if (!availableBetTargets.includes(selectedBetTarget)) {
      setSelectedBetTarget(availableBetTargets[0] ?? 'passSouth');
    }
  }, [availableBetTargets, selectedBetTarget]);

  const appendLog = useCallback((line: string) => {
    setLogLines((previous) => [line, ...previous].slice(0, 10));
  }, []);

  const clearRollTimers = useCallback(() => {
    if (rollIntervalRef.current) {
      clearInterval(rollIntervalRef.current);
      rollIntervalRef.current = null;
    }
    if (rollTimeoutRef.current) {
      clearTimeout(rollTimeoutRef.current);
      rollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearRollTimers();
    };
  }, [clearRollTimers]);

  const send = useCallback((payload: unknown) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(payload));
  }, []);

  const playerRows = useMemo(() => {
    return Object.values(players).sort((first, second) =>
      first.name.localeCompare(second.name),
    );
  }, [players]);

  const tableTokens = useMemo(() => {
    const tokens: TableToken[] = [];

    if (hostPassBet > 0) {
      tokens.push({
        id: 'host-pass-bet',
        label: getTokenLabel('HOST', true),
        amount: hostPassBet,
        zone: 'pass',
        color: '#f4d35e',
        isHost: true,
      });
    }

    if (hostDontPassBet > 0) {
      tokens.push({
        id: 'host-dont-pass-bet',
        label: getTokenLabel('HOST', true),
        amount: hostDontPassBet,
        zone: 'dontPass',
        color: '#f4d35e',
        isHost: true,
      });
    }

    if (hostComeBet > 0) {
      tokens.push({
        id: 'host-come-bet',
        label: getTokenLabel('HOST', true),
        amount: hostComeBet,
        zone: 'come',
        color: '#f4d35e',
        isHost: true,
      });
    }

    if (hostFieldBet > 0) {
      tokens.push({
        id: 'host-field-bet',
        label: getTokenLabel('HOST', true),
        amount: hostFieldBet,
        zone: 'field',
        color: '#f4d35e',
        isHost: true,
      });
    }

    if (hostOddsBet > 0) {
      tokens.push({
        id: 'host-odds',
        label: getTokenLabel('HOST', true),
        amount: hostOddsBet,
        zone: 'odds',
        color: '#f4d35e',
        isHost: true,
      });
    }

    playerRows.forEach((player, index) => {
      const color = CHIP_COLORS[index % CHIP_COLORS.length];
      const label = getTokenLabel(player.name, false);

      if (player.passBet > 0) {
        tokens.push({
          id: `${player.id}-pass`,
          label,
          amount: player.passBet,
          zone: 'pass',
          color,
          isHost: false,
        });
      }

      if (player.dontPassBet > 0) {
        tokens.push({
          id: `${player.id}-dont-pass`,
          label,
          amount: player.dontPassBet,
          zone: 'dontPass',
          color,
          isHost: false,
        });
      }

      if (player.comeBet > 0) {
        tokens.push({
          id: `${player.id}-come`,
          label,
          amount: player.comeBet,
          zone: 'come',
          color,
          isHost: false,
        });
      }

      if (player.fieldBet > 0) {
        tokens.push({
          id: `${player.id}-field`,
          label,
          amount: player.fieldBet,
          zone: 'field',
          color,
          isHost: false,
        });
      }

      if (player.oddsBet > 0) {
        tokens.push({
          id: `${player.id}-odds`,
          label,
          amount: player.oddsBet,
          zone: 'odds',
          color,
          isHost: false,
        });
      }
    });

    return tokens;
  }, [
    hostComeBet,
    hostDontPassBet,
    hostFieldBet,
    hostOddsBet,
    hostPassBet,
    playerRows,
  ]);

  const pointMarkers = useMemo(() => {
    const markersByPoint: Record<PointNumber, PointMarkerToken[]> = {
      4: [],
      5: [],
      6: [],
      8: [],
      9: [],
      10: [],
    };

    POINT_BOX_NUMBERS.forEach((number) => {
      if (hostComePointBets[number] > 0) {
        markersByPoint[number].push({
          id: `host-come-point-${number}`,
          label: getTokenLabel('HOST', true),
          amount: hostComePointBets[number],
          isHost: true,
          markerType: 'come',
        });
      }
      if (hostComeOddsBets[number] > 0) {
        markersByPoint[number].push({
          id: `host-come-odds-point-${number}`,
          label: getTokenLabel('HOST', true),
          amount: hostComeOddsBets[number],
          isHost: true,
          markerType: 'comeOdds',
        });
      }
      if (hostPlaceBets[number] > 0) {
        markersByPoint[number].push({
          id: `host-place-point-${number}`,
          label: getTokenLabel('HOST', true),
          amount: hostPlaceBets[number],
          isHost: true,
          markerType: 'place',
        });
      }
      if (hostPlaceBackupBets[number] > 0) {
        markersByPoint[number].push({
          id: `host-place-backup-point-${number}`,
          label: getTokenLabel('HOST', true),
          amount: hostPlaceBackupBets[number],
          isHost: true,
          markerType: 'backup',
        });
      }
    });

    playerRows.forEach((player) => {
      POINT_BOX_NUMBERS.forEach((number) => {
        const comeAmount = player.comePointBets[number] ?? 0;
        if (comeAmount > 0) {
          markersByPoint[number].push({
            id: `${player.id}-come-point-${number}`,
            label: getTokenLabel(player.name, false),
            amount: comeAmount,
            isHost: false,
            markerType: 'come',
          });
        }

        const comeOddsAmount = player.comeOddsBets?.[number] ?? 0;
        if (comeOddsAmount > 0) {
          markersByPoint[number].push({
            id: `${player.id}-come-odds-point-${number}`,
            label: getTokenLabel(player.name, false),
            amount: comeOddsAmount,
            isHost: false,
            markerType: 'comeOdds',
          });
        }

        const placeAmount = player.placeBets[number] ?? 0;
        if (placeAmount > 0) {
          markersByPoint[number].push({
            id: `${player.id}-place-point-${number}`,
            label: getTokenLabel(player.name, false),
            amount: placeAmount,
            isHost: false,
            markerType: 'place',
          });
        }

        const backupAmount = player.placeBackupBets[number] ?? 0;
        if (backupAmount > 0) {
          markersByPoint[number].push({
            id: `${player.id}-place-backup-point-${number}`,
            label: getTokenLabel(player.name, false),
            amount: backupAmount,
            isHost: false,
            markerType: 'backup',
          });
        }
      });
    });

    return markersByPoint;
  }, [
    hostComeOddsBets,
    hostComePointBets,
    hostPlaceBackupBets,
    hostPlaceBets,
    playerRows,
  ]);

  const passTokens = useMemo(() => {
    return tableTokens.filter((token) => token.zone === 'pass');
  }, [tableTokens]);

  const dontPassTokens = useMemo(() => {
    return tableTokens.filter((token) => token.zone === 'dontPass');
  }, [tableTokens]);

  const comeTokens = useMemo(() => {
    return tableTokens.filter((token) => token.zone === 'come');
  }, [tableTokens]);

  const fieldTokens = useMemo(() => {
    return tableTokens.filter((token) => token.zone === 'field');
  }, [tableTokens]);

  const oddsTokens = useMemo(() => {
    return tableTokens.filter((token) => token.zone === 'odds');
  }, [tableTokens]);

  const broadcastHostState = useCallback(() => {
    const playerList = Object.values(players).map((player) => ({
      id: player.id,
      name: player.name,
      chips: player.chips,
      passBet: player.passBet,
      dontPassBet: player.dontPassBet,
      comeBet: player.comeBet,
      comePointBets: player.comePointBets,
      comeOddsBets: player.comeOddsBets ?? createEmptyComePointBets(),
      fieldBet: player.fieldBet,
      oddsBet: player.oddsBet,
      placeBets: player.placeBets,
      placeBackupBets: player.placeBackupBets,
    }));
    const hostPrimaryBet: Bet =
      hostPassBet > 0
        ? {side: 'pass', amount: hostPassBet}
        : {side: 'dontPass', amount: hostDontPassBet};

    send({
      type: 'host_state',
      roomCode,
      state: {
        roomCode,
        joinUrl,
        point,
        status,
        lastRoll,
        host: {
          chips: hostChips,
          bet: hostPrimaryBet,
          passBet: hostPassBet,
          dontPassBet: hostDontPassBet,
          comeBet: hostComeBet,
          comePointBets: hostComePointBets,
          comeOddsBets: hostComeOddsBets,
          fieldBet: hostFieldBet,
          oddsBet: hostOddsBet,
          placeBets: hostPlaceBets,
          placeBackupBets: hostPlaceBackupBets,
        },
        players: playerList,
      },
    });
  }, [
    hostComeBet,
    hostComePointBets,
    hostComeOddsBets,
    hostDontPassBet,
    hostChips,
    hostFieldBet,
    hostOddsBet,
    hostPlaceBackupBets,
    hostPlaceBets,
    hostPassBet,
    joinUrl,
    lastRoll,
    players,
    point,
    roomCode,
    send,
    status,
  ]);

  useEffect(() => {
    const socket = new WebSocket(RELAY_WS_URL);
    wsRef.current = socket;
    setConnectionState('connecting');

    socket.onopen = () => {
      setConnectionState('connected');
      appendLog('Connected to relay server.');
      send({
        type: 'join_room',
        role: 'host',
        roomCode,
      });
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as
          | RoomPresenceMessage
          | PlayerBetMessage
          | {type: string; message?: string};

        if (message.type === 'room_presence') {
          const presence = message as RoomPresenceMessage;
          const snapshotPlayers = gameSnapshotRef.current.players;
          setPlayers((previous) => {
            const next: Record<string, RoomPlayer> = {};
            presence.players.forEach((player) => {
              const existing =
                previous[player.id] ??
                snapshotPlayers[player.id] ??
                createRoomPlayer(player.id, player.name);
              next[player.id] = {
                ...existing,
                name: player.name,
              };
            });
            gameSnapshotRef.current = {
              ...gameSnapshotRef.current,
              players: next,
            };
            return next;
          });
          return;
        }

        if (message.type === 'player_bet') {
          const playerBet = message as PlayerBetMessage;
          const latestSnapshot = gameSnapshotRef.current;
          const currentPoint = latestSnapshot.point;
          const incomingTarget =
            playerBet.target ??
            (playerBet.side === 'dontPass' ? 'dontPass' : 'pass');
          const target: PlayerBetTarget =
            incomingTarget === 'come' ||
            incomingTarget === 'field' ||
            incomingTarget === 'odds' ||
            incomingTarget === 'comeOdds' ||
            incomingTarget === 'place' ||
            incomingTarget === 'backup'
              ? incomingTarget
              : incomingTarget === 'dontPass'
              ? 'dontPass'
              : 'pass';
          const placeNumber = isPointNumber(Number(playerBet.number))
            ? (Number(playerBet.number) as PointNumber)
            : null;

          const normalizedIncomingName = playerBet.name.trim().toLowerCase();
          const matchedByName = Object.values(latestSnapshot.players).filter(
            (player) =>
              player.name.trim().toLowerCase() === normalizedIncomingName,
          );
          const snapshotPlayerById = latestSnapshot.players[playerBet.playerId];
          const sameNameWithPass = matchedByName
            .filter((player) => player.passBet > 0)
            .sort((first, second) => second.passBet - first.passBet)[0];
          const sameNameWithPlace =
            placeNumber !== null
              ? matchedByName
                  .filter((player) => player.placeBets[placeNumber] > 0)
                  .sort(
                    (first, second) =>
                      second.placeBets[placeNumber] -
                      first.placeBets[placeNumber],
                  )[0]
              : undefined;
          const sameNameWithComePoint =
            placeNumber !== null
              ? matchedByName
                  .filter((player) => player.comePointBets[placeNumber] > 0)
                  .sort(
                    (first, second) =>
                      second.comePointBets[placeNumber] -
                      first.comePointBets[placeNumber],
                  )[0]
              : undefined;

          let sourcePlayer = snapshotPlayerById ?? matchedByName[0];
          if (
            target === 'odds' &&
            sourcePlayer &&
            sourcePlayer.passBet <= 0 &&
            sameNameWithPass
          ) {
            sourcePlayer = sameNameWithPass;
          }
          if (
            target === 'backup' &&
            placeNumber !== null &&
            sourcePlayer &&
            sourcePlayer.placeBets[placeNumber] <= 0 &&
            sameNameWithPlace
          ) {
            sourcePlayer = sameNameWithPlace;
          }
          if (
            target === 'comeOdds' &&
            placeNumber !== null &&
            sourcePlayer &&
            sourcePlayer.comePointBets[placeNumber] <= 0 &&
            sameNameWithComePoint
          ) {
            sourcePlayer = sameNameWithComePoint;
          }

          const basePlayer =
            sourcePlayer ??
            createRoomPlayer(playerBet.playerId, playerBet.name);
          const currentPlayer =
            basePlayer.id === playerBet.playerId
              ? basePlayer
              : {
                  ...basePlayer,
                  id: playerBet.playerId,
                  name: playerBet.name,
                };
          const amount = clampBetForChips(
            playerBet.amount,
            currentPlayer.chips,
          );

          if (amount <= 0) {
            appendLog(`${playerBet.name} cannot bet: no chips available.`);
            return;
          }

          if (
            (target === 'place' ||
              target === 'backup' ||
              target === 'comeOdds') &&
            placeNumber === null
          ) {
            appendLog(
              `${playerBet.name} ${
                target === 'backup'
                  ? 'backup'
                  : target === 'comeOdds'
                  ? 'come odds'
                  : 'place'
              } bet blocked: invalid number.`,
            );
            return;
          }

          if (target === 'come' && currentPoint === null) {
            appendLog(`${playerBet.name} come bet blocked: point must be ON.`);
            return;
          }

          if (target === 'odds' && currentPoint === null) {
            appendLog(`${playerBet.name} odds blocked: point must be ON.`);
            return;
          }

          if (target === 'odds' && currentPlayer.passBet <= 0) {
            appendLog(
              `${playerBet.name} odds blocked: place a Pass Line bet first.`,
            );
            return;
          }

          if (
            target === 'comeOdds' &&
            placeNumber !== null &&
            currentPlayer.comePointBets[placeNumber] <= 0
          ) {
            appendLog(
              `${playerBet.name} come odds blocked: place a Come point on ${placeNumber} first.`,
            );
            return;
          }

          if (
            target === 'backup' &&
            placeNumber !== null &&
            currentPlayer.placeBets[placeNumber] <= 0
          ) {
            appendLog(
              `${playerBet.name} backup blocked: place a Place ${placeNumber} bet first.`,
            );
            return;
          }

          if (
            currentPoint !== null &&
            (target === 'pass' || target === 'dontPass')
          ) {
            appendLog(
              `${playerBet.name} ${playerBetTargetLabel(
                target,
              )} bet blocked: line bets lock while point is ON.`,
            );
            return;
          }

          let finalAmount = amount;
          if (target === 'odds' && currentPoint !== null) {
            const maxOddsAmount =
              currentPlayer.passBet * getMaxOddsMultiple(currentPoint);
            finalAmount = Math.min(amount, maxOddsAmount, currentPlayer.chips);
            if (finalAmount <= 0) {
              appendLog(`${playerBet.name} odds blocked: max is $0.`);
              return;
            }
          }

          if (target === 'backup' && placeNumber !== null) {
            const maxBackupAmount =
              currentPlayer.placeBets[placeNumber] *
              getMaxOddsMultiple(placeNumber);
            finalAmount = Math.min(
              amount,
              maxBackupAmount,
              currentPlayer.chips,
            );
            if (finalAmount <= 0) {
              appendLog(
                `${playerBet.name} backup blocked: max is $${maxBackupAmount}.`,
              );
              return;
            }
          }

          if (target === 'comeOdds' && placeNumber !== null) {
            const maxComeOddsAmount =
              currentPlayer.comePointBets[placeNumber] *
              getMaxOddsMultiple(placeNumber);
            finalAmount = Math.min(
              amount,
              maxComeOddsAmount,
              currentPlayer.chips,
            );
            if (finalAmount <= 0) {
              appendLog(
                `${playerBet.name} come odds blocked: max is $${maxComeOddsAmount}.`,
              );
              return;
            }
          }

          setPlayers((previous) => {
            const snapshotPlayer = latestSnapshot.players[playerBet.playerId];
            const existing =
              previous[playerBet.playerId] ?? snapshotPlayer ?? currentPlayer;
            const nextPlayer: RoomPlayer = {
              ...existing,
              name: playerBet.name,
            };

            if (target === 'pass') {
              nextPlayer.passBet = finalAmount;
            } else if (target === 'dontPass') {
              nextPlayer.dontPassBet = finalAmount;
            } else if (target === 'come') {
              nextPlayer.comeBet = finalAmount;
            } else if (target === 'field') {
              nextPlayer.fieldBet = finalAmount;
            } else if (target === 'odds') {
              nextPlayer.oddsBet = finalAmount;
            } else if (target === 'comeOdds' && placeNumber !== null) {
              nextPlayer.comeOddsBets = {
                ...nextPlayer.comeOddsBets,
                [placeNumber]: finalAmount,
              };
            } else if (placeNumber !== null) {
              if (target === 'backup') {
                nextPlayer.placeBackupBets = {
                  ...nextPlayer.placeBackupBets,
                  [placeNumber]: finalAmount,
                };
              } else {
                nextPlayer.placeBets = {
                  ...nextPlayer.placeBets,
                  [placeNumber]: finalAmount,
                };
                const maxBackup = finalAmount * getMaxOddsMultiple(placeNumber);
                nextPlayer.placeBackupBets = {
                  ...nextPlayer.placeBackupBets,
                  [placeNumber]: Math.min(
                    nextPlayer.placeBackupBets[placeNumber],
                    maxBackup,
                  ),
                };
              }
            }

            const nextPlayers = {
              ...previous,
              [playerBet.playerId]: nextPlayer,
            };
            if (
              basePlayer.id !== playerBet.playerId &&
              nextPlayers[basePlayer.id]
            ) {
              delete nextPlayers[basePlayer.id];
            }
            gameSnapshotRef.current = {
              ...gameSnapshotRef.current,
              players: nextPlayers,
            };
            return nextPlayers;
          });
          if (target === 'place' && placeNumber !== null) {
            appendLog(
              `${playerBet.name} set Place ${placeNumber} to $${finalAmount}.`,
            );
          } else if (target === 'comeOdds' && placeNumber !== null) {
            appendLog(
              `${playerBet.name} set Come Odds ${placeNumber} to $${finalAmount}.`,
            );
          } else if (target === 'backup' && placeNumber !== null) {
            appendLog(
              `${playerBet.name} set Backup ${placeNumber} to $${finalAmount}.`,
            );
          } else {
            appendLog(
              `${playerBet.name} set ${playerBetTargetLabel(
                target,
              )} to $${finalAmount}.`,
            );
          }
          return;
        }

        if (message.type === 'error' && message.message) {
          appendLog(`Relay error: ${message.message}`);
        }
      } catch (_error) {
        appendLog('Received malformed relay message.');
      }
    };

    socket.onerror = () => {
      setConnectionState('offline');
      appendLog('Relay connection error. Check RELAY_WS_URL.');
    };

    socket.onclose = () => {
      setConnectionState('offline');
      appendLog('Relay connection closed.');
    };

    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, [appendLog, roomCode, send]);

  useEffect(() => {
    if (connectionState === 'connected') {
      broadcastHostState();
    }
  }, [broadcastHostState, connectionState]);

  const roll = useCallback(
    (trigger: 'playpause' | 'ui') => {
      if (trigger !== 'playpause') {
        setStatus('Use PLAY/PAUSE on the remote to roll dice.');
        appendLog('Roll blocked: only PLAY/PAUSE can roll the dice.');
        return;
      }

      if (isRolling) {
        return;
      }

      const snapshot = gameSnapshotRef.current;
      const hasActiveHostBet =
        snapshot.hostPassBet > 0 ||
        snapshot.hostDontPassBet > 0 ||
        snapshot.hostComeBet > 0 ||
        snapshot.hostFieldBet > 0 ||
        snapshot.hostOddsBet > 0 ||
        getComePointTotal(snapshot.hostComePointBets) > 0 ||
        getComePointTotal(snapshot.hostComeOddsBets) > 0 ||
        getComePointTotal(snapshot.hostPlaceBets) > 0 ||
        getComePointTotal(snapshot.hostPlaceBackupBets) > 0;
      const hasActivePlayerBet = Object.values(snapshot.players).some(
        (player) =>
          player.passBet > 0 ||
          player.dontPassBet > 0 ||
          player.comeBet > 0 ||
          player.fieldBet > 0 ||
          player.oddsBet > 0 ||
          getComePointTotal(player.comePointBets) > 0 ||
          getComePointTotal(player.comeOddsBets ?? createEmptyComePointBets()) >
            0 ||
          getComePointTotal(player.placeBets) > 0 ||
          getComePointTotal(player.placeBackupBets) > 0,
      );
      if (!hasActiveHostBet && !hasActivePlayerBet) {
        appendLog('No active bets to roll.');
        return;
      }

      setIsRolling(true);
      setStatus('Dice rolling...');
      appendLog('Dice rolling...');

      clearRollTimers();
      const rollAnimationMs = randomBetweenInt(
        ROLL_ANIMATION_MIN_MS,
        ROLL_ANIMATION_MAX_MS,
      );

      rollIntervalRef.current = setInterval(() => {
        setDice(makeRandomDice());
        setDiceMotion(makeRollingMotion());
      }, ROLL_ANIMATION_TICK_MS);

      rollTimeoutRef.current = setTimeout(() => {
        clearRollTimers();

        const result = rollDice();
        setDice(result);
        setDiceMotion({
          die1X: 0,
          die1Y: 0,
          die1Rotation: 0,
          die2X: 0,
          die2Y: 0,
          die2Rotation: 0,
        });

        const latest = gameSnapshotRef.current;
        const resolution = resolveRoll(latest.point, result.total);

        setPoint(resolution.nextPoint);
        setLastRoll(`${result.die1} + ${result.die2} = ${result.total}`);

        let nextHostChips = latest.hostChips;
        const nextPlayers = {...latest.players};
        let nextHostOddsBet = latest.hostOddsBet;
        let nextHostComeBet = latest.hostComeBet;
        const nextHostComePointBets: ComePointBets = {
          ...latest.hostComePointBets,
        };
        const nextHostComeOddsBets: ComePointBets = {
          ...latest.hostComeOddsBets,
        };
        let nextHostFieldBet = latest.hostFieldBet;
        const nextHostPlaceBets: ComePointBets = {...latest.hostPlaceBets};
        const nextHostPlaceBackupBets: ComePointBets = {
          ...latest.hostPlaceBackupBets,
        };
        const eventDetails: string[] = [];

        if (isRoundDecision(resolution.outcome)) {
          nextHostChips = settleBet(
            latest.hostChips,
            latest.hostPassBet > 0
              ? {side: 'pass', amount: latest.hostPassBet}
              : null,
            resolution.outcome,
          );
          nextHostChips = settleBet(
            nextHostChips,
            latest.hostDontPassBet > 0
              ? {side: 'dontPass', amount: latest.hostDontPassBet}
              : null,
            resolution.outcome,
          );
          nextHostChips = settleOddsBet(
            nextHostChips,
            latest.hostOddsBet,
            latest.point,
            resolution.outcome,
          );

          nextHostOddsBet = 0;
          eventDetails.push(`Decision: ${resolution.status}`);
        } else {
          eventDetails.push(`Roll ${result.total}. ${resolution.status}`);
        }

        if (result.total === 7) {
          const lostComePoints = getComePointTotal(nextHostComePointBets);
          if (lostComePoints > 0) {
            nextHostChips = Math.max(0, nextHostChips - lostComePoints);
            eventDetails.push(`Come points lost on 7: -$${lostComePoints}.`);
          }
          const lostComeOdds = getComePointTotal(nextHostComeOddsBets);
          if (lostComeOdds > 0) {
            nextHostChips = Math.max(0, nextHostChips - lostComeOdds);
            eventDetails.push(`Come odds lost on 7: -$${lostComeOdds}.`);
          }
          POINT_BOX_NUMBERS.forEach((number) => {
            nextHostComePointBets[number] = 0;
            nextHostComeOddsBets[number] = 0;
          });
        } else if (
          isPointNumber(result.total) &&
          nextHostComePointBets[result.total] > 0
        ) {
          const wonComePoints = nextHostComePointBets[result.total];
          nextHostChips += wonComePoints;
          nextHostComePointBets[result.total] = 0;
          eventDetails.push(`Come ${result.total} hit: +$${wonComePoints}.`);
          const comeOdds = nextHostComeOddsBets[result.total];
          if (comeOdds > 0) {
            const comeOddsPayout = getOddsPayout(comeOdds, result.total);
            nextHostChips += comeOddsPayout;
            nextHostComeOddsBets[result.total] = 0;
            eventDetails.push(
              `Come odds ${result.total} paid +$${comeOddsPayout}.`,
            );
          }
        }

        if (nextHostComeBet > 0) {
          if (result.total === 7 || result.total === 11) {
            nextHostChips += nextHostComeBet;
            eventDetails.push(
              `Come bet won on ${result.total}: +$${nextHostComeBet}.`,
            );
            nextHostComeBet = 0;
          } else if (
            result.total === 2 ||
            result.total === 3 ||
            result.total === 12
          ) {
            nextHostChips = Math.max(0, nextHostChips - nextHostComeBet);
            eventDetails.push(
              `Come bet lost on ${result.total}: -$${nextHostComeBet}.`,
            );
            nextHostComeBet = 0;
          } else if (isPointNumber(result.total)) {
            nextHostComePointBets[result.total] += nextHostComeBet;
            eventDetails.push(
              `Come bet moved to ${result.total}: $${nextHostComeBet}.`,
            );
            nextHostComeBet = 0;
          }
        }

        if (nextHostFieldBet > 0) {
          const fieldWins =
            result.total === 2 ||
            result.total === 3 ||
            result.total === 4 ||
            result.total === 9 ||
            result.total === 10 ||
            result.total === 11 ||
            result.total === 12;

          if (fieldWins) {
            const payoutMultiplier = getFieldPayoutMultiplier(result.total);
            const payout = nextHostFieldBet * payoutMultiplier;
            nextHostChips += payout;
            eventDetails.push(
              payoutMultiplier === 2
                ? `Field won double on ${result.total}: +$${payout}.`
                : `Field won on ${result.total}: +$${payout}.`,
            );
          } else {
            nextHostChips = Math.max(0, nextHostChips - nextHostFieldBet);
            eventDetails.push(
              `Field lost on ${result.total}: -$${nextHostFieldBet}.`,
            );
          }

          nextHostFieldBet = 0;
        }

        if (result.total === 7) {
          const lostPlaceBets = getComePointTotal(nextHostPlaceBets);
          if (lostPlaceBets > 0) {
            nextHostChips = Math.max(0, nextHostChips - lostPlaceBets);
            eventDetails.push(`Host place bets lost on 7: -$${lostPlaceBets}.`);
          }
          const lostPlaceBackups = getComePointTotal(nextHostPlaceBackupBets);
          if (lostPlaceBackups > 0) {
            nextHostChips = Math.max(0, nextHostChips - lostPlaceBackups);
            eventDetails.push(
              `Host place backup bets lost on 7: -$${lostPlaceBackups}.`,
            );
          }
          POINT_BOX_NUMBERS.forEach((number) => {
            nextHostPlaceBets[number] = 0;
            nextHostPlaceBackupBets[number] = 0;
          });
        } else if (
          isPointNumber(result.total) &&
          (nextHostPlaceBets[result.total] > 0 ||
            nextHostPlaceBackupBets[result.total] > 0)
        ) {
          const placeBet = nextHostPlaceBets[result.total];
          const placePayout =
            placeBet > 0 ? getPlacePayout(placeBet, result.total) : 0;
          const backupBet = nextHostPlaceBackupBets[result.total];
          const backupPayout =
            backupBet > 0 ? getPlacePayout(backupBet, result.total) : 0;
          nextHostChips += placePayout + backupPayout;
          if (placePayout > 0) {
            eventDetails.push(
              `Host place ${result.total} paid +$${placePayout} (bet stays).`,
            );
          }
          if (backupPayout > 0) {
            eventDetails.push(
              `Host backup ${result.total} paid +$${backupPayout} (bet stays).`,
            );
          }
        }

        Object.values(nextPlayers).forEach((player) => {
          let playerChips = player.chips;
          let nextPassBet = player.passBet;
          let nextDontPassBet = player.dontPassBet;
          let nextComeBet = player.comeBet;
          const nextComePointBets: ComePointBets = {...player.comePointBets};
          const nextComeOddsBets: ComePointBets = {
            ...(player.comeOddsBets ?? createEmptyComePointBets()),
          };
          let nextFieldBet = player.fieldBet;
          let nextOddsBet = player.oddsBet;
          const nextPlaceBets: ComePointBets = {...player.placeBets};
          const nextPlaceBackupBets: ComePointBets = {
            ...player.placeBackupBets,
          };
          const playerEvents: string[] = [];

          if (isRoundDecision(resolution.outcome)) {
            playerChips = settleBet(
              playerChips,
              nextPassBet > 0 ? {side: 'pass', amount: nextPassBet} : null,
              resolution.outcome,
            );
            playerChips = settleBet(
              playerChips,
              nextDontPassBet > 0
                ? {side: 'dontPass', amount: nextDontPassBet}
                : null,
              resolution.outcome,
            );
            playerChips = settleOddsBet(
              playerChips,
              nextOddsBet,
              latest.point,
              resolution.outcome,
            );
            nextPassBet = 0;
            nextDontPassBet = 0;
            nextOddsBet = 0;
          }

          if (result.total === 7) {
            const lostComePoints = getComePointTotal(nextComePointBets);
            if (lostComePoints > 0) {
              playerChips = Math.max(0, playerChips - lostComePoints);
              playerEvents.push(`come points -$${lostComePoints}`);
            }
            const lostComeOdds = getComePointTotal(nextComeOddsBets);
            if (lostComeOdds > 0) {
              playerChips = Math.max(0, playerChips - lostComeOdds);
              playerEvents.push(`come odds -$${lostComeOdds}`);
            }
            POINT_BOX_NUMBERS.forEach((number) => {
              nextComePointBets[number] = 0;
              nextComeOddsBets[number] = 0;
            });
          } else if (
            isPointNumber(result.total) &&
            nextComePointBets[result.total] > 0
          ) {
            const wonComePoints = nextComePointBets[result.total];
            playerChips += wonComePoints;
            nextComePointBets[result.total] = 0;
            playerEvents.push(`come ${result.total} +$${wonComePoints}`);
            const comeOdds = nextComeOddsBets[result.total];
            if (comeOdds > 0) {
              const comeOddsPayout = getOddsPayout(comeOdds, result.total);
              playerChips += comeOddsPayout;
              nextComeOddsBets[result.total] = 0;
              playerEvents.push(
                `come odds ${result.total} +$${comeOddsPayout}`,
              );
            }
          }

          if (nextComeBet > 0) {
            if (result.total === 7 || result.total === 11) {
              playerChips += nextComeBet;
              playerEvents.push(`come win +$${nextComeBet}`);
              nextComeBet = 0;
            } else if (
              result.total === 2 ||
              result.total === 3 ||
              result.total === 12
            ) {
              playerChips = Math.max(0, playerChips - nextComeBet);
              playerEvents.push(`come lose -$${nextComeBet}`);
              nextComeBet = 0;
            } else if (isPointNumber(result.total)) {
              nextComePointBets[result.total] += nextComeBet;
              playerEvents.push(`come travels to ${result.total}`);
              nextComeBet = 0;
            }
          }

          if (nextFieldBet > 0) {
            const fieldWins =
              result.total === 2 ||
              result.total === 3 ||
              result.total === 4 ||
              result.total === 9 ||
              result.total === 10 ||
              result.total === 11 ||
              result.total === 12;

            if (fieldWins) {
              const payoutMultiplier = getFieldPayoutMultiplier(result.total);
              const payout = nextFieldBet * payoutMultiplier;
              playerChips += payout;
              playerEvents.push(
                payoutMultiplier === 2
                  ? `field double +$${payout}`
                  : `field +$${payout}`,
              );
            } else {
              playerChips = Math.max(0, playerChips - nextFieldBet);
              playerEvents.push(`field -$${nextFieldBet}`);
            }
            nextFieldBet = 0;
          }

          if (result.total === 7) {
            const lostPlaceBets = getComePointTotal(nextPlaceBets);
            if (lostPlaceBets > 0) {
              playerChips = Math.max(0, playerChips - lostPlaceBets);
              playerEvents.push(`place bets -$${lostPlaceBets}`);
            }
            const lostPlaceBackups = getComePointTotal(nextPlaceBackupBets);
            if (lostPlaceBackups > 0) {
              playerChips = Math.max(0, playerChips - lostPlaceBackups);
              playerEvents.push(`place backup -$${lostPlaceBackups}`);
            }
            POINT_BOX_NUMBERS.forEach((number) => {
              nextPlaceBets[number] = 0;
              nextPlaceBackupBets[number] = 0;
            });
          } else if (
            isPointNumber(result.total) &&
            (nextPlaceBets[result.total] > 0 ||
              nextPlaceBackupBets[result.total] > 0)
          ) {
            const placeBet = nextPlaceBets[result.total];
            const placePayout =
              placeBet > 0 ? getPlacePayout(placeBet, result.total) : 0;
            const backupBet = nextPlaceBackupBets[result.total];
            const backupPayout =
              backupBet > 0 ? getPlacePayout(backupBet, result.total) : 0;
            playerChips += placePayout + backupPayout;
            if (placePayout > 0) {
              playerEvents.push(`place ${result.total} +$${placePayout}`);
            }
            if (backupPayout > 0) {
              playerEvents.push(`backup ${result.total} +$${backupPayout}`);
            }
          }

          if (playerEvents.length > 0) {
            eventDetails.push(`${player.name}: ${playerEvents.join(', ')}.`);
          }

          nextPlayers[player.id] = {
            ...player,
            chips: playerChips,
            passBet: nextPassBet,
            dontPassBet: nextDontPassBet,
            comeBet: nextComeBet,
            comePointBets: nextComePointBets,
            comeOddsBets: nextComeOddsBets,
            fieldBet: nextFieldBet,
            oddsBet: nextOddsBet,
            placeBets: nextPlaceBets,
            placeBackupBets: nextPlaceBackupBets,
          };
        });

        gameSnapshotRef.current = {
          ...latest,
          point: resolution.nextPoint,
          hostChips: nextHostChips,
          hostComeBet: nextHostComeBet,
          hostComePointBets: nextHostComePointBets,
          hostComeOddsBets: nextHostComeOddsBets,
          hostFieldBet: nextHostFieldBet,
          hostPlaceBets: nextHostPlaceBets,
          hostPlaceBackupBets: nextHostPlaceBackupBets,
          hostOddsBet: nextHostOddsBet,
          players: nextPlayers,
        };

        setStatus([resolution.status, ...eventDetails.slice(1)].join(' '));
        eventDetails.forEach((detail) => appendLog(detail));

        setHostChips(nextHostChips);
        setHostComeBet(nextHostComeBet);
        setHostComePointBets(nextHostComePointBets);
        setHostComeOddsBets(nextHostComeOddsBets);
        setHostFieldBet(nextHostFieldBet);
        setHostPlaceBets(nextHostPlaceBets);
        setHostPlaceBackupBets(nextHostPlaceBackupBets);
        setHostOddsBet(nextHostOddsBet);
        setPlayers(nextPlayers);
        setIsRolling(false);
      }, rollAnimationMs);
    },
    [appendLog, clearRollTimers, isRolling],
  );

  const adjustBetSize = useCallback(
    (delta: number) => {
      setBetSize((previous) => clampBetForChips(previous + delta, hostChips));
    },
    [hostChips],
  );

  const setPointOff = useCallback(() => {
    if (point === null) {
      appendLog('Puck already OFF.');
      return;
    }
    setStatus(
      `Point ${point} is ON. Puck turns OFF only when the point is made or on seven-out.`,
    );
    appendLog('Manual puck OFF blocked: active point must resolve by roll.');
  }, [appendLog, point]);

  const moveBetTarget = useCallback(
    (direction: -1 | 1) => {
      setSelectedBetTarget((previous) => {
        const currentIndex = availableBetTargets.indexOf(previous);
        const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
        const nextIndex =
          (safeCurrentIndex + direction + availableBetTargets.length) %
          availableBetTargets.length;
        return availableBetTargets[nextIndex];
      });
    },
    [availableBetTargets],
  );

  const placeHostBet = useCallback(() => {
    const amount = clampBetForChips(betSize, hostChips);

    if (amount <= 0) {
      appendLog('No chips available to place a bet.');
      return;
    }

    if (selectedBetTarget === 'odds') {
      if (point === null) {
        setStatus('Set a point first, then place odds behind Pass Line.');
        appendLog('Odds bet blocked: no point is active.');
        return;
      }

      if (hostPassBet <= 0) {
        setStatus('Place a Pass Line bet before adding odds.');
        appendLog('Odds bet blocked: no active Pass Line contract bet.');
        return;
      }

      const maxOddsMultiple = getMaxOddsMultiple(point);
      const maxOddsAmount = hostPassBet * maxOddsMultiple;
      const oddsAmount = Math.min(amount, maxOddsAmount, hostChips);

      setHostOddsBet(oddsAmount);
      setStatus(
        `Odds bet placed: $${oddsAmount} (max ${maxOddsMultiple}x on point ${point}).`,
      );
      appendLog(
        `Host placed odds: $${oddsAmount} behind pass line on point ${point}.`,
      );
      return;
    }

    if (selectedBetTarget === 'come') {
      if (point === null) {
        setStatus('Come bets open only after a point is established.');
        appendLog('Come bet blocked: point must be ON.');
        return;
      }

      setHostComeBet(amount);
      setStatus(
        `Come bet placed: $${amount}. It wins on 7/11, loses on 2/3/12, else travels to the rolled box number.`,
      );
      appendLog(`Host placed a come bet: $${amount}.`);
      return;
    }

    if (selectedBetTarget === 'field') {
      setHostFieldBet(amount);
      setStatus(
        `Field bet placed: $${amount} for the next roll (2,3,4,9,10,11,12 win; 2 and 12 pay double).`,
      );
      appendLog(`Host placed a field bet: $${amount} for next roll.`);
      return;
    }

    const comeOddsPoint = getComeOddsPointForTarget(selectedBetTarget);
    if (comeOddsPoint !== null) {
      const comePointBet = hostComePointBets[comeOddsPoint];
      if (comePointBet <= 0) {
        setStatus(
          `Place a Come point on ${comeOddsPoint} before adding come odds.`,
        );
        appendLog(
          `Come odds ${comeOddsPoint} blocked: no corresponding Come point bet.`,
        );
        return;
      }

      const maxComeOdds = comePointBet * getMaxOddsMultiple(comeOddsPoint);
      const comeOddsAmount = Math.min(amount, maxComeOdds, hostChips);
      setHostComeOddsBets((previous) => ({
        ...previous,
        [comeOddsPoint]: comeOddsAmount,
      }));
      setStatus(
        `Come odds ${comeOddsPoint} set to $${comeOddsAmount} (max $${maxComeOdds}).`,
      );
      appendLog(`Host set come odds ${comeOddsPoint} to $${comeOddsAmount}.`);
      return;
    }

    const placePoint = getPlacePointForTarget(selectedBetTarget);
    if (placePoint !== null) {
      setHostPlaceBets((previous) => ({
        ...previous,
        [placePoint]: amount,
      }));
      setHostPlaceBackupBets((previous) => ({
        ...previous,
        [placePoint]: Math.min(
          previous[placePoint],
          amount * getMaxOddsMultiple(placePoint),
        ),
      }));
      setStatus(
        `Place ${placePoint} bet set to $${amount}. Pays true place odds on a hit; loses on 7.`,
      );
      appendLog(`Host set place ${placePoint} to $${amount}.`);
      return;
    }

    const backupPoint = getBackupPointForTarget(selectedBetTarget);
    if (backupPoint !== null) {
      const placeBet = hostPlaceBets[backupPoint];
      if (placeBet <= 0) {
        setStatus(`Place a Place ${backupPoint} bet before adding backup.`);
        appendLog(
          `Backup ${backupPoint} blocked: no corresponding Place ${backupPoint} bet.`,
        );
        return;
      }
      const maxBackup = placeBet * getMaxOddsMultiple(backupPoint);
      const backupAmount = Math.min(amount, maxBackup, hostChips);
      setHostPlaceBackupBets((previous) => ({
        ...previous,
        [backupPoint]: backupAmount,
      }));
      setStatus(
        `Backup ${backupPoint} set to $${backupAmount} (max $${maxBackup} on Place ${backupPoint}).`,
      );
      appendLog(`Host set backup ${backupPoint} to $${backupAmount}.`);
      return;
    }

    if (point !== null) {
      setStatus(
        `Point ${point} is ON. Pass/Don't Pass are locked contract bets until the roll resolves.`,
      );
      appendLog('Line bet change blocked: point is active.');
      return;
    }

    if (selectedBetTarget === 'passSouth') {
      setHostPassBet(amount);
      setStatus(
        `Bet placed: $${amount} on Pass Line. Press PLAY/PAUSE to roll.`,
      );
      appendLog(`Host bet placed: $${amount} on ${sideLabel('pass')}.`);
    } else {
      setHostDontPassBet(amount);
      setStatus(
        `Bet placed: $${amount} on Don't Pass Bar. Press PLAY/PAUSE to roll.`,
      );
      appendLog(`Host bet placed: $${amount} on ${sideLabel('dontPass')}.`);
    }
  }, [
    appendLog,
    betSize,
    hostChips,
    hostComePointBets,
    hostPassBet,
    hostPlaceBets,
    point,
    selectedBetTarget,
  ]);

  useTVEventHandler((event: HWEvent) => {
    if (!event || !event.eventType) {
      return;
    }

    if (
      typeof event.eventKeyAction === 'number' &&
      event.eventKeyAction !== 0
    ) {
      return;
    }

    const eventType = String(event.eventType).toLowerCase();

    if (eventType === 'left') {
      adjustBetSize(-5);
      return;
    }

    if (eventType === 'right') {
      adjustBetSize(5);
      return;
    }

    if (eventType === 'up') {
      moveBetTarget(-1);
      return;
    }

    if (eventType === 'down') {
      moveBetTarget(1);
      return;
    }

    if (eventType === 'select' || eventType === 'enter') {
      placeHostBet();
      return;
    }

    if (eventType === 'playpause') {
      roll('playpause');
      return;
    }

    if (eventType === 'menu') {
      setPointOff();
    }
  });

  const renderTokens = useCallback((tokens: TableToken[]) => {
    return tokens.map((token, index) => {
      const row = Math.floor(index / CHIPS_PER_ROW);
      const column = index % CHIPS_PER_ROW;
      const chips = decomposeChips(token.amount);
      return (
        <View
          key={token.id}
          style={[
            styles.chipToken,
            {
              left: 26 + column * 300,
              top: 10 + row * 88,
            },
          ]}>
          <Text
            style={[
              styles.chipLabel,
              token.isHost ? styles.chipTokenHost : styles.chipTokenPlayer,
              !token.isHost && {backgroundColor: token.color},
            ]}>
            {token.label}
          </Text>
          <View style={styles.chipRow}>
            {chips.map((denom, chipIndex) => {
              const visual = CHIP_VISUALS[denom];
              return (
                <View
                  key={`${token.id}-${denom}-${chipIndex}`}
                  style={[styles.realChip, getRealChipStyle(denom, chipIndex)]}>
                  <View style={styles.realChipCenter}>
                    <Text style={[styles.realChipText, {color: visual.text}]}>
                      {visual.label}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
          <Text style={styles.chipAmount}>{token.amount}</Text>
        </View>
      );
    });
  }, []);

  const renderPointMarkers = useCallback(
    (markers: PointMarkerToken[], compact: boolean) => {
      return markers.map((marker) => (
        <View
          key={marker.id}
          style={[
            styles.comePointMarkerItem,
            compact && styles.comePointMarkerItemCompact,
          ]}>
          <View
            style={[
              styles.comePointChipRow,
              compact && styles.comePointChipRowCompact,
            ]}>
            {decomposeChips(marker.amount)
              .slice(0, compact ? 2 : 3)
              .map((denom, chipIndex) => {
                const visual = CHIP_VISUALS[denom];
                return (
                  <View
                    key={`${marker.id}-${denom}-${chipIndex}`}
                    style={[
                      styles.comePointChip,
                      compact && styles.comePointChipCompact,
                      getComePointChipStyle(denom, chipIndex, compact),
                    ]}>
                    <Text
                      style={[
                        styles.comePointChipText,
                        compact && styles.comePointChipTextCompact,
                        {color: visual.text},
                      ]}>
                      {visual.label}
                    </Text>
                  </View>
                );
              })}
          </View>
          <Text
            style={[
              styles.comePointAmountTiny,
              compact && styles.comePointAmountTinyCompact,
            ]}>
            {marker.amount}
          </Text>
          <Text
            style={[
              styles.comePointOwnerLabel,
              compact && styles.comePointOwnerLabelCompact,
              marker.markerType === 'comeOdds' &&
                styles.comePointOwnerLabelComeOdds,
              marker.markerType === 'backup' &&
                styles.comePointOwnerLabelBackup,
              !marker.isHost && styles.comePointOwnerLabelPlayer,
            ]}>
            {marker.markerType === 'place'
              ? `${marker.label} PL`
              : marker.markerType === 'comeOdds'
              ? `${marker.label} CO`
              : marker.markerType === 'backup'
              ? `${marker.label} BK`
              : `${marker.label} CM`}
          </Text>
        </View>
      ));
    },
    [],
  );

  const connectionColor =
    connectionState === 'connected'
      ? '#4ade80'
      : connectionState === 'connecting'
      ? '#facc15'
      : '#fb7185';
  const rolledValue = lastRoll === 'No roll yet' ? '--' : String(dice.total);
  const selectedTargetLabel = betTargetLabel(selectedBetTarget);
  const selectedMainPoint = getPlacePointForTarget(selectedBetTarget);
  const selectedOddsPoint =
    getComeOddsPointForTarget(selectedBetTarget) ??
    getBackupPointForTarget(selectedBetTarget);
  const bankrollSummary = useMemo(() => {
    const parts = [`Host $${hostChips}`];
    playerRows.forEach((player) => {
      parts.push(`${player.name} $${player.chips}`);
    });
    return parts.join('  |  ');
  }, [hostChips, playerRows]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Craps Party Vega</Text>
          <Text numberOfLines={1} style={styles.topBarStatus}>
            {status}
          </Text>
          <View style={styles.topBarRight}>
            <Text style={styles.topBarRoom}>Room {roomCode}</Text>
            <Text style={[styles.topBarConn, {color: connectionColor}]}>
              ● {connectionState.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.boardRow}>
          <View style={styles.mainTableArea}>
            <View style={styles.mainTableFelt}>
              {point === null && (
                <View style={[styles.puckButton, styles.puckOff]}>
                  <Text style={styles.puckText}>OFF</Text>
                </View>
              )}

              <View style={styles.pointGrid}>
                {POINT_BOX_NUMBERS.map((number) => {
                  const markersForPoint = pointMarkers[number];
                  const mainMarkersForPoint = markersForPoint.filter(
                    (marker) =>
                      marker.markerType === 'come' ||
                      marker.markerType === 'place',
                  );
                  const oddsMarkersForPoint = markersForPoint.filter(
                    (marker) =>
                      marker.markerType === 'comeOdds' ||
                      marker.markerType === 'backup',
                  );

                  return (
                    <View key={`point-${number}`} style={styles.pointBox}>
                      <View
                        style={[
                          styles.pointOddsCell,
                          selectedOddsPoint === number &&
                            styles.pointOddsCellTarget,
                        ]}>
                        {oddsMarkersForPoint.length > 0 && (
                          <View style={styles.pointOddsMarkerStack}>
                            {renderPointMarkers(oddsMarkersForPoint, true)}
                          </View>
                        )}
                      </View>
                      <View
                        style={[
                          styles.pointMainCell,
                          point === number && styles.pointBoxActive,
                          selectedMainPoint === number &&
                            styles.pointBoxPlaceTarget,
                        ]}>
                        <Text style={styles.pointBoxNumber}>
                          {number === 6
                            ? 'SIX'
                            : number === 9
                            ? 'NINE'
                            : number}
                        </Text>
                        {point === number && (
                          <View style={[styles.pointPuckButton, styles.puckOn]}>
                            <Text style={styles.pointPuckText}>ON</Text>
                          </View>
                        )}
                        {mainMarkersForPoint.length > 0 && (
                          <View style={styles.comePointMarkerStack}>
                            {renderPointMarkers(mainMarkersForPoint, false)}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>

              <View
                style={[
                  styles.comeArea,
                  selectedBetTarget === 'come' && styles.betZoneFocusPass,
                ]}>
                <Text style={styles.comeText}>COME</Text>
                <View style={styles.tokenLayer}>
                  {renderTokens(comeTokens)}
                </View>
              </View>

              <View
                style={[
                  styles.fieldArea,
                  selectedBetTarget === 'field' && styles.betZoneFocusPass,
                ]}>
                <Text style={styles.fieldTopText}>
                  2 · 3 · 4 · 9 · 10 · 11 · 12
                </Text>
                <Text style={styles.fieldText}>FIELD</Text>
                <View style={styles.tokenLayer}>
                  {renderTokens(fieldTokens)}
                </View>
              </View>

              <View
                style={[
                  styles.dontPassBarRow,
                  selectedBetTarget === 'dontPass' &&
                    styles.betZoneFocusDontPass,
                ]}>
                <Text style={styles.dontPassLabel}>DON&apos;T PASS BAR</Text>
                <View style={styles.tokenLayer}>
                  {renderTokens(dontPassTokens)}
                </View>
              </View>

              <View
                style={[
                  styles.passLineRow,
                  selectedBetTarget === 'passSouth' && styles.betZoneFocusPass,
                ]}>
                <Text style={styles.passLineLabel}>PASS LINE</Text>
                <View style={styles.tokenLayer}>
                  {renderTokens(passTokens)}
                </View>
              </View>

              <View
                style={[
                  styles.oddsRow,
                  selectedBetTarget === 'odds' && styles.betZoneFocusPass,
                ]}>
                <Text style={styles.oddsLabel}>ODDS BACKUP (3X / 4X / 5X)</Text>
                <View style={styles.tokenLayer}>
                  {renderTokens(oddsTokens)}
                </View>
              </View>

              <View style={styles.diceCluster}>
                <View
                  style={[
                    styles.die,
                    isRolling && styles.dieRolling,
                    {
                      transform: [
                        {translateX: diceMotion.die1X},
                        {translateY: diceMotion.die1Y},
                        {rotate: `${diceMotion.die1Rotation}deg`},
                      ],
                    },
                  ]}>
                  {getPipsForValue(dice.die1).map((pip) => (
                    <View
                      key={`d1-${pip}`}
                      style={[
                        styles.diePip,
                        {top: PIP_COORDS[pip].top, left: PIP_COORDS[pip].left},
                      ]}
                    />
                  ))}
                </View>
                <View
                  style={[
                    styles.die,
                    isRolling && styles.dieRolling,
                    {
                      transform: [
                        {translateX: diceMotion.die2X},
                        {translateY: diceMotion.die2Y},
                        {rotate: `${diceMotion.die2Rotation}deg`},
                      ],
                    },
                  ]}>
                  {getPipsForValue(dice.die2).map((pip) => (
                    <View
                      key={`d2-${pip}`}
                      style={[
                        styles.diePip,
                        {top: PIP_COORDS[pip].top, left: PIP_COORDS[pip].left},
                      ]}
                    />
                  ))}
                </View>
              </View>
            </View>
          </View>

          <View style={styles.controlSidebar}>
            <View style={styles.controlCard}>
              <Text style={styles.controlCardTitle}>Host Betting</Text>
              <View style={styles.hostBadgeBox}>
                <Text style={styles.hostBadgeText}>Host</Text>
              </View>
              <Text style={styles.controlCardValue}>
                Target: {selectedTargetLabel}
              </Text>
              <Text style={styles.controlCardValue}>Bet Size: ${betSize}</Text>

              <View style={styles.controlButtonRow}>
                <Pressable
                  onPress={() => adjustBetSize(-5)}
                  style={styles.controlButton}>
                  <Text style={styles.controlButtonText}>◀ Bet -$5</Text>
                </Pressable>
                <Pressable
                  onPress={() => adjustBetSize(5)}
                  style={styles.controlButton}>
                  <Text style={styles.controlButtonText}>Bet +$5 ▶</Text>
                </Pressable>
              </View>

              <View style={styles.controlButtonRow}>
                <Pressable
                  onPress={() => moveBetTarget(-1)}
                  style={styles.controlButton}>
                  <Text style={styles.controlButtonText}>▲ Prev Spot</Text>
                </Pressable>
                <Pressable
                  onPress={() => moveBetTarget(1)}
                  style={styles.controlButton}>
                  <Text style={styles.controlButtonText}>Next Spot ▼</Text>
                </Pressable>
              </View>

              <Pressable onPress={placeHostBet} style={styles.placeBetButton}>
                <Text style={styles.placeBetButtonText}>
                  Place ${betSize} on {selectedTargetLabel}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => roll('ui')}
                style={styles.rollNowButton}>
                <Text style={styles.rollNowButtonText}>
                  {isRolling ? 'Rolling...' : 'Roll Dice'}
                </Text>
              </Pressable>

              <Text style={styles.statusText}>{status}</Text>
            </View>

            <View style={styles.instructionsCard}>
              <Text style={styles.instructionsTitle}>Host Controls Guide</Text>
              <Text style={styles.instructionsLine}>
                1. LEFT/RIGHT: change your bet amount by $5.
              </Text>
              <Text style={styles.instructionsLine}>
                2. UP/DOWN: move the selected bet zone.
              </Text>
              <Text style={styles.instructionsLine}>
                3. SELECT: place chips on the highlighted zone.
              </Text>
              <Text style={styles.instructionsLine}>
                4. PLAY/PAUSE: roll after everyone has bet.
              </Text>
            </View>

            <View style={styles.instructionsCard}>
              <Text style={styles.instructionsTitle}>
                How to Join via Smartphone
              </Text>
              <Text style={styles.joinLine}>
                1. On your phone, open this link in a browser:
              </Text>
              <Text style={styles.joinLink}>
                {joinBaseUrl}
              </Text>
              <Text style={styles.joinLine}>
                2. Enter room code: {roomCode}
              </Text>
              <Text style={styles.joinLine}>3. {JOIN_NETWORK_HINT}</Text>
            </View>
          </View>
        </View>

        <View style={styles.bottomRail}>
          <Text style={styles.bottomRollLabel}>
            {isRolling ? 'Rolling...' : `Rolled: ${rolledValue}`}
          </Text>

          <Text style={styles.bottomMenuIcon}>≡</Text>
          <Text numberOfLines={2} style={styles.bottomStatusText}>
            {status}
          </Text>

          <View style={styles.bottomRack}>
            {BOTTOM_RACK_CHIPS.map((chip, index) => (
              <View
                key={`${chip.label}-bottom-${index}`}
                style={[styles.bottomChip, {backgroundColor: chip.fill}]}>
                <Text style={[styles.bottomChipText, {color: chip.text}]}>
                  {chip.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.bankrollTickerBar}>
          <Text numberOfLines={1} style={styles.bankrollTickerText}>
            {bankrollSummary}
          </Text>
        </View>

        {JOIN_BASE_URL.includes('192.168.1.100') && (
          <Text style={styles.warning}>
            Update JOIN_BASE_URL and RELAY_WS_URL in src/config.ts to your LAN
            IP.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#030303',
  },
  screen: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: '#050607',
  },
  topBar: {
    height: 62,
    borderWidth: 1,
    borderColor: '#222',
    borderRadius: 6,
    backgroundColor: '#020202',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topBarTitle: {
    color: '#dfdfdf',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  topBarStatus: {
    flex: 1,
    color: '#8ee9a8',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  topBarRight: {
    alignItems: 'flex-end',
    gap: 2,
    minWidth: 240,
  },
  topBarRoom: {
    color: '#8ee9d5',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  topBarConn: {
    fontSize: 14,
    fontWeight: '700',
  },
  boardRow: {
    marginTop: 10,
    flex: 1,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'stretch',
  },
  sideDiceLane: {
    width: 84,
    borderWidth: 1,
    borderColor: '#1c1c1c',
    borderRadius: 8,
    backgroundColor: '#090909',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 8,
  },
  arrowButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: '#cbcbcb',
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    color: '#222222',
    fontSize: 30,
    fontWeight: '700',
  },
  diceButton: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#f8a3a3',
    backgroundColor: '#ca2222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diceButtonText: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
  },
  propPanel: {
    width: 390,
    borderWidth: 3,
    borderColor: '#d9ddda',
    borderRadius: 12,
    backgroundColor: '#0f5d34',
    padding: 8,
    gap: 8,
  },
  propSection: {
    borderWidth: 2,
    borderColor: '#d9ddda',
    borderRadius: 6,
    backgroundColor: '#13683b',
    padding: 6,
  },
  propSectionTitle: {
    color: '#e5f5e9',
    fontSize: 33,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.7,
    marginBottom: 4,
  },
  propGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'center',
  },
  propCell: {
    width: 42,
    height: 32,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#f5f5f5',
    backgroundColor: '#c01f23',
    alignItems: 'center',
    justifyContent: 'center',
  },
  propCellText: {
    color: '#f8f8f8',
    fontSize: 13,
    fontWeight: '900',
  },
  propPayout: {
    marginTop: 4,
    textAlign: 'center',
    color: '#d9f4e2',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  anySevenBar: {
    borderWidth: 2,
    borderColor: '#d9ddda',
    borderRadius: 6,
    backgroundColor: '#184e33',
    paddingVertical: 8,
    alignItems: 'center',
  },
  anySevenText: {
    color: '#dc3030',
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 1,
  },
  hornButton: {
    alignSelf: 'center',
    width: 160,
    borderWidth: 1,
    borderColor: '#bf2f2f',
    borderRadius: 14,
    backgroundColor: '#bf2222',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hornButtonText: {
    color: '#11331f',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  hostControlCard: {
    borderWidth: 2,
    borderColor: '#f8cf75',
    borderRadius: 8,
    backgroundColor: '#133824',
    padding: 8,
    gap: 6,
  },
  hostControlTitle: {
    color: '#f7d476',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  sideToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sideButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#9eb79f',
    borderRadius: 8,
    backgroundColor: '#225236',
    paddingVertical: 7,
    alignItems: 'center',
  },
  sideButtonActive: {
    backgroundColor: '#f6d772',
    borderColor: '#f6e2a4',
  },
  sideButtonText: {
    color: '#f4fff3',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  sideButtonTextActive: {
    color: '#183025',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  amountButton: {
    width: 48,
    borderWidth: 1,
    borderColor: '#c6ccbe',
    borderRadius: 8,
    backgroundColor: '#254f34',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  amountButtonText: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 30,
  },
  amountValue: {
    minWidth: 90,
    textAlign: 'center',
    color: '#ffecb1',
    fontSize: 38,
    fontWeight: '900',
  },
  hostRollButton: {
    borderWidth: 1,
    borderColor: '#f3f3f3',
    borderRadius: 8,
    backgroundColor: '#bc2428',
    paddingVertical: 8,
    alignItems: 'center',
  },
  hostRollButtonText: {
    color: '#f9f9f9',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  hostControlMeta: {
    color: '#d8e8d5',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
  mainTableArea: {
    flex: 1,
  },
  mainTableFelt: {
    flex: 1,
    borderWidth: 4,
    borderColor: '#dce2dd',
    borderRadius: 24,
    backgroundColor: '#116838',
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  puckButton: {
    position: 'absolute',
    top: 8,
    right: 92,
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  puckOff: {
    backgroundColor: '#b8b8b8',
    borderColor: '#e6e6e6',
  },
  puckOn: {
    backgroundColor: '#b8b8b8',
    borderColor: '#e6e6e6',
  },
  puckText: {
    color: '#131313',
    fontSize: 36,
    fontWeight: '900',
  },
  pointPuckButton: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointPuckText: {
    color: '#131313',
    fontSize: 20,
    fontWeight: '900',
  },
  passLineRightRail: {
    position: 'absolute',
    top: 68,
    right: 0,
    bottom: 0,
    width: 132,
    borderLeftWidth: 3,
    borderTopWidth: 3,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: '#e6ebe7',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 18,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    backgroundColor: 'rgba(18, 82, 47, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  passLineRightRailText: {
    color: '#e6efe8',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    transform: [{rotate: '-90deg'}],
    width: 260,
  },
  passLineRightRailSub: {
    color: '#d4dfd7',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    transform: [{rotate: '-90deg'}],
    width: 260,
  },
  passLineRightRailTotal: {
    color: '#ffefaf',
    fontSize: 26,
    fontWeight: '900',
    transform: [{rotate: '-90deg'}],
    width: 240,
    textAlign: 'center',
  },
  betZoneFocusPass: {
    borderColor: '#f6d56d',
    backgroundColor: 'rgba(183, 122, 29, 0.22)',
  },
  betZoneFocusDontPass: {
    borderColor: '#8dd7a8',
    backgroundColor: 'rgba(75, 129, 94, 0.3)',
  },
  rightVerticalLane: {
    position: 'absolute',
    top: 72,
    right: 0,
    bottom: 0,
    width: 114,
    borderLeftWidth: 2,
    borderLeftColor: '#dce2dd',
    borderTopWidth: 2,
    borderTopColor: '#dce2dd',
    borderTopLeftRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  rightVerticalText: {
    color: '#dce9de',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    transform: [{rotate: '-90deg'}],
    letterSpacing: 1.2,
    width: 340,
  },
  pointGrid: {
    marginTop: 4,
    marginRight: 12,
    flexDirection: 'row',
    borderWidth: 2,
    borderColor: '#dce2dd',
    borderRadius: 6,
    overflow: 'hidden',
  },
  pointBox: {
    flex: 1,
    height: POINT_BOX_HEIGHT,
    borderRightWidth: 2,
    borderRightColor: '#dce2dd',
    backgroundColor: 'rgba(8, 74, 35, 0.45)',
    position: 'relative',
  },
  pointOddsCell: {
    minHeight: 56,
    borderBottomWidth: 2,
    borderBottomColor: '#dce2dd',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 53, 26, 0.52)',
    paddingHorizontal: 2,
    paddingVertical: 2,
    position: 'relative',
  },
  pointOddsCellTarget: {
    backgroundColor: 'rgba(183, 122, 29, 0.28)',
  },
  pointOddsMarkerStack: {
    position: 'absolute',
    left: 3,
    right: 3,
    top: 2,
    bottom: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  pointMainCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 74, 35, 0.45)',
    position: 'relative',
  },
  pointBoxActive: {
    backgroundColor: 'rgba(63, 134, 83, 0.48)',
  },
  pointBoxPlaceTarget: {
    borderColor: '#f6d56d',
    backgroundColor: 'rgba(183, 122, 29, 0.22)',
  },
  pointBoxNumber: {
    color: '#f5c94f',
    fontSize: 72,
    fontWeight: '900',
    lineHeight: 74,
  },
  comePointMarkerStack: {
    position: 'absolute',
    left: 3,
    right: 3,
    bottom: 3,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  comePointMarkerItem: {
    alignItems: 'center',
    gap: 0,
  },
  comePointMarkerItemCompact: {
    transform: [{scale: 0.94}],
  },
  comePointOwnerLabel: {
    backgroundColor: '#f3d474',
    color: '#1b2918',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.3,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 999,
    overflow: 'hidden',
  },
  comePointAmountTiny: {
    color: '#f1f7f3',
    fontSize: 10,
    fontWeight: '900',
    lineHeight: 10,
    marginTop: 1,
    marginBottom: 1,
    paddingHorizontal: 3,
    paddingVertical: 0,
    borderRadius: 4,
    backgroundColor: 'rgba(3, 12, 8, 0.52)',
  },
  comePointAmountTinyCompact: {
    fontSize: 7,
    lineHeight: 8,
    marginTop: 0,
    marginBottom: 0,
    paddingHorizontal: 2,
  },
  comePointOwnerLabelCompact: {
    fontSize: 8,
    paddingHorizontal: 3,
    paddingVertical: 0,
  },
  comePointOwnerLabelBackup: {
    backgroundColor: '#efce8f',
    color: '#2e210b',
  },
  comePointOwnerLabelComeOdds: {
    backgroundColor: '#f0b870',
    color: '#2b1600',
  },
  comePointOwnerLabelPlayer: {
    backgroundColor: '#d6efe2',
    color: '#112317',
  },
  comePointChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  comePointChipRowCompact: {
    transform: [{scale: 0.9}],
  },
  comePointChip: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#dfe4e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  comePointChipCompact: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
  },
  comePointChipText: {
    fontSize: 9,
    fontWeight: '900',
  },
  comePointChipTextCompact: {
    fontSize: 7,
  },
  pointBoxWord: {
    color: '#f0c34a',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  hardwayRow: {
    marginTop: 8,
    marginRight: 122,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  hardwayText: {
    color: '#efbe48',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  comeArea: {
    marginTop: 6,
    marginRight: 12,
    height: TABLE_REGION_HEIGHT,
    borderWidth: 2,
    borderColor: '#dce2dd',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comeText: {
    color: '#f2c64e',
    fontSize: 72,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  fieldArea: {
    marginTop: 6,
    marginRight: 12,
    height: TABLE_REGION_HEIGHT,
    borderWidth: 2,
    borderColor: '#dce2dd',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  fieldTopText: {
    color: '#d1292f',
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  fieldText: {
    color: '#c82025',
    fontSize: 58,
    fontWeight: '900',
    lineHeight: 58,
  },
  dontPassBarRow: {
    marginTop: 6,
    marginRight: 12,
    height: TABLE_REGION_HEIGHT,
    borderWidth: 2,
    borderColor: '#dce2dd',
    borderRadius: 4,
    paddingTop: 4,
    position: 'relative',
  },
  dontPassLabel: {
    color: '#dce4dd',
    fontSize: 34,
    fontWeight: '700',
    textAlign: 'center',
  },
  passLineRow: {
    marginTop: 6,
    marginRight: 12,
    height: TABLE_REGION_HEIGHT,
    borderWidth: 3,
    borderColor: '#e6ebe7',
    borderRadius: 24,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 24,
    backgroundColor: 'rgba(21, 83, 51, 0.65)',
    paddingTop: 4,
    paddingRight: 8,
    paddingLeft: 8,
    position: 'relative',
  },
  passLineLabel: {
    color: '#e1ece4',
    fontSize: 44,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  oddsRow: {
    marginTop: 6,
    marginRight: 12,
    height: TABLE_REGION_HEIGHT,
    borderWidth: 2,
    borderColor: '#dce2dd',
    borderRadius: 8,
    paddingTop: 6,
    paddingHorizontal: 8,
    position: 'relative',
    backgroundColor: 'rgba(17, 88, 54, 0.56)',
  },
  oddsLabel: {
    color: '#cfe8d8',
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  tokenLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  chipToken: {
    position: 'absolute',
    minWidth: 260,
    alignItems: 'flex-start',
  },
  chipTokenHost: {
    backgroundColor: '#f3d474',
    color: '#1b2918',
  },
  chipTokenPlayer: {
    color: '#112317',
  },
  chipLabel: {
    fontSize: 16,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 1,
    borderRadius: 999,
    overflow: 'hidden',
  },
  chipRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  realChip: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: '#dfe4e5',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.3,
    shadowRadius: 1.5,
  },
  realChipCenter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  realChipText: {
    fontSize: 11,
    fontWeight: '900',
  },
  chipAmount: {
    color: '#eef6ef',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 0,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 1,
  },
  diceCluster: {
    position: 'absolute',
    right: 110,
    top: 420,
    flexDirection: 'row',
    gap: 10,
    zIndex: 4,
  },
  die: {
    width: 70,
    height: 70,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ffffff',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dieRolling: {
    shadowColor: '#ffffff',
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  diePip: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1a1a1a',
  },
  dieText: {
    color: '#f8f8f8',
    fontSize: 34,
    fontWeight: '900',
  },
  repeaterButtons: {
    width: 64,
    justifyContent: 'center',
    gap: 20,
  },
  repeaterButton: {
    width: 56,
    height: 88,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#9da59a',
    backgroundColor: '#254d33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeaterButtonActive: {
    borderColor: '#15e04f',
    backgroundColor: '#1f6338',
  },
  repeaterText: {
    color: '#98a19c',
    fontSize: 48,
    fontWeight: '500',
  },
  repeaterTextActive: {
    color: '#0edf46',
  },
  controlSidebar: {
    width: 430,
    gap: 10,
  },
  controlCard: {
    borderWidth: 2,
    borderColor: '#d9d9d9',
    borderRadius: 12,
    backgroundColor: '#102718',
    padding: 10,
    gap: 8,
  },
  controlCardTitle: {
    color: '#f3dd91',
    fontSize: 30,
    fontWeight: '800',
  },
  hostBadgeBox: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#f0cf7a',
    borderRadius: 999,
    backgroundColor: 'rgba(240, 207, 122, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 3,
  },
  hostBadgeText: {
    color: '#f0cf7a',
    fontSize: 20,
    fontWeight: '900',
  },
  controlCardValue: {
    color: '#dce9df',
    fontSize: 21,
    fontWeight: '600',
  },
  controlButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  controlButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#b6c8bb',
    borderRadius: 8,
    backgroundColor: '#1f4931',
    alignItems: 'center',
    paddingVertical: 8,
  },
  controlButtonText: {
    color: '#f5f7f4',
    fontSize: 20,
    fontWeight: '700',
  },
  placeBetButton: {
    borderWidth: 1,
    borderColor: '#f5dda0',
    borderRadius: 10,
    backgroundColor: '#ba8a1f',
    paddingVertical: 10,
    alignItems: 'center',
  },
  placeBetButtonText: {
    color: '#1f291f',
    fontSize: 24,
    fontWeight: '900',
  },
  rollNowButton: {
    borderWidth: 1,
    borderColor: '#f4c5c5',
    borderRadius: 10,
    backgroundColor: '#bc2428',
    paddingVertical: 10,
    alignItems: 'center',
  },
  rollNowButtonText: {
    color: '#fafafa',
    fontSize: 24,
    fontWeight: '900',
  },
  statusText: {
    color: '#9cdcb0',
    fontSize: 18,
    fontWeight: '600',
  },
  instructionsCard: {
    borderWidth: 2,
    borderColor: '#d9d9d9',
    borderRadius: 12,
    backgroundColor: '#0d1d13',
    padding: 10,
    gap: 6,
  },
  instructionsTitle: {
    color: '#f0cf7a',
    fontSize: 28,
    fontWeight: '800',
  },
  instructionsLine: {
    color: '#d8e7dc',
    fontSize: 19,
    lineHeight: 24,
  },
  joinLine: {
    color: '#d3e8d9',
    fontSize: 17,
    lineHeight: 22,
  },
  joinLink: {
    color: '#f4e28d',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    flexShrink: 1,
  },
  bottomRail: {
    marginTop: 8,
    minHeight: 96,
    borderWidth: 2,
    borderColor: '#67472d',
    borderRadius: 6,
    backgroundColor: '#6f3d1f',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 18,
  },
  bottomRollLabel: {
    width: 270,
    color: '#dc2a1f',
    fontSize: 62,
    fontWeight: '500',
  },
  bottomMenuIcon: {
    color: '#ece7df',
    fontSize: 70,
    fontWeight: '700',
    marginBottom: 4,
  },
  bottomStatusText: {
    color: '#9be2a8',
    fontSize: 24,
    fontWeight: '700',
    flex: 1,
    minWidth: 0,
  },
  bottomRack: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bottomChip: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: '#d7d7d7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomChipText: {
    fontSize: 26,
    fontWeight: '900',
  },
  warning: {
    color: '#fecaca',
    marginTop: 4,
    fontSize: 13,
    textAlign: 'center',
  },
  bankrollTickerBar: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#2b3d2f',
    borderRadius: 6,
    backgroundColor: '#112319',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bankrollTickerText: {
    color: '#cfe8d8',
    fontSize: 16,
    fontWeight: '700',
  },
});
