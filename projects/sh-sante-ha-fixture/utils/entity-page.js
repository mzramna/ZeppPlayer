// Shared lifecycle for pages that show and control one entity:
//   Page(entityPage({ domain: "fan", draw(entity, list) { ... } }))
// It loads the entity named by params {entity_id}, redraws on every reply, and
// stops drawing, reloading and sending once the page is destroyed. ZML gives
// pages request()/call(), so page methods must not be named `call`.
import { BasePage } from "@zeppos/zml/base-page";
import { getText } from "@zos/i18n";
import { METHOD } from "../shared/protocol.js";
import { COLOR } from "./theme.js";
import { clear, loading, message, toast } from "./ui.js";

export const RELOAD_AFTER_ACTION_MS = 1000;
export const DEBOUNCE_MS = 600;
export const CONFIRM_MS = 3000;

/**
 * @param {{ domain: string, draw: (this: any, entity: any, list: any[]) => void, pollMs?: number, [key: string]: any }} options
 *   draw: called with `this` = the page; use this.act / this.debounced / this.confirm.
 *   pollMs: reload period while the page is open (e.g. media position/state).
 */
export function entityPage({ domain, draw, pollMs = 0, ...rest }) {
  return BasePage({
    ...rest,
    state: /** @type {Record<string, any>} */ ({}),

    onInit(params) {
      const s = this.state;
      s.entity_id = JSON.parse(params || "{}").entity_id;
      s.list = [];
      s.alive = true;
      s.timers = new Set();
      s.pending = new Map(); // key -> run(): debounced controls still waiting to send
      s.debounce = {};
      s.armed = {}; // confirm key -> timer id
      loading(s.list);
      this.load();
      if (pollMs) this.every(pollMs, () => this.load());
    },

    onDestroy() {
      const s = this.state;
      // Send the changes still waiting for their debounce while the page is alive: the reply then skips the UI.
      for (const run of [...s.pending.values()]) run();
      s.alive = false;
      s.timers.forEach((t) => {
        clearTimeout(t);
        clearInterval(t);
      });
      s.timers.clear();
      if (typeof rest.onDestroy === "function") rest.onDestroy.call(this);
    },

    // setTimeout that is dropped when the page is destroyed.
    later(ms, fn) {
      const s = this.state;
      if (!s.alive) return null;
      const t = setTimeout(() => {
        s.timers.delete(t);
        if (s.alive) fn();
      }, ms);
      s.timers.add(t);
      return t;
    },

    every(ms, fn) {
      const t = setInterval(() => this.state.alive && fn(), ms);
      this.state.timers.add(t);
    },

    load() {
      const s = this.state;
      if (!s.alive) return Promise.resolve();
      return this.request({ method: METHOD.GET_ENTITY, params: { entity_id: s.entity_id } }).then(
        (entity) => {
          if (!s.alive) return;
          s.entity = entity;
          // Do not move a ring under the user's finger while a change waits to be sent.
          if (!s.pending.size) this.render();
        },
        (e) => {
          if (!s.alive) return;
          clear(s.list);
          message(s.list, String(e), COLOR.danger);
        }
      );
    },

    render() {
      const s = this.state;
      if (!s.alive || !s.entity) return;
      clear(s.list);
      draw.call(this, s.entity, s.list);
    },

    // Runs a service on this entity, then reloads it. Resolves true when HA accepted it.
    act(service, data = {}, svcDomain = domain) {
      const s = this.state;
      if (!s.alive) return Promise.resolve(false);
      return this.request({
        method: METHOD.CALL_SERVICE,
        params: { domain: svcDomain, service, entity_id: s.entity_id, data },
      }).then(
        () => {
          if (!s.alive) return false;
          toast(getText("done"));
          this.later(RELOAD_AFTER_ACTION_MS, () => this.load());
          return true;
        },
        (e) => {
          if (s.alive) toast(String(e));
          return false;
        }
      );
    },

    // Returns fn(value) that runs send(value) once, ms after the last call.
    debounced(key, send, ms = DEBOUNCE_MS) {
      return (value) => {
        const s = this.state;
        if (!s.alive) return;
        clearTimeout(s.debounce[key]);
        s.timers.delete(s.debounce[key]);
        const run = () => {
          s.pending.delete(key);
          send(value);
        };
        s.pending.set(key, run);
        s.debounce[key] = this.later(ms, run);
      };
    },

    // Two taps within CONFIRM_MS: the first arms (draw shows isArmed(key)), the second returns true.
    confirm(key) {
      const s = this.state;
      if (s.armed[key]) {
        clearTimeout(s.armed[key]);
        s.timers.delete(s.armed[key]);
        delete s.armed[key];
        this.render();
        return true;
      }
      s.armed[key] = this.later(CONFIRM_MS, () => {
        delete s.armed[key];
        this.render();
      });
      this.render();
      return false;
    },

    isArmed(key) {
      return Boolean(this.state.armed[key]);
    },
  });
}
