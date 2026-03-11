# Craps Party Vega

A new Vega app scaffold for a collaborative Fire TV craps game.

- Host plays on Fire TV with the remote.
- Other local players join in a browser using a room code URL (Jackbox-style flow).

## Project Layout

- `src/`: Vega host app UI and craps game logic
- `relay-server/`: local WebSocket relay + static file server
- `companion-web/`: browser client for joining and betting

## 1) Start the Local Relay Server

```bash
cd relay-server
npm install
npm run start
```

Default relay URL is `http://0.0.0.0:8787`.

## 2) Set the Host LAN Address in the Vega App

Edit `src/config.ts` and replace placeholders:

- `RELAY_WS_URL`
- `JOIN_BASE_URL`

Use your computer's LAN IP, for example:

- `ws://192.168.1.42:8787/ws`
- `http://192.168.1.42:8787`

## 3) Build and Run the Vega App

```bash
npm install
npm run build:debug
```

Then install/launch on your Vega device as you normally do.

## Host Controls (Fire TV Remote)

- `LEFT`: Host bet side = Pass
- `RIGHT`: Host bet side = Don't Pass
- `UP`: Increase host bet
- `DOWN`: Decrease host bet
- `SELECT`: Roll dice

## Companion Flow

Players open:

`http://<LAN-IP>:8787/?room=ABCD`

They join with a name and submit bets from mobile browsers.

## Notes

- This is an MVP scaffold intentionally optimized for fast iteration.
- The relay is local-network first and has no authentication.
- Host state is authoritative and broadcast to connected players.
