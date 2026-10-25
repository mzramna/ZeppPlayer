import * as hmUI from "@zos/ui";
import { getText } from "@zos/i18n";
import { BasePage } from "@zeppos/zml/base-page";
import { METHOD } from "../../shared/protocol.js";
import { buildPayload } from "../../shared/zepp2hass.js";
import { FEATURES } from "../../config/build.js";
import { W, TOP, MARGIN, COLOR, FONT, RADIUS } from "../../utils/theme.js";
import { createTracked, clear, title, actionButton, toast } from "../../utils/ui.js";
import { collectReadings } from "../../app-service/collect.js";
import { KEY_LAST, KEY_ALARM, read, write, scheduleNext, stop } from "../../app-service/schedule.js";

const FIRST_DELAY_SEC = 10;
const CARD_H = 240;

function lastSync() {
  const raw = read(KEY_LAST);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

const pad = (n) => String(n).padStart(2, "0");
function formatTime(t) {
  const d = new Date(t);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page(
  BasePage({
    state: {
      widgets: [],
      mode: null,
      alive: false,
    },
    build() {
      this.state.alive = true;
      this.render();
      this.request({ method: METHOD.GET_CONFIG, params: {} })
        .then((config) => {
          this.state.mode = config.sensorMode;
        })
        .catch(() => {
          this.state.mode = "unknown";
        })
        .then(() => this.render());
    },
    render() {
      // A reply can arrive after the page was left; drawing then would leave widgets behind.
      if (!this.state.alive) return;
      const list = this.state.widgets;
      clear(list);
      title(list, getText("sync_title"));

      const last = lastSync();
      const auto = !!read(KEY_ALARM);
      const lines = [
        `${getText("sync_last")}: ${last ? formatTime(last.time) : getText("sync_never")}`,
        last ? (last.ok ? getText("sync_ok") : `${getText("sync_error")}: ${last.error}`) : "",
        `${getText("sync_mode")}: ${this.state.mode ? getText(`sync_mode_${this.state.mode}`) : "..."}`,
      ];
      if (FEATURES.appService) lines.push(getText(auto ? "sync_auto_on" : "sync_auto_off"));

      let y = TOP + 40;
      createTracked(list, hmUI.widget.FILL_RECT, {
        x: MARGIN, y, w: W - MARGIN * 2, h: CARD_H, radius: RADIUS, color: COLOR.card,
      });
      lines.forEach((text, i) =>
        createTracked(list, hmUI.widget.TEXT, {
          x: MARGIN + 24, y: y + 20 + i * 48, w: W - MARGIN * 2 - 48, h: 40, text,
          text_size: FONT.small, color: COLOR.text, align_v: hmUI.align.CENTER_V,
          text_style: hmUI.text_style.ELLIPSIS,
        })
      );
      y += CARD_H + 24;

      actionButton(list, { x: MARGIN, y, w: W - MARGIN * 2, h: 72, text: getText("sync_now"), onClick: () => this.syncNow() });
      y += 88;
      if (FEATURES.appService) {
        actionButton(list, {
          x: MARGIN, y, w: W - MARGIN * 2, h: 72,
          text: getText(auto ? "sync_stop" : "sync_start"),
          onClick: () => (auto ? this.stopAuto() : this.startAuto()),
        });
      }
    },
    syncNow() {
      let payload;
      try {
        payload = buildPayload(collectReadings());
      } catch (e) {
        return this.finishSync(false, (e && e.message) || String(e));
      }
      return this.request({ method: METHOD.SYNC_SENSORS, params: { payload } })
        .then(() => this.finishSync(true))
        .catch((e) => this.finishSync(false, (e && e.message) || String(e)));
    },
    finishSync(ok, error) {
      if (!this.state.alive) return;
      write(KEY_LAST, JSON.stringify({ time: Date.now(), ok, error }));
      toast(getText(ok ? "sync_done" : "sync_failed"));
      this.render();
    },
    startAuto() {
      const ok = scheduleNext(FIRST_DELAY_SEC);
      toast(getText(ok ? "sync_started" : "sync_failed"));
      this.render();
    },
    stopAuto() {
      stop();
      toast(getText("sync_stopped"));
      this.render();
    },
    onDestroy() {
      this.state.alive = false;
      clear(this.state.widgets);
    },
  })
);
