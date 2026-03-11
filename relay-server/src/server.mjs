import {createServer} from 'node:http';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, extname, join, normalize} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {WebSocketServer, WebSocket} from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webRoot = normalize(join(__dirname, '..', '..', 'companion-web'));

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';

const rooms = new Map();

const send = (socket, payload) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(payload));
};

const getRoom = roomCode => {
  const normalizedCode = roomCode.toUpperCase();
  if (!rooms.has(normalizedCode)) {
    rooms.set(normalizedCode, {
      host: null,
      players: new Map(),
      lastHostState: null,
    });
  }
  return rooms.get(normalizedCode);
};

const broadcastPresence = roomCode => {
  const room = rooms.get(roomCode);
  if (!room) {
    return;
  }

  const players = Array.from(room.players.entries()).map(([id, player]) => ({
    id,
    name: player.name,
  }));

  const payload = {
    type: 'room_presence',
    roomCode,
    hostConnected: Boolean(room.host),
    players,
  };

  send(room.host, payload);
  room.players.forEach(player => send(player.socket, payload));
};

const cleanupRoomIfEmpty = roomCode => {
  const room = rooms.get(roomCode);
  if (!room) {
    return;
  }

  if (!room.host && room.players.size === 0) {
    rooms.delete(roomCode);
  }
};

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');
  const requestPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  const cleanedPath = normalize(requestPath).replace(/^\.+/, '');
  const filePath = join(webRoot, cleanedPath);

  if (!filePath.startsWith(webRoot) || !existsSync(filePath)) {
    response.writeHead(404, {'content-type': 'text/plain'});
    response.end('Not found');
    return;
  }

  const extension = extname(filePath).toLowerCase();
  const contentType =
    extension === '.html'
      ? 'text/html; charset=utf-8'
      : extension === '.css'
      ? 'text/css; charset=utf-8'
      : extension === '.js'
      ? 'application/javascript; charset=utf-8'
      : 'text/plain; charset=utf-8';

  response.writeHead(200, {'content-type': contentType});
  response.end(readFileSync(filePath));
});

const wss = new WebSocketServer({server, path: '/ws'});

wss.on('connection', socket => {
  socket.meta = {
    role: null,
    roomCode: null,
    playerId: null,
    name: null,
  };

  socket.on('message', raw => {
    let message;

    try {
      message = JSON.parse(String(raw));
    } catch (_error) {
      send(socket, {type: 'error', message: 'Malformed JSON payload'});
      return;
    }

    if (message.type === 'join_room') {
      const role = message.role;
      const roomCode = String(message.roomCode ?? '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8);

      if (!roomCode || (role !== 'host' && role !== 'player')) {
        send(socket, {type: 'error', message: 'Invalid join payload'});
        return;
      }

      const room = getRoom(roomCode);

      if (role === 'host') {
        room.host = socket;
        socket.meta = {role, roomCode, playerId: null, name: 'Host'};

        send(socket, {type: 'joined', role, roomCode});
        if (room.lastHostState) {
          send(socket, {type: 'host_state', state: room.lastHostState});
        }
        broadcastPresence(roomCode);
        return;
      }

      const playerId = String(message.playerId ?? randomUUID().slice(0, 8));
      const name = String(message.name ?? 'Player').slice(0, 20).trim() || 'Player';

      room.players.set(playerId, {
        socket,
        name,
      });

      socket.meta = {role, roomCode, playerId, name};

      send(socket, {type: 'joined', role, roomCode, playerId, name});
      if (room.lastHostState) {
        send(socket, {type: 'host_state', state: room.lastHostState});
      }

      broadcastPresence(roomCode);
      return;
    }

    const meta = socket.meta;
    if (!meta.roomCode) {
      send(socket, {type: 'error', message: 'Join a room first'});
      return;
    }

    const room = rooms.get(meta.roomCode);
    if (!room) {
      send(socket, {type: 'error', message: 'Room no longer exists'});
      return;
    }

    if (message.type === 'host_state' && meta.role === 'host') {
      room.lastHostState = message.state;
      room.players.forEach(player => {
        send(player.socket, {type: 'host_state', state: message.state});
      });
      return;
    }

    if (message.type === 'player_bet' && meta.role === 'player') {
      send(room.host, {
        type: 'player_bet',
        roomCode: meta.roomCode,
        playerId: meta.playerId,
        name: meta.name,
        side: message.side,
        amount: Number(message.amount ?? 0),
      });
      return;
    }

    send(socket, {type: 'error', message: 'Unsupported message type'});
  });

  socket.on('close', () => {
    const meta = socket.meta;
    if (!meta || !meta.roomCode) {
      return;
    }

    const room = rooms.get(meta.roomCode);
    if (!room) {
      return;
    }

    if (meta.role === 'host' && room.host === socket) {
      room.host = null;
    }

    if (meta.role === 'player' && meta.playerId) {
      room.players.delete(meta.playerId);
    }

    broadcastPresence(meta.roomCode);
    cleanupRoomIfEmpty(meta.roomCode);
  });
});

server.listen(port, host, () => {
  console.log(`Craps relay running on http://${host}:${port}`);
});
