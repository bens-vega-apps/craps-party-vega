const roomInput = document.getElementById('room');
const nameInput = document.getElementById('name');
const joinButton = document.getElementById('join');
const statusLabel = document.getElementById('status');
const betButton = document.getElementById('bet');
const betStatusLabel = document.getElementById('bet-status');
const sideInput = document.getElementById('side');
const amountInput = document.getElementById('amount');
const tableState = document.getElementById('table-state');
const tableRoll = document.getElementById('table-roll');
const tablePoint = document.getElementById('table-point');
const playersList = document.getElementById('players');

const params = new URLSearchParams(window.location.search);
if (params.get('room')) {
  roomInput.value = params.get('room').toUpperCase();
}

let socket = null;
let joined = false;
let joinedRoom = '';

const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

const setStatus = text => {
  statusLabel.textContent = text;
};

const setBetStatus = text => {
  betStatusLabel.textContent = text;
};

const renderPlayers = players => {
  playersList.innerHTML = '';
  players.forEach(player => {
    const item = document.createElement('li');
    item.textContent = player.name;
    playersList.appendChild(item);
  });
};

joinButton.addEventListener('click', () => {
  const roomCode = roomInput.value.trim().toUpperCase();
  const name = nameInput.value.trim() || 'Player';

  if (!roomCode) {
    setStatus('Enter a room code.');
    return;
  }

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
  }

  socket = new WebSocket(wsUrl);
  setStatus('Connecting...');
  joined = false;

  socket.onopen = () => {
    socket.send(
      JSON.stringify({
        type: 'join_room',
        role: 'player',
        roomCode,
        name,
      }),
    );
  };

  socket.onclose = () => {
    setStatus('Disconnected from relay.');
    joined = false;
  };

  socket.onerror = () => {
    setStatus('Connection error.');
  };

  socket.onmessage = event => {
    const message = JSON.parse(String(event.data));

    if (message.type === 'joined') {
      joined = true;
      joinedRoom = message.roomCode;
      setStatus(`Joined room ${message.roomCode} as ${message.name || name}`);
      setBetStatus('Choose your side and submit a bet.');
      return;
    }

    if (message.type === 'host_state' && message.state) {
      tableState.textContent = message.state.status || 'Waiting for host...';
      tableRoll.textContent = `Last roll: ${message.state.lastRoll || '--'}`;
      tablePoint.textContent = `Point: ${message.state.point ?? 'OFF'}`;
      if (Array.isArray(message.state.players)) {
        renderPlayers(message.state.players);
      }
      return;
    }

    if (message.type === 'room_presence') {
      renderPlayers(message.players || []);
      return;
    }

    if (message.type === 'error') {
      setStatus(`Error: ${message.message}`);
    }
  };
});

betButton.addEventListener('click', () => {
  if (!joined || !socket || socket.readyState !== WebSocket.OPEN) {
    setBetStatus('Join a room first.');
    return;
  }

  const side = sideInput.value;
  const amount = Number(amountInput.value);

  if (!Number.isFinite(amount) || amount < 5) {
    setBetStatus('Bet amount must be at least 5.');
    return;
  }

  socket.send(
    JSON.stringify({
      type: 'player_bet',
      roomCode: joinedRoom,
      side,
      amount,
    }),
  );

  setBetStatus(`Bet submitted: ${amount} on ${side === 'pass' ? 'Pass' : "Don't Pass"}.`);
});
