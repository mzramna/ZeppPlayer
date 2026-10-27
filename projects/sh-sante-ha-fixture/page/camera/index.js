import { BasePage } from "@zeppos/zml/base-page";
import * as hmUI from "@zos/ui";
import { getText } from "@zos/i18n";
import { rmSync } from "@zos/fs";
import { METHOD } from "../../shared/protocol.js";
import { FEATURES } from "../../config/build.js";
import { CX, TOP, COLOR } from "../../utils/theme.js";
import { clear, createTracked, title, message, actionButton } from "../../utils/ui.js";

// Image box (360x270 on screen) and the snapshot size requested from HA.
const SHOW = { x: CX - 180, y: TOP + 16, w: 360, h: 270 };
const REQUEST = { width: 400, height: 300 };
// Download, convert and transfer take a while; past this the wait is reported as an error.
const WAIT_MS = 20000;

Page(
  BasePage({
    state: { entityId: "", name: "", widgets: [], alive: false, shown: "", waitTimer: null },

    onInit(params) {
      const s = this.state;
      s.alive = true;
      s.entityId = JSON.parse(params || "{}").entity_id;
      s.name = s.entityId;
      // ZML's page onDestroy calls offFile(), which drops the app-wide inbox listeners. offFile() first
      // so the listeners are not added twice on the first visit, where the app already added them.
      const lib = /** @type {any} */ (getApp())._options.globalData.fileTransferLib;
      lib.offFile();
      lib.init();
      lib.onFile(this.onReceivedFile.bind(this));
    },

    build() {
      if (!FEATURES.camera) {
        message(this.state.widgets, getText("camera_disabled"));
        return;
      }
      // Title falls back to the entity id if the lookup fails.
      this.request({ method: METHOD.GET_ENTITY, params: { entity_id: this.state.entityId } })
        .then((entity) => {
          this.state.name = entity.name;
        })
        .catch(() => {})
        .then(() => this.refresh());
    },

    // On success the request only confirms the snapshot was queued; the image arrives in onReceivedFile.
    refresh() {
      if (!this.state.alive) return;
      this.showState(getText("loading"));
      this.startWait();
      this.request({ method: METHOD.CAMERA_SNAPSHOT, params: { entity_id: this.state.entityId, ...REQUEST } }).catch(
        (e) => {
          this.stopWait();
          this.showState(String(e));
        }
      );
    },

    startWait() {
      this.stopWait();
      this.state.waitTimer = setTimeout(() => {
        this.state.waitTimer = null;
        this.showState(getText("camera_no_file"));
      }, WAIT_MS);
    },

    stopWait() {
      clearTimeout(this.state.waitTimer);
      this.state.waitTimer = null;
    },

    showState(text) {
      if (!this.state.alive) return;
      clear(this.state.widgets);
      title(this.state.widgets, this.state.name);
      message(this.state.widgets, text, COLOR.textDim);
      this.refreshButton();
    },

    refreshButton() {
      actionButton(this.state.widgets, {
        x: CX - 80, y: 380, w: 160, h: 72, text: getText("camera_refresh"), onClick: () => this.refresh(),
      });
    },

    onReceivedFile(file) {
      if (!file.params || file.params.type !== "image") return;
      // filePath is only valid once the transfer has finished.
      file.on("change", (e) => {
        if (!this.state.alive || e.data.readyState !== "transferred") return;
        this.stopWait();
        clear(this.state.widgets);
        title(this.state.widgets, this.state.name);
        // Only the newest snapshot is kept: the one shown before is deleted once it is off the screen.
        if (this.state.shown) rmSync({ path: this.state.shown });
        this.state.shown = file.filePath;
        createTracked(this.state.widgets, hmUI.widget.IMG, { ...SHOW, src: file.filePath, auto_scale: true });
        this.refreshButton();
      });
    },

    onDestroy() {
      this.state.alive = false;
      this.stopWait();
      if (this.state.shown) rmSync({ path: this.state.shown });
    },
  })
);
