const roomInput = document.getElementById('room');
const nameInput = document.getElementById('name');
const joinButton = document.getElementById('join');
const statusLabel = document.getElementById('status');
const betButton = document.getElementById('bet');
const betStatusLabel = document.getElementById('bet-status');
const targetInput = document.getElementById('target');
const amountInput = document.getElementById('amount');
const placeNumberInput = document.getElementById('place-number');
const placeAmountInput = document.getElementById('place-amount');
const placeBetButton = document.getElementById('place-bet');
const placeStatusLabel = document.getElementById('place-status');
const comeOddsNumberInput = document.getElementById('come-odds-number');
const comeOddsAmountInput = document.getElementById('come-odds-amount');
const comeOddsBetButton = document.getElementById('come-odds-bet');
const comeOddsStatusLabel = document.getElementById('come-odds-status');
const backupNumberInput = document.getElementById('backup-number');
const backupAmountInput = document.getElementById('backup-amount');
const backupBetButton = document.getElementById('backup-bet');
const backupStatusLabel = document.getElementById('backup-status');
const tableState = document.getElementById('table-state');
const tableRoll = document.getElementById('table-roll');
const tablePoint = document.getElementById('table-point');
const myBankrollLabel = document.getElementById('my-bankroll');
const myMainBetsLabel = document.getElementById('my-main-bets');
const myComeOddsBetsLabel = document.getElementById('my-come-odds-bets');
const myPlaceBetsLabel = document.getElementById('my-place-bets');
const myBackupBetsLabel = document.getElementById('my-backup-bets');
const playersList = document.getElementById('players');

const params = new URLSearchParams(window.location.search);
const LAST_ROOM_STORAGE_KEY = 'craps_party_last_room';
const LAST_NAME_STORAGE_KEY = 'craps_party_last_name';
const RECONNECT_GRACE_MS = 5 * 60 * 1000;
const RECONNECT_RETRY_MS = 2000;

const loadStoredValue = (key) => {
  try {
    return localStorage.getItem(key) || '';
  } catch (_error) {
    return '';
  }
};

const saveStoredValue = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch (_error) {
    // Ignore localStorage errors in restricted browser modes.
  }
};

const queryRoom = params.get('room');
if (queryRoom) {
  roomInput.value = queryRoom.toUpperCase();
} else {
  const storedRoom = loadStoredValue(LAST_ROOM_STORAGE_KEY);
  if (storedRoom) {
    roomInput.value = storedRoom.toUpperCase();
  }
}

if (!nameInput.value.trim()) {
  const storedName = loadStoredValue(LAST_NAME_STORAGE_KEY);
  if (storedName) {
    nameInput.value = storedName;
  }
}

let socket = null;
let joined = false;
let joinedRoom = '';
let joinedPlayerId = '';
let currentPoint = null;
let selfPlayerState = null;
let reconnectTimer = null;
let reconnectUntil = 0;
let reconnectContext = null;

const getPlayerIdStorageKey = (roomCode) =>
  `craps_party_player_id_${roomCode}`;

const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${
  window.location.host
}/ws`;

const setStatus = (text) => {
  statusLabel.textContent = text;
};

const setBetStatus = (text) => {
  betStatusLabel.textContent = text;
};

const setPlaceStatus = (text) => {
  placeStatusLabel.textContent = text;
};

const setComeOddsStatus = (text) => {
  comeOddsStatusLabel.textContent = text;
};

const setBackupStatus = (text) => {
  backupStatusLabel.textContent = text;
};

const getMaxOddsMultiple = (pointOrNumber) => {
  if (pointOrNumber === 4 || pointOrNumber === 10) {
    return 3;
  }
  if (pointOrNumber === 5 || pointOrNumber === 9) {
    return 4;
  }
  if (pointOrNumber === 6 || pointOrNumber === 8) {
    return 5;
  }
  return 0;
};

const targetLabel = (target) => {
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
    return 'Pass Odds';
  }
  return 'Main Bet';
};

const updateMainTargetAvailability = () => {
  const canUseLineBets = currentPoint === null;
  const canUseCome = currentPoint !== null;
  const canUseOdds =
    currentPoint !== null && Number(selfPlayerState?.passBet ?? 0) > 0;

  const passOption = targetInput.querySelector('option[value="pass"]');
  const dontPassOption = targetInput.querySelector('option[value="dontPass"]');
  const comeOption = targetInput.querySelector('option[value="come"]');
  const oddsOption = targetInput.querySelector('option[value="odds"]');

  passOption.disabled = !canUseLineBets;
  dontPassOption.disabled = !canUseLineBets;
  comeOption.disabled = !canUseCome;
  oddsOption.disabled = !canUseOdds;

  const current = targetInput.value;
  const currentOption = targetInput.querySelector(`option[value="${current}"]`);
  if (!currentOption || currentOption.disabled) {
    if (canUseLineBets) {
      targetInput.value = 'pass';
    } else if (canUseCome) {
      targetInput.value = 'come';
    } else {
      targetInput.value = 'field';
    }
  }
};

const renderPlayers = (players) => {
  playersList.innerHTML = '';
  players.forEach((player) => {
    const item = document.createElement('li');
    item.textContent = `${player.name} ($${player.chips ?? '--'})`;
    playersList.appendChild(item);
  });
};

const renderMyCurrentBets = (player) => {
  if (!player) {
    myBankrollLabel.textContent = 'Bankroll: --';
    myMainBetsLabel.textContent = 'Main Bets: --';
    myComeOddsBetsLabel.textContent = 'Come Odds: --';
    myPlaceBetsLabel.textContent = 'Place Bets: --';
    myBackupBetsLabel.textContent = 'Place Backup: --';
    return;
  }

  myBankrollLabel.textContent = `Bankroll: $${player.chips ?? 0}`;

  const mainParts = [];
  if (Number(player.passBet ?? 0) > 0) {
    mainParts.push(`Pass $${player.passBet}`);
  }
  if (Number(player.dontPassBet ?? 0) > 0) {
    mainParts.push(`Don't Pass $${player.dontPassBet}`);
  }
  if (Number(player.comeBet ?? 0) > 0) {
    mainParts.push(`Come $${player.comeBet}`);
  }
  if (Number(player.fieldBet ?? 0) > 0) {
    mainParts.push(`Field $${player.fieldBet}`);
  }
  if (Number(player.oddsBet ?? 0) > 0) {
    mainParts.push(`Odds $${player.oddsBet}`);
  }
  myMainBetsLabel.textContent = `Main Bets: ${
    mainParts.length > 0 ? mainParts.join(' | ') : 'None'
  }`;

  const comeOddsBets = player.comeOddsBets || {};
  const comeOddsParts = [4, 5, 6, 8, 9, 10]
    .map((number) => {
      const amount = Number(comeOddsBets[number] ?? 0);
      return amount > 0 ? `${number}=$${amount}` : null;
    })
    .filter(Boolean);
  myComeOddsBetsLabel.textContent = `Come Odds: ${
    comeOddsParts.length > 0 ? comeOddsParts.join(' | ') : 'None'
  }`;

  const placeBets = player.placeBets || {};
  const placeParts = [4, 5, 6, 8, 9, 10]
    .map((number) => {
      const amount = Number(placeBets[number] ?? 0);
      return amount > 0 ? `${number}=$${amount}` : null;
    })
    .filter(Boolean);
  myPlaceBetsLabel.textContent = `Place Bets: ${
    placeParts.length > 0 ? placeParts.join(' | ') : 'None'
  }`;

  const placeBackups = player.placeBackupBets || {};
  const backupParts = [4, 5, 6, 8, 9, 10]
    .map((number) => {
      const amount = Number(placeBackups[number] ?? 0);
      return amount > 0 ? `${number}=$${amount}` : null;
    })
    .filter(Boolean);
  myBackupBetsLabel.textContent = `Place Backup: ${
    backupParts.length > 0 ? backupParts.join(' | ') : 'None'
  }`;
};

const clearReconnectTimer = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

const resetLiveState = () => {
  joined = false;
  joinedPlayerId = '';
  selfPlayerState = null;
  currentPoint = null;
  setComeOddsStatus('');
  setBackupStatus('');
  renderMyCurrentBets(null);
  updateMainTargetAvailability();
};

const scheduleReconnect = () => {
  if (!reconnectContext) {
    return;
  }
  const remaining = reconnectUntil - Date.now();
  if (remaining <= 0) {
    reconnectContext = null;
    clearReconnectTimer();
    setStatus('Session timed out. Tap Join to reconnect.');
    resetLiveState();
    return;
  }

  clearReconnectTimer();
  reconnectTimer = setTimeout(() => {
    connectToRoom(reconnectContext.roomCode, reconnectContext.name, true);
  }, Math.min(RECONNECT_RETRY_MS, remaining));
};

const closeSocketIfOpen = () => {
  if (!socket) {
    return;
  }
  socket.onopen = null;
  socket.onclose = null;
  socket.onerror = null;
  socket.onmessage = null;
  if (
    socket.readyState === WebSocket.OPEN ||
    socket.readyState === WebSocket.CONNECTING
  ) {
    try {
      socket.close();
    } catch (_error) {
      // Ignore explicit close failures.
    }
  }
  socket = null;
};

const connectToRoom = (roomCode, name, isReconnect = false) => {
  if (!roomCode) {
    setStatus('Enter a room code.');
    return;
  }

  reconnectContext = {roomCode, name};
  if (!isReconnect) {
    reconnectUntil = Date.now() + RECONNECT_GRACE_MS;
    setBetStatus('');
    setComeOddsStatus('');
    setPlaceStatus('');
    setBackupStatus('');
  }

  closeSocketIfOpen();
  clearReconnectTimer();

  socket = new WebSocket(wsUrl);
  setStatus(isReconnect ? 'Reconnecting to room...' : 'Connecting...');

  socket.onopen = () => {
    const savedPlayerId = loadStoredValue(getPlayerIdStorageKey(roomCode));

    socket.send(
      JSON.stringify({
        type: 'join_room',
        role: 'player',
        roomCode,
        name,
        playerId: savedPlayerId || undefined,
      }),
    );
  };

  socket.onclose = () => {
    joined = false;

    if (reconnectContext && Date.now() < reconnectUntil) {
      setStatus('Disconnected. Reconnecting (session held for 5 minutes)...');
      scheduleReconnect();
      return;
    }

    reconnectContext = null;
    setStatus('Disconnected from relay.');
    resetLiveState();
  };

  socket.onerror = () => {
    if (!joined) {
      setStatus('Connection error. Retrying...');
    }
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data));

    if (message.type === 'joined') {
      joined = true;
      joinedRoom = message.roomCode;
      joinedPlayerId = message.playerId || '';
      reconnectUntil = Date.now() + RECONNECT_GRACE_MS;
      saveStoredValue(LAST_ROOM_STORAGE_KEY, message.roomCode);
      saveStoredValue(LAST_NAME_STORAGE_KEY, name);
      if (joinedPlayerId) {
        saveStoredValue(
          getPlayerIdStorageKey(message.roomCode),
          joinedPlayerId,
        );
      }

      setStatus(`Joined room ${message.roomCode} as ${message.name || name}`);
      setBetStatus('Choose a main bet and submit.');
      setComeOddsStatus('Choose a number to add come odds.');
      setPlaceStatus('Choose a number and submit a place bet.');
      setBackupStatus('Choose a number to add place backup.');
      updateMainTargetAvailability();
      clearReconnectTimer();
      return;
    }

    if (message.type === 'host_state' && message.state) {
      tableState.textContent = message.state.status || 'Waiting for host...';
      tableRoll.textContent = `Last roll: ${message.state.lastRoll || '--'}`;
      currentPoint = message.state.point ?? null;
      tablePoint.textContent = `Point: ${currentPoint ?? 'OFF'}`;

      if (Array.isArray(message.state.players)) {
        renderPlayers(message.state.players);
        selfPlayerState =
          message.state.players.find(
            (player) => player.id === joinedPlayerId,
          ) || null;
        renderMyCurrentBets(selfPlayerState);
      } else {
        renderMyCurrentBets(null);
      }
      updateMainTargetAvailability();
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
};

joinButton.addEventListener('click', () => {
  const roomCode = roomInput.value.trim().toUpperCase();
  const name = nameInput.value.trim() || 'Player';
  connectToRoom(roomCode, name, false);
});

window.addEventListener('pageshow', () => {
  if (
    reconnectContext &&
    Date.now() < reconnectUntil &&
    (!socket || socket.readyState === WebSocket.CLOSED)
  ) {
    connectToRoom(reconnectContext.roomCode, reconnectContext.name, true);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    return;
  }
  if (
    reconnectContext &&
    Date.now() < reconnectUntil &&
    (!socket || socket.readyState === WebSocket.CLOSED)
  ) {
    connectToRoom(reconnectContext.roomCode, reconnectContext.name, true);
  }
});

betButton.addEventListener('click', () => {
  if (!joined || !socket || socket.readyState !== WebSocket.OPEN) {
    setBetStatus('Join a room first.');
    return;
  }

  const target = targetInput.value;
  const amount = Number(amountInput.value);

  if (!Number.isFinite(amount) || amount < 5) {
    setBetStatus('Bet amount must be at least 5.');
    return;
  }

  if (target === 'come' && currentPoint === null) {
    setBetStatus('Come bets are allowed only after the point is ON.');
    return;
  }

  if ((target === 'pass' || target === 'dontPass') && currentPoint !== null) {
    setBetStatus("Pass/Don't Pass lock while point is ON.");
    return;
  }

  if (target === 'odds') {
    if (currentPoint === null) {
      setBetStatus('Odds are available only when point is ON.');
      return;
    }
    const passBet = Number(selfPlayerState?.passBet ?? 0);
    if (!selfPlayerState || passBet <= 0) {
      setBetStatus('Place a Pass Line bet first to add odds.');
      return;
    }
    const maxOdds = passBet * getMaxOddsMultiple(currentPoint);
    amountInput.value = String(Math.min(amount, maxOdds));
  }

  const submittedAmount = Number(amountInput.value);
  socket.send(
    JSON.stringify({
      type: 'player_bet',
      roomCode: joinedRoom,
      target,
      amount: submittedAmount,
    }),
  );

  setBetStatus(`Submitted: $${submittedAmount} on ${targetLabel(target)}.`);
});

comeOddsBetButton.addEventListener('click', () => {
  if (!joined || !socket || socket.readyState !== WebSocket.OPEN) {
    setComeOddsStatus('Join a room first.');
    return;
  }

  const number = Number(comeOddsNumberInput.value);
  const amount = Number(comeOddsAmountInput.value);

  if (![4, 5, 6, 8, 9, 10].includes(number)) {
    setComeOddsStatus('Choose a valid number (4,5,6,8,9,10).');
    return;
  }

  if (!Number.isFinite(amount) || amount < 5) {
    setComeOddsStatus('Come odds amount must be at least 5.');
    return;
  }

  const existingComePoint = Number(selfPlayerState?.comePointBets?.[number] ?? 0);
  if (existingComePoint <= 0) {
    setComeOddsStatus(`Place a Come point on ${number} first.`);
    return;
  }

  const maxComeOdds = existingComePoint * getMaxOddsMultiple(number);
  const bankroll = Number(selfPlayerState?.chips ?? 0);
  const clampedAmount = Math.min(amount, maxComeOdds, bankroll);

  if (clampedAmount <= 0) {
    setComeOddsStatus('No chips available for come odds.');
    return;
  }

  socket.send(
    JSON.stringify({
      type: 'player_bet',
      roomCode: joinedRoom,
      target: 'comeOdds',
      number,
      amount: clampedAmount,
    }),
  );

  setComeOddsStatus(
    `Submitted: Come odds ${number} for $${clampedAmount} (max $${maxComeOdds}).`,
  );
});

placeBetButton.addEventListener('click', () => {
  if (!joined || !socket || socket.readyState !== WebSocket.OPEN) {
    setPlaceStatus('Join a room first.');
    return;
  }

  const number = Number(placeNumberInput.value);
  const amount = Number(placeAmountInput.value);

  if (![4, 5, 6, 8, 9, 10].includes(number)) {
    setPlaceStatus('Choose a valid place number (4,5,6,8,9,10).');
    return;
  }

  if (!Number.isFinite(amount) || amount < 5) {
    setPlaceStatus('Place bet amount must be at least 5.');
    return;
  }

  socket.send(
    JSON.stringify({
      type: 'player_bet',
      roomCode: joinedRoom,
      target: 'place',
      number,
      amount,
    }),
  );

  setPlaceStatus(`Submitted: Place ${number} for $${amount}.`);
});

backupBetButton.addEventListener('click', () => {
  if (!joined || !socket || socket.readyState !== WebSocket.OPEN) {
    setBackupStatus('Join a room first.');
    return;
  }

  const number = Number(backupNumberInput.value);
  const amount = Number(backupAmountInput.value);

  if (![4, 5, 6, 8, 9, 10].includes(number)) {
    setBackupStatus('Choose a valid number (4,5,6,8,9,10).');
    return;
  }

  if (!Number.isFinite(amount) || amount < 5) {
    setBackupStatus('Backup amount must be at least 5.');
    return;
  }

  const existingPlaceBet = Number(selfPlayerState?.placeBets?.[number] ?? 0);
  if (existingPlaceBet <= 0) {
    setBackupStatus(`Place a Place ${number} bet first.`);
    return;
  }

  const maxBackup = existingPlaceBet * getMaxOddsMultiple(number);
  const clampedAmount = Math.min(amount, maxBackup);

  socket.send(
    JSON.stringify({
      type: 'player_bet',
      roomCode: joinedRoom,
      target: 'backup',
      number,
      amount: clampedAmount,
    }),
  );

  setBackupStatus(
    `Submitted: Backup ${number} for $${clampedAmount} (max $${maxBackup}).`,
  );
});

updateMainTargetAvailability();
renderMyCurrentBets(null);
