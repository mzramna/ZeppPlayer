# Home Assistant companion for Zepp OS devices

Control your Home Assistant devices from your Zepp OS watch and send health data back to Home Assistant. Based on [ga2mer's ha-zepp](https://github.com/ga2mer/ha-zepp) (<b>thanks for that!</b> 🥰). The modern app targets Zepp OS API 3.6+; the original 1.0 app is kept in `legacy/`.

<img src="images/img1.jpg" width="300" height="300"> <img src="images/img2.jpg" width="300" height="300">

## 🎨 Features
- Control entities: lights (brightness when supported, effects), switches, fans, climate, covers, locks, vacuums, media players, alarm panels.
- Run scenes, scripts, automations and buttons.
- Show sensor values on the watch.
- Favorites and areas.
- Send health data to Home Assistant with [zepp2hass](https://github.com/davidepalleschi/zepp2hass) (install via HACS), the `mobile_app` integration (the watch is registered as a device with persistent sensors), or legacy REST states.
- LAN-first URL failover: the local URL is tried first, then the external one.
- Camera snapshots: experimental, off by default (`--feature camera=true`).
- Sleep as Android: start/stop sleep tracking from the watch through Home Assistant (see below).
- Background health sync every N minutes without waking the screen (app service + alarm).

## ⌚ Which build to install

| API profile | Build file | Watches |
|---|---|---|
| 4.0 and 3.6 | `dist/ha-zepp-api4.0.zab`, `dist/ha-zepp-api3.6.zab` | Round Zepp OS watches with API level 3.6 or newer. Examples (untested): Amazfit Balance, Balance 2, Active 2, Cheetah, T-Rex 3 |
| 1.0 | `dist/ha-zepp-api1.0.zab` (from `legacy/`) | Legacy Zepp OS 1.0 watches: Xiaomi/Amazfit Band 7, GTR 3, GTR 3 Pro, GTR mini, GTR 4, GTS 4 mini, Cheetah Pro, Active, Balance, T-Rex 2 |

Some models appear in both lists. Install the 3.6/4.0 build if the watch's API level is 3.6 or newer; otherwise use 1.0.

**None of the modern builds has been tested on hardware yet.**

Xiaomi Band 7 needs a QR-code change before it links to the Zepp App; follow [this guide](https://aguacatec.es/instalar-ha-en-la-xiaomi-band-7/).

## 🛠 Building

```sh
npm install
npm install -g @zeppos/zeus-cli@1.9.3   # zeus only works as a global install (ZEUS_BIN overrides the path)
npm run build -- --api 4.0     # one profile
ZEPP_API=3.6 npm run build     # same, selected by environment variable
npm run build:all              # 1.0, 3.6 and 4.0
```

Output goes to `dist/ha-zepp-api<level>.zab`. Flags:

| Flag | Effect |
|---|---|
| `--api <level>\|all` | Profile to build (default `4.0`, or `ZEPP_API`) |
| `--debug` | Sets `debug` in the generated app.json |
| `--shape r,s` | Target screen shapes: `r` (480 px round), `s` (390 px) |
| `--feature name=true\|false` | Override a feature flag (modern builds only) |
| `--dry-run` | Stage the build without running `zeus build` |

How profiles work:
- `build.config.js` defines one profile per API level: platforms, permissions and feature flags.
- Each build is staged in `build/api-<level>/`, with a generated `app.json` (from `app.template.json`) and `config/build.js` exporting `API_LEVEL` and `FEATURES`.
- `foo.api-X.Y.js` replaces `foo.js` in the staged tree when the selected level is at least X.Y. The highest matching variant wins. The source tree is not changed.

To add an API level, add one block to `build.config.js`:

```js
"4.5": { apiVersion: { compatible: "4.5", target: "4.5", minVersion: "4.5" }, ...MODERN },
```

Add `*.api-4.5.js` variants only for modules that change. CI builds `--api all`, so the new profile is picked up automatically.

## 📦 Setup

1. Install the official Zepp App for [Android](https://play.google.com/store/apps/details?id=com.huami.watch.hmwatchmanager) or [iOS](https://apps.apple.com/es/app/zepp-formerly-amazfit/id1127269366), and enable [Developer Mode](https://docs.zepp.com/docs/1.0/guides/tools/zepp-app/).
2. Install the `.zab` on the watch with the [Zeus CLI](https://docs.zepp.com/docs/1.0/guides/tools/cli/) or the [installer by Barny](https://aguacatec.es/wp-content/uploads/2024/03/HA-ZeppOS-instaleitor.zip).
3. Open the app's settings in the Zepp App:
   - **Local URL** (for example `http://homeassistant.local:8123`) and optional **external URL**.
   - **Long-lived access token** from your Home Assistant profile.
   - Press **Refresh entities**, then select the entities and favorites to show.
   - **Sensor sync mode**: `none`, `zepp2hass`, `mobile_app` or `rest`.
   - For zepp2hass: the **webhook URL**. For mobile_app: press **Register in Home Assistant**.
   - **Sync interval** in minutes.

### 😴 Sleep as Android
The Zepp phone side cannot send Android intents, so the watch goes through Home Assistant and the [HA Companion app](https://companion.home-assistant.io/docs/notifications/notification-commands/) on the phone that runs Sleep as Android:
1. In the settings page, set **Sleep as Android notify service** to the Companion notify service of that phone, e.g. `mobile_app_pixel_8` (a `notify.` prefix is removed).
2. Optionally set a **status entity** that reflects Sleep as Android (e.g. an `input_boolean` you switch from the [`sleep_as_android` integration](https://www.home-assistant.io/integrations/sleep_as_android/) events).
3. The watch's **Sleep as Android** page sends `command_broadcast_intent` with `com.urbandroid.sleep.alarmclock.START_SLEEP_TRACK` / `STOP_SLEEP_TRACK`.

Not supported: snooze/dismiss (intent names unconfirmed) and using the watch as Sleep as Android's motion/heart-rate sensor (that needs an Android bridge such as Gadgetbridge or Notify for Amazfit, which already exist).

A step-by-step guide in Spanish: [general steps](https://aguacatec.es/instalar-ha-en-tu-reloj-zepp/).

## ⚠️ Limitations
- No direct integration with the Android Home Assistant Companion app. The Zepp phone side runs sandboxed JavaScript.
- Home Assistant to watch updates are polled while the app is open. Home Assistant notifications reach the watch through Zepp's phone-notification mirroring, for example `notify.mobile_app_<phone>`.
- Modern builds need API level 3.6 or newer.
- Camera snapshots are experimental.
- Modern builds are not yet tested on hardware.

## 🧪 Development
```sh
npm install
npm test               # node:test suite: watch pages, phone side, app service, settings, build script
npm run test:coverage  # same, with per-file coverage and minimum thresholds
npm run check          # tsc type check against @zeppos/device-types and ZML typings
npm run i18n           # regenerate page/i18n/*.po from i18n-src/*.json
npm run verify         # preliminary pre-compilation: stage every API profile and check the package is complete
```

### Pull request checks
Every pull request runs `.github/workflows/pr.yml`:
- **verify**: tests with coverage thresholds, type check, translations in sync with `i18n-src`, and `npm run verify` (each API profile is staged and every page, service, icon and translation `app.json` points to must exist).
- **precompile (API 1.0 / 3.6 / 4.0)**: one real `zeus build` job per API profile (the list comes from `build.config.js` via `node scripts/build.js --list`, so a new profile gets its own build automatically); the `.zab` files are attached to the run as artifacts for testing on a watch.

Pushes to `main` run the same per-profile builds (`.github/workflows/main.yml`) and publish every `.zab` in the `latest` prerelease.

To block merging until they pass, add `verify` and the three `precompile (API …)` checks as **required status checks** in *Settings → Branches → branch protection rule for `main`* (or a ruleset with "Require status checks to pass").

Tests run the real watch and phone code in Node: `test/helpers/setup.js` maps every `@zos/*` and `@zeppos/zml/*` import to small mocks in `test/mocks/` and provides the runtime globals (`Page`, `AppService`, `AppSideService`, `settings`, `fetch`). See `test/helpers/watch.js` and `test/helpers/phone.js`.

Project layout:
- `app-side/`: phone side (HTTP to Home Assistant, LAN-first failover, sensor sync, mobile_app registration).
- `app-service/`: background sensor sync on the watch.
- `page/`: watch pages (home, entities, areas, one page per domain, sync).
- `utils/`: shared watch UI and theme tokens.
- `shared/`: watch-to-phone protocol, used by both sides.
- `setting/`: Zepp App settings page and translations.
- `legacy/`: the original Zepp OS 1.0 app. No new features; bug fixes only (reverse-proxy base path, implicit globals, side requests that never answered on HTTP errors).
- `scripts/`: build, i18n and icon generator scripts.
- `test/`: automated tests and the Zepp OS/ZML mocks.
- `docs/`: notes.

## 🆘 Need help?
No problem! We can help you out to make it work! Just get into our [Telegram community](https://t.me/aguacatec_es) and ask for help. We have a topic dedicated to the application, and a room where we speak English 🌍

## ♥️ Support us!
We keep working to improve the interface, to add funtionalities and to make it compatible with more Zepp devices. If you want to support us you can do it by:

💬 Join our [Telegram community](https://t.me/aguacatec_es)

🌍 Follow us in [Facebook](https://www.facebook.com/people/Aguacatec/100094561999571/), [Twitter](https://twitter.com/aguacatec_es), [Instagram](https://www.instagram.com/aguacatec_es/), [YouTube](https://www.youtube.com/channel/UC-lBXak7y2RFoghB1QMgbdw) and [TikTok](https://www.tiktok.com/@aguacatec_es)

📧 [Subscribe](https://aguacatec.es/gana-premios-con-aguacatec/) to aguacatec to get new ideas like this one

☕ Consider to [Buy me a coffee](https://www.buymeacoffee.com/aguacatec)

😍 Or became our [Patreon!](https://www.patreon.com/AguacaTEC)
