/**
 * Relay endpoint used by the TV app.
 *
 * Live App Test / Store builds:
 * - Use a public TLS endpoint, for example:
 *   wss://relay.your-domain.com/ws
 *
 * Local home-network testing:
 * - Use your relay host LAN IP, for example:
 *   ws://192.168.68.105:8787/ws
 */
export const RELAY_WS_URL = 'wss://craps-party-relay.onrender.com/ws';

const deriveJoinBaseUrl = (relayWsUrl: string): string => {
  try {
    const parsed = new URL(relayWsUrl);
    const protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
    return `${protocol}//${parsed.host}`;
  } catch (_error) {
    return 'https://craps-party-relay.onrender.com';
  }
};

const isPrivateHost = (host: string): boolean => {
  const normalized = host.trim().toLowerCase();

  if (
    normalized === 'localhost' ||
    normalized.endsWith('.local') ||
    normalized.startsWith('127.')
  ) {
    return true;
  }

  if (normalized.startsWith('10.') || normalized.startsWith('192.168.')) {
    return true;
  }

  const match = normalized.match(/^172\.(\d{1,3})\./);
  if (match) {
    const secondOctet = Number(match[1]);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  return false;
};

export const JOIN_BASE_URL = deriveJoinBaseUrl(RELAY_WS_URL);

const joinHost = (() => {
  try {
    return new URL(JOIN_BASE_URL).hostname;
  } catch (_error) {
    return 'localhost';
  }
})();

export const JOIN_NETWORK_HINT = isPrivateHost(joinHost)
  ? 'Use the same Wi-Fi for phone + Fire TV + relay host.'
  : 'Players can join from any phone network (internet required).';

export const HOST_CHIPS_START = 500;
export const PLAYER_CHIPS_START = 500;
