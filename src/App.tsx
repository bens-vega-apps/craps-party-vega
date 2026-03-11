import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {HWEvent, useTVEventHandler} from '@amazon-devices/react-native-kepler';
import {
  Bet,
  BetSide,
  isRoundDecision,
  resolveRoll,
  rollDice,
  settleBet,
  sideLabel,
} from './game';
import {
  HOST_CHIPS_START,
  JOIN_BASE_URL,
  PLAYER_CHIPS_START,
  RELAY_WS_URL,
} from './config';

type ConnectionState = 'connecting' | 'connected' | 'offline';

interface RoomPlayer {
  id: string;
  name: string;
  chips: number;
  bet: Bet | null;
}

interface RoomPresenceMessage {
  type: 'room_presence';
  players: Array<{id: string; name: string}>;
}

interface PlayerBetMessage {
  type: 'player_bet';
  playerId: string;
  name: string;
  side: BetSide;
  amount: number;
}

const MAX_BET = 200;
const MIN_BET = 5;

const createRoomCode = (): string => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let output = '';
  for (let index = 0; index < 4; index += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return output;
};

const clampBet = (value: number): number => {
  return Math.min(MAX_BET, Math.max(MIN_BET, Math.floor(value)));
};

export const App = () => {
  const roomCode = useMemo(() => createRoomCode(), []);
  const joinUrl = useMemo(() => {
    const base = JOIN_BASE_URL.replace(/\/$/, '');
    return `${base}/?room=${roomCode}`;
  }, [roomCode]);

  const wsRef = useRef<WebSocket | null>(null);

  const [connectionState, setConnectionState] =
    useState<ConnectionState>('connecting');
  const [point, setPoint] = useState<number | null>(null);
  const [lastRoll, setLastRoll] = useState<string>('No roll yet');
  const [status, setStatus] = useState<string>('Waiting for first roll.');
  const [hostChips, setHostChips] = useState<number>(HOST_CHIPS_START);
  const [hostBet, setHostBet] = useState<Bet>({side: 'pass', amount: 25});
  const [players, setPlayers] = useState<Record<string, RoomPlayer>>({});
  const [logLines, setLogLines] = useState<string[]>([
    'Room created. Waiting for players to join.',
  ]);

  const appendLog = useCallback((line: string) => {
    setLogLines(previous => [line, ...previous].slice(0, 8));
  }, []);

  const send = useCallback((payload: unknown) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(payload));
  }, []);

  const broadcastHostState = useCallback(() => {
    const playerList = Object.values(players).map(player => ({
      id: player.id,
      name: player.name,
      chips: player.chips,
      bet: player.bet,
    }));

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
          bet: hostBet,
        },
        players: playerList,
      },
    });
  }, [hostBet, hostChips, joinUrl, lastRoll, players, point, roomCode, send, status]);

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

    socket.onmessage = event => {
      try {
        const message = JSON.parse(String(event.data)) as
          | RoomPresenceMessage
          | PlayerBetMessage
          | {type: string; message?: string};

        if (message.type === 'room_presence') {
          setPlayers(previous => {
            const next: Record<string, RoomPlayer> = {};
            message.players.forEach(player => {
              const existing = previous[player.id];
              next[player.id] = {
                id: player.id,
                name: player.name,
                chips: existing?.chips ?? PLAYER_CHIPS_START,
                bet: existing?.bet ?? null,
              };
            });
            return next;
          });
          return;
        }

        if (message.type === 'player_bet') {
          const normalizedAmount = clampBet(message.amount);
          setPlayers(previous => {
            const existing = previous[message.playerId] ?? {
              id: message.playerId,
              name: message.name,
              chips: PLAYER_CHIPS_START,
              bet: null,
            };

            const amount = Math.min(normalizedAmount, existing.chips);
            return {
              ...previous,
              [message.playerId]: {
                ...existing,
                name: message.name,
                bet: {
                  side: message.side,
                  amount,
                },
              },
            };
          });
          appendLog(`${message.name} bet ${normalizedAmount} on ${sideLabel(message.side)}.`);
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

  const roll = useCallback(() => {
    const result = rollDice();
    const resolution = resolveRoll(point, result.total);

    setPoint(resolution.nextPoint);
    setLastRoll(`${result.die1} + ${result.die2} = ${result.total}`);
    setStatus(resolution.status);

    let nextHostChips = hostChips;
    let nextPlayers = {...players};

    if (isRoundDecision(resolution.outcome)) {
      nextHostChips = settleBet(hostChips, hostBet, resolution.outcome);
      Object.values(nextPlayers).forEach(player => {
        nextPlayers[player.id] = {
          ...player,
          chips: settleBet(player.chips, player.bet, resolution.outcome),
          bet: null,
        };
      });

      appendLog(`Decision: ${resolution.status}`);
    } else {
      appendLog(`Roll ${result.total}. ${resolution.status}`);
    }

    setHostChips(nextHostChips);
    setPlayers(nextPlayers);
  }, [appendLog, hostBet, hostChips, players, point]);

  useTVEventHandler((event: HWEvent) => {
    if (!event || !event.eventType) {
      return;
    }

    if (event.eventType === 'left') {
      setHostBet(previous => ({...previous, side: 'pass'}));
      return;
    }

    if (event.eventType === 'right') {
      setHostBet(previous => ({...previous, side: 'dontPass'}));
      return;
    }

    if (event.eventType === 'up') {
      setHostBet(previous => ({
        ...previous,
        amount: clampBet(previous.amount + 5),
      }));
      return;
    }

    if (event.eventType === 'down') {
      setHostBet(previous => ({
        ...previous,
        amount: clampBet(previous.amount - 5),
      }));
      return;
    }

    if (
      event.eventType === 'select' ||
      event.eventType === 'playPause' ||
      event.eventType === 'playpause'
    ) {
      roll();
    }
  });

  const connectionColor =
    connectionState === 'connected'
      ? '#4ade80'
      : connectionState === 'connecting'
      ? '#facc15'
      : '#fb7185';

  const playerRows = Object.values(players);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.topStripe} />

        <Text style={styles.title}>Craps Party</Text>
        <Text style={styles.subtitle}>
          Fire TV host + phone browser players on your local network
        </Text>

        <View style={styles.cardRow}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Room</Text>
            <Text style={styles.roomCode}>{roomCode}</Text>
            <Text style={styles.joinLabel}>Join URL</Text>
            <Text style={styles.joinUrl}>{joinUrl}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Table State</Text>
            <Text style={styles.metric}>Point: {point ?? 'OFF'}</Text>
            <Text style={styles.metric}>Last Roll: {lastRoll}</Text>
            <Text style={styles.metric}>{status}</Text>
            <Text style={styles.metric}>Host Chips: {hostChips}</Text>
            <Text style={styles.metric}>
              Host Bet: {hostBet.amount} on {sideLabel(hostBet.side)}
            </Text>
            <Text style={[styles.metric, {color: connectionColor}]}>Relay: {connectionState}</Text>
          </View>
        </View>

        <View style={styles.hostControls}>
          <Text style={styles.controlsTitle}>Host Controls (Remote)</Text>
          <Text style={styles.controlsText}>LEFT/RIGHT: Bet side</Text>
          <Text style={styles.controlsText}>UP/DOWN: Bet amount</Text>
          <Text style={styles.controlsText}>SELECT: Roll dice</Text>

          <Pressable onPress={roll} style={styles.rollButton} hasTVPreferredFocus>
            <Text style={styles.rollButtonText}>Roll Dice</Text>
          </Pressable>
        </View>

        <View style={styles.playersCard}>
          <Text style={styles.cardTitle}>Players ({playerRows.length})</Text>
          {playerRows.length === 0 && (
            <Text style={styles.emptyText}>No players yet. Share room code {roomCode}.</Text>
          )}
          {playerRows.map(player => (
            <View key={player.id} style={styles.playerRow}>
              <Text style={styles.playerName}>{player.name}</Text>
              <Text style={styles.playerMeta}>Chips: {player.chips}</Text>
              <Text style={styles.playerMeta}>
                {player.bet ? `${player.bet.amount} on ${sideLabel(player.bet.side)}` : 'No bet'}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.logCard}>
          <Text style={styles.cardTitle}>Game Log</Text>
          <ScrollView style={styles.logScroll}>
            {logLines.map((line, index) => (
              <Text key={`${line}-${index}`} style={styles.logLine}>
                {line}
              </Text>
            ))}
          </ScrollView>
        </View>

        {JOIN_BASE_URL.includes('192.168.1.100') && (
          <Text style={styles.warning}>
            Update JOIN_BASE_URL and RELAY_WS_URL in src/config.ts to your LAN IP.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#071d11',
  },
  screen: {
    flex: 1,
    paddingHorizontal: 28,
    paddingBottom: 20,
    backgroundColor: '#0f2a1d',
  },
  topStripe: {
    height: 6,
    backgroundColor: '#d4af37',
    borderRadius: 999,
    marginTop: 8,
    marginBottom: 14,
  },
  title: {
    color: '#f5f5dc',
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 1,
  },
  subtitle: {
    color: '#b7d8c4',
    marginTop: 6,
    marginBottom: 14,
    fontSize: 17,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 14,
  },
  card: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2f5f46',
    padding: 14,
    backgroundColor: '#123623',
  },
  cardTitle: {
    color: '#f9e79f',
    fontWeight: '700',
    fontSize: 18,
    marginBottom: 8,
  },
  roomCode: {
    color: '#ffffff',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 3,
  },
  joinLabel: {
    color: '#92c7a5',
    marginTop: 8,
  },
  joinUrl: {
    color: '#d1e7d7',
    fontSize: 14,
  },
  metric: {
    color: '#eef7f0',
    fontSize: 16,
    marginBottom: 4,
  },
  hostControls: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2f5f46',
    backgroundColor: '#123623',
    padding: 14,
  },
  controlsTitle: {
    color: '#f9e79f',
    fontWeight: '700',
    fontSize: 18,
    marginBottom: 6,
  },
  controlsText: {
    color: '#d7f1de',
    fontSize: 15,
    marginBottom: 2,
  },
  rollButton: {
    marginTop: 10,
    backgroundColor: '#d4af37',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignSelf: 'flex-start',
  },
  rollButtonText: {
    color: '#132016',
    fontWeight: '800',
    fontSize: 18,
  },
  playersCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2f5f46',
    backgroundColor: '#123623',
    padding: 14,
  },
  emptyText: {
    color: '#cce6d6',
    fontSize: 15,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopColor: '#1f4c35',
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 8,
  },
  playerName: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
    width: 160,
  },
  playerMeta: {
    color: '#d7f1de',
    fontSize: 15,
  },
  logCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2f5f46',
    backgroundColor: '#123623',
    padding: 14,
    flex: 1,
  },
  logScroll: {
    marginTop: 8,
  },
  logLine: {
    color: '#e2f4e8',
    marginBottom: 6,
    fontSize: 14,
  },
  warning: {
    color: '#fecaca',
    marginTop: 10,
    fontSize: 13,
  },
});
