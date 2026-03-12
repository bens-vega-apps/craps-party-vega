# Craps Party Vega - Vega App Store Submission Checklist

## Already prepared in repo

- Manifest icon is configured:
  - `manifest.toml` -> `icon = "@image/craps_party_icon.png"`
- Generated icon assets:
  - `submission/store-assets/icon_large_512.png`
  - `submission/store-assets/icon_small_114.png`
  - `submission/store-assets/firetv_app_icon_1280x720.png`
- Companion join URL is shown in-app and derived from `RELAY_WS_URL`.

## Must be set before Live App Test / submission

1. Set a public relay endpoint in `src/config.ts`:
   - `RELAY_WS_URL = "wss://<your-public-relay-domain>/ws"`
2. Deploy `relay-server/` to a public HTTPS host.
   - Quick option: deploy this repo's `render.yaml` on Render.
3. Verify smartphone join from a network that is not your home Wi-Fi (to confirm internet accessibility).

## Test pass criteria (recommended)

1. Host creates room on Fire TV.
2. Two phones join from browser link shown on TV.
3. Both phones can submit:
   - Pass / Don't Pass / Come / Field
   - Pass Odds
   - Come Odds by number
   - Place / Place Backup
4. Chips and labels render correctly for each player on TV.
5. Payout/loss behavior is correct through:
   - point made
   - seven-out
   - come travel + come odds resolution

## Metadata/assets you still need to provide in Developer Console

- App description text
- Category and keywords
- Content rating questionnaire
- Privacy policy URL (if required by your data handling)
- Screenshots (you said you will capture these)
