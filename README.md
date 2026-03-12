# Craps Party Vega

Collaborative craps for Fire TV (host) with companion betting from smartphones.

- Host plays on Fire TV with the remote.
- Other players join from their phone browser with room code + link.

## Project Layout

- `src/`: Vega TV app UI + craps game logic
- `relay-server/`: WebSocket relay + companion web server
- `companion-web/`: smartphone browser betting UI
- `scripts/generate_store_assets.sh`: store icon generator
- `submission/store-assets/`: generated App Store icon assets

## Relay Setup

### What is a public relay domain?

The relay is the bridge between:

- the Fire TV app (host)
- each phone browser (players)

Your current LAN relay URL (`ws://192.168.x.x:8787/ws`) works only on your home Wi-Fi.
For Live App Test and real-world use, the app needs an internet-reachable hostname like:

- `https://craps-party-relay.onrender.com`
- `wss://craps-party-relay.onrender.com/ws`

That hostname is your **public relay domain**.

### Local LAN (home testing)

1. Start relay:

```bash
cd relay-server
npm install
npm run start
```

2. Set `RELAY_WS_URL` in `src/config.ts` to your relay host LAN address:

```ts
export const RELAY_WS_URL = 'ws://192.168.68.105:8787/ws';
```

3. Build and run the app:

```bash
npm install
npm run build:debug
```

Phone players must be on the same Wi-Fi as Fire TV and relay host in LAN mode.

### Live App Test / App Store-style testing

Use a public TLS relay URL in `src/config.ts`:

```ts
export const RELAY_WS_URL = 'wss://relay.your-domain.com/ws';
```

`JOIN_BASE_URL` is derived automatically from `RELAY_WS_URL` and shown in the TV "How to Join via Smartphone" card.

### Deploy relay on Render (quick path)

This repo includes a ready blueprint: `render.yaml`.

1. Push this repo to GitHub.
2. In Render, click `New` -> `Blueprint`.
3. Connect your GitHub repo and select this project.
4. Render will detect `render.yaml` and create `craps-party-relay`.
5. After deploy, copy the service URL, e.g.:
   - `https://craps-party-relay.onrender.com`
6. Update `src/config.ts`:

```ts
export const RELAY_WS_URL = 'wss://craps-party-relay.onrender.com/ws';
```

7. Rebuild and install the app:

```bash
npm run build:debug
```

## Host Controls (Fire TV Remote)

- `LEFT/RIGHT`: change bet amount
- `UP/DOWN`: move selected betting target
- `SELECT`: place the selected bet
- `PLAY/PAUSE`: roll dice

## Companion Flow

Players open the link shown on TV:

`https://<relay-host>/?room=ABCD`

Then they:

- place main bets (Pass / Don't Pass / Come / Field / Pass Odds)
- place Come Odds by number
- place Place Bets and Place Backup bets

## Store Assets

Generate icons:

```bash
./scripts/generate_store_assets.sh
```

Outputs:

- `assets/image/craps_party_icon.png` (manifest icon)
- `assets/image/craps_party_icon_large.png` (512x512)
- `assets/image/craps_party_icon_small.png` (114x114)
- `submission/store-assets/icon_large_512.png`
- `submission/store-assets/icon_small_114.png`
- `submission/store-assets/firetv_app_icon_1280x720.png`
