# AmazHA feature parity (clean-room notes)

Compares ha-zepp with AmazHA, a proprietary Zepp OS companion app for Home Assistant ([amazha.app](https://amazha.app/), [HA forum thread](https://community.home-assistant.io/t/amazha-a-native-amazfit-zepp-os-companion-app-for-home-assistant/1014421)).

## Method
- No AmazHA code or assets were decompiled, extracted or copied.
- Sources are public only: the AmazHA website and the HA forum thread.
- The evidence labelling is inspired by the [REA](https://github.com/morluto/rea) workflow, which returns each finding with its evidence and limitations. REA itself is limited to software you own or are authorized to examine, so it was not run against AmazHA.

Evidence labels:
- **seen**: listed in public sources.
- **inferred**: deduced from public descriptions or screenshots, not confirmed.
- **unknown**: no public evidence.

Status labels (ha-zepp): **done**, **experimental**, **not planned**.

## Parity table

| Feature | Evidence | ha-zepp status |
|---|---|---|
| Control screen: lights | seen | done (`page/light`) |
| Control screen: switches | seen | done (toggle in place) |
| Control screen: climate | seen | done (`page/climate`) |
| Control screen: covers | seen | done (`page/cover`) |
| Control screen: vacuums | seen | done (`page/vacuum`) |
| Control screen: locks | seen | done (`page/lock`) |
| Control screen: media players | seen | done (`page/media_player`) |
| Control screen: fans | seen | done (`page/fan`) |
| Control screen: alarm panels | seen | done (`page/alarm`) |
| Scenes and scripts | seen | done (run in place) |
| Camera snapshots | seen | experimental, off by default (`--feature camera=true`) |
| Favorites | seen | done |
| Health data pushed to HA as sensors | seen | done via zepp2hass or mobile_app; `rest` mode for legacy states |
| Local and remote URL with LAN-first failover | seen | done (`app-side/http.js`) |
| Watch talks to HA through the Zepp phone app | seen | done, same design: watch to phone over the Zepp bridge, phone to HA over HTTP |
| Free demo with one-time unlock | seen | not planned; ha-zepp is free and has no unlock |
| About 25 supported models (Active Edge, Bip 5 listed; T-Rex 2 reportedly unsupported) | seen | not planned as a model list; modern builds are selected by API level (3.6+) and are not yet hardware tested |
| Dark rounded card UI with per-domain colour | inferred | done (`utils/ui.js` cards, `DOMAINS` colours in `utils/theme.js`) |
| Exact layouts and animations | unknown | not planned; ha-zepp uses its own tokens in `utils/theme.js` |
| How camera images are converted on the watch | unknown | experimental; watch-side JPEG rendering is unverified (`build.config.js`) |

## Help refine the look
If you have the AmazHA demo, send screenshots you took yourself to refine the "inferred" rows. Please do not send app files, packages or assets.
