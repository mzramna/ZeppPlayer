import * as hmUI from "@zos/ui";
import { push } from "@zos/router";
import { getText } from "@zos/i18n";
import { BasePage } from "@zeppos/zml/base-page";
import { METHOD } from "../../shared/protocol.js";
import { FEATURES } from "../../config/build.js";
import { W, TOP, MARGIN, COLOR, FONT } from "../../utils/theme.js";
import { createTracked, clear, title, message, loading, entityCard, actionButton } from "../../utils/ui.js";
import { runTap } from "../../utils/nav.js";

const CATEGORY_H = 80;
const GAP = 12;

Page(
  BasePage({
    state: {
      widgets: [],
      alive: false,
      config: null,
      entities: [],
    },
    build() {
      this.state.alive = true;
      loading(this.state.widgets);
      this.load();
    },
    load() {
      // Favourites are fetched by id, so they need not be enabled entities; no ids, no entity request.
      return this.request({ method: METHOD.GET_CONFIG, params: {} })
        .then((config) => {
          const ids = config.favorites || [];
          const entities = ids.length ? this.request({ method: METHOD.GET_ENTITIES, params: { ids } }) : [];
          return Promise.all([config, entities]);
        })
        .then(([config, entities]) => {
          if (!this.state.alive) return;
          this.state.config = config;
          this.state.entities = entities || [];
          clear(this.state.widgets);
          this.render(config, this.state.entities);
        })
        .catch((e) => {
          if (!this.state.alive) return;
          clear(this.state.widgets);
          message(this.state.widgets, (e && e.message) || String(e), COLOR.danger);
        });
    },
    render(config, entities) {
      const list = this.state.widgets;
      title(list, "Home Assistant");
      let y = TOP + 12; // below the title

      const favorites = (config.favorites || [])
        .map((id) => entities.find((en) => en.entity_id === id))
        .filter(Boolean);
      if (favorites.length) {
        createTracked(list, hmUI.widget.TEXT, {
          x: MARGIN, y, w: W - MARGIN * 2, h: 36, text: getText("favorites"),
          text_size: FONT.small, color: COLOR.textDim, align_v: hmUI.align.CENTER_V,
        });
        y += 44;
        for (const entity of favorites) {
          y = entityCard(list, { y, entity, onClick: (en) => this.tap(en) });
        }
        y += 12;
      }

      const categories = [
        { text: getText("devices"), onClick: () => this.open("page/entities/index", { group: "devices" }) },
        { text: getText("energy") || "Energy", onClick: () => this.open("page/energy/index") },
        { text: getText("scripts"), onClick: () => this.open("page/entities/index", { group: "scripts" }) },
        { text: getText("sensors"), onClick: () => this.open("page/entities/index", { group: "sensors" }) },
        { text: getText("areas"), onClick: () => this.open("page/areas/index") },
      ];
      if (FEATURES.appService && config.sensorMode !== "none") {
        categories.push({ text: getText("sync"), onClick: () => this.open("page/sync/index") });
      }
      if (FEATURES.sleepAsAndroid && config.saaNotifyService) {
        categories.push({ text: getText("sleep_as_android"), onClick: () => this.open("page/sleep/index") });
      }
      for (const c of categories) {
        actionButton(list, { x: MARGIN, y, w: W - MARGIN * 2, h: CATEGORY_H, text: c.text, onClick: c.onClick });
        y += CATEGORY_H + GAP;
      }
    },
    open(url, params) {
      push({ url, params: params && JSON.stringify(params) });
    },
    tap(entity) {
      runTap(this, entity, (fresh) => {
        if (!this.state.alive) return;
        if (fresh && this.state.entities) {
          const idx = this.state.entities.findIndex((en) => en.entity_id === fresh.entity_id);
          if (idx !== -1) {
            this.state.entities[idx] = fresh;
          } else {
            this.state.entities.push(fresh);
          }
        }
        clear(this.state.widgets);
        this.render(this.state.config, this.state.entities);
      });
    },
    onDestroy() {
      this.state.alive = false;
      clear(this.state.widgets);
    },
  })
);
