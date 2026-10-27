import { BaseSideService } from "@zeppos/zml/base-side";
import { METHOD, SETTING } from "../shared/protocol.js";
import * as ha from "./ha.js";
import * as mobileApp from "./mobile-app.js";
import { syncSensors } from "./sensors.js";
import { cameraSnapshot } from "./camera.js";

// handler(params, service) -> result | Promise<result>; a throw becomes the error message.
/** @type {Record<string, (params: any, service?: any) => any>} */
const HANDLERS = {
  [METHOD.GET_ENTITIES]: ha.getEntities,
  [METHOD.GET_ENTITY]: ha.getEntity,
  [METHOD.CALL_SERVICE]: ha.callService,
  [METHOD.GET_AREAS]: ha.getAreas,
  [METHOD.GET_CONFIG]: ha.getConfig,
  [METHOD.CAMERA_SNAPSHOT]: cameraSnapshot,
  [METHOD.SYNC_SENSORS]: syncSensors,
  [METHOD.GET_ENERGY]: ha.getEnergy,
  [METHOD.SET_ENTITY_VISIBILITY]: ha.setEntityVisibility,
};

// Buttons on the settings page write these keys; the side service does the work.
const SETTING_ACTIONS = {
  [SETTING.REFRESH_ENTITIES]: ha.refreshEntityList,
  [SETTING.REGISTER_REQUEST]: mobileApp.register,
};

const setStatus = (ok, message) =>
  settings.settingsStorage.setItem(SETTING.STATUS, JSON.stringify({ ok, message, time: Date.now() }));

AppSideService(
  BaseSideService({
    onInit() {},

    onRequest(req, res) {
      const handler = Object.prototype.hasOwnProperty.call(HANDLERS, req.method) ? HANDLERS[req.method] : null;
      if (!handler) return res(`Unknown method ${req.method}`);
      Promise.resolve()
        .then(() => handler(req.params || {}, this))
        .then(
          (result) => res(null, result),
          (e) => res((e && e.message) || String(e))
        );
    },

    onSettingsChange({ key }) {
      const action = Object.prototype.hasOwnProperty.call(SETTING_ACTIONS, key) ? SETTING_ACTIONS[key] : null;
      if (!action) return;
      Promise.resolve()
        .then(() => action())
        .then(
          (message) => setStatus(true, message || "OK"),
          (e) => setStatus(false, (e && e.message) || String(e))
        );
    },

    onRun() {},
    onDestroy() {},
  })
);
