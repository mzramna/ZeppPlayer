import { BasePage } from "@zeppos/zml/base-page";
import * as hmUI from "@zos/ui";
import { getText } from "@zos/i18n";
import { METHOD } from "../../shared/protocol.js";
import { COLOR, CX, FONT, MARGIN, W } from "../../utils/theme.js";
import { actionButton, clear, createTracked, entityCard, loading, message, title, toast } from "../../utils/ui.js";
import { wait } from "../../utils/controls.js";
import { SAA_ACTIONS, saaCommand } from "../../utils/sleep.js";

const CONFIRM_MS = 3000;
// SaA updates its status entity a moment after the intent is handled.
const REFRESH_MS = 2000;
const SAA_COLOR = 0x5e5ce6;

Page(
  BasePage({
    state: /** @type {Record<string, any>} */ ({}),

    onInit() {
      this.state.list = [];
      this.state.alive = true;
      this.state.armed = false;
      loading(this.state.list);
      this.load();
    },

    onDestroy() {
      this.state.alive = false;
      clearTimeout(this.state.timer);
    },

    load() {
      return this.request({ method: METHOD.GET_CONFIG, params: {} })
        .then((config) => {
          if (!this.state.alive) return;
          this.state.config = config;
          return config.saaNotifyService ? this.loadStatus() : this.render();
        })
        .catch((e) => {
          if (!this.state.alive) return;
          clear(this.state.list);
          message(this.state.list, String(e), COLOR.danger);
        });
    },

    loadStatus() {
      const entityId = this.state.config.saaStatusEntity;
      if (!entityId) {
        this.state.entity = null;
        return this.render();
      }
      return this.request({ method: METHOD.GET_ENTITY, params: { entity_id: entityId } })
        .then((entity) => {
          this.state.entity = entity;
          this.state.statusError = null;
        })
        .catch((e) => {
          this.state.entity = null;
          this.state.statusError = String(e);
        })
        .then(() => this.state.alive && this.render());
    },

    render() {
      clear(this.state.list);
      this.draw();
    },

    act(action) {
      return this.request({
        method: METHOD.CALL_SERVICE,
        params: { domain: "notify", service: this.state.config.saaNotifyService, data: saaCommand(action) },
      })
        .then(() => {
          toast(getText("done"));
          return wait(REFRESH_MS);
        })
        .then(() => this.state.alive && this.loadStatus())
        .catch((e) => toast(String(e)));
    },

    // Stopping ends the recording, so it takes two taps like disarming an alarm.
    // The timer resets the prompt; onDestroy clears it, so it never fires on a dead page.
    onStop() {
      const s = this.state;
      if (!s.armed) {
        s.armed = true;
        s.timer = setTimeout(() => {
          s.armed = false;
          this.render();
        }, CONFIRM_MS);
        this.render();
        return;
      }
      clearTimeout(s.timer);
      s.armed = false;
      this.act(SAA_ACTIONS.STOP);
    },

    draw() {
      const list = this.state.list;
      title(list, getText("sleep_as_android"));
      if (!this.state.config.saaNotifyService) {
        message(list, getText("saa_not_configured"));
        return;
      }

      if (this.state.entity) {
        entityCard(list, { y: 80, entity: this.state.entity, onClick: undefined });
      } else if (this.state.statusError) {
        createTracked(list, hmUI.widget.TEXT, {
          x: MARGIN, y: 80, w: W - MARGIN * 2, h: 96,
          text: this.state.statusError, text_size: FONT.small, color: COLOR.danger,
          align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V, text_style: hmUI.text_style.WRAP,
        });
      }

      actionButton(list, {
        x: CX - 140, y: 188, w: 280, h: 72, color: SAA_COLOR,
        text: getText("start_tracking"), onClick: () => this.act(SAA_ACTIONS.START),
      });
      const armed = this.state.armed;
      actionButton(list, {
        x: CX - 140, y: 276, w: 280, h: 72, color: armed ? COLOR.danger : COLOR.card,
        text: getText(armed ? "tap_again_to_confirm" : "stop_tracking"), onClick: () => this.onStop(),
      });
    },
  })
);
