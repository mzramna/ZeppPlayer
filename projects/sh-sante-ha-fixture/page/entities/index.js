import { getText } from "@zos/i18n";
import { onGesture, offGesture, onDigitalCrown, offDigitalCrown, GESTURE_LEFT, GESTURE_RIGHT } from "@zos/interaction";
import { BasePage } from "@zeppos/zml/base-page";
import * as hmUI from "@zos/ui";
import { METHOD } from "../../shared/protocol.js";
import { TOP, COLOR, W, CX, MARGIN } from "../../utils/theme.js";
import { clear, title, message, loading, entityCard, actionButton, createTracked, toast } from "../../utils/ui.js";
import { filterGroup } from "../../utils/groups.js";
import { runTap } from "../../utils/nav.js";

const WATCH_PAGE_SIZE = 10;

// Params (JSON string): { group } | { area_id, name } | { ids, title }.
Page(
  BasePage({
    state: {
      query: null, // set in onInit from the route params
      entities: [],
      allAreas: null,
      widgets: [],
      page: 0,
      alive: false,
      gestureHandler: null,
      crownHandler: null,
    },
    onInit(params) {
      this.state.query = JSON.parse(params || "{}");
      this.state.page = 0;
    },
    build() {
      this.state.alive = true;
      loading(this.state.widgets);
      this.setupControls();
      this.load();
    },
    setupControls() {
      const s = this.state;
      s.gestureHandler = (event) => {
        if (!s.alive) return false;
        const total = s.entities.length;
        const totalPages = Math.max(1, Math.ceil(total / WATCH_PAGE_SIZE));
        if (event === GESTURE_LEFT) {
          if (s.page < totalPages - 1) {
            s.page++;
            this.render();
            return true;
          }
          if (s.allAreas && s.allAreas.length > 1) {
            const curIdx = s.allAreas.findIndex((a) => a.area_id === s.query.area_id);
            if (curIdx !== -1) {
              const nextArea = s.allAreas[(curIdx + 1) % s.allAreas.length];
              s.query.area_id = nextArea.area_id;
              s.query.name = nextArea.name;
              this.load();
              return true;
            }
          }
          return false;
        }
        if (event === GESTURE_RIGHT) {
          if (s.page > 0) {
            s.page--;
            this.render();
            return true;
          }
          if (s.allAreas && s.allAreas.length > 1) {
            const curIdx = s.allAreas.findIndex((a) => a.area_id === s.query.area_id);
            if (curIdx > 0) {
              const prevArea = s.allAreas[curIdx - 1];
              s.query.area_id = prevArea.area_id;
              s.query.name = prevArea.name;
              this.load();
              return true;
            }
          }
          return false;
        }
        return false;
      };
      onGesture(s.gestureHandler);

      s.crownHandler = (keyOrEvent, maybeDegree) => {
        if (!s.alive) return;
        const delta = typeof maybeDegree === "number" ? maybeDegree : ((keyOrEvent?.degree ?? Number(keyOrEvent)) || 0);
        if (!delta) return;
        const total = s.entities.length;
        const totalPages = Math.max(1, Math.ceil(total / WATCH_PAGE_SIZE));
        if (delta > 0 && s.page < totalPages - 1) {
          s.page++;
          this.render();
        } else if (delta < 0 && s.page > 0) {
          s.page--;
          this.render();
        }
      };
      onDigitalCrown(s.crownHandler);
    },
    load() {
      const q = this.state.query;
      const fetched = q.area_id ? this.fetchArea(q.area_id) : this.fetchEntities(q);
      return fetched
        .then((entities) => {
          if (!this.state.alive) return;
          this.state.entities = entities;
          this.state.page = 0;
          this.render();
        })
        .catch((e) => {
          if (!this.state.alive) return;
          clear(this.state.widgets);
          message(this.state.widgets, (e && e.message) || String(e), COLOR.danger);
        });
    },
    fetchArea(areaId) {
      return this.request({ method: METHOD.GET_AREAS, params: {} }).then((areas) => {
        this.state.allAreas = areas;
        const area = areas.find((a) => a.area_id === areaId);
        return this.fetchIds(area ? area.entity_ids : []);
      });
    },
    fetchEntities(q) {
      if (q.ids) return this.fetchIds(q.ids);
      return this.request({ method: METHOD.GET_ENTITIES, params: {} }).then((all) =>
        filterGroup(all, q.group)
      );
    },
    fetchIds(ids) {
      if (!ids.length) return Promise.resolve([]);
      return this.request({ method: METHOD.GET_ENTITIES, params: { ids } });
    },
    render() {
      clear(this.state.widgets);
      const list = this.state.widgets;
      title(list, this.heading());
      if (!this.state.entities.length) {
        message(list, getText("no_entities"));
        return;
      }
      const total = this.state.entities.length;
      const totalPages = Math.max(1, Math.ceil(total / WATCH_PAGE_SIZE));
      if (this.state.page >= totalPages) this.state.page = totalPages - 1;
      if (this.state.page < 0) this.state.page = 0;

      const start = this.state.page * WATCH_PAGE_SIZE;
      const visible = this.state.entities.slice(start, start + WATCH_PAGE_SIZE);

      let y = TOP + 12;
      for (const entity of visible) {
        y = entityCard(list, { y, entity, onClick: (en) => this.tap(en) });
        if (this.state.query.area_id) {
          const isHidden = entity.visible === false;
          actionButton(list, {
            x: W - MARGIN - 64,
            y: y - 96 - 12 + 24,
            w: 52,
            h: 48,
            text: isHidden ? "✕" : "👁",
            color: isHidden ? COLOR.off : COLOR.cardPressed,
            onClick: () => this.toggleVisibility(entity),
          });
        }
      }

      if (totalPages > 1) {
        const pageNum = this.state.page + 1;
        createTracked(list, hmUI.widget.TEXT, {
          x: 0,
          y,
          w: W,
          h: 36,
          text: `${pageNum}/${totalPages}`,
          color: COLOR.textDim,
          text_size: 20,
          align_h: hmUI.align.CENTER_H,
          align_v: hmUI.align.CENTER_V,
        });
        y += 44;

        const btnW = 120;
        const btnH = 50;
        actionButton(list, {
          x: CX - btnW - 10,
          y,
          w: btnW,
          h: btnH,
          text: getText("prev") || "Prev",
          color: this.state.page > 0 ? COLOR.card : COLOR.off,
          onClick: () => {
            if (this.state.page > 0) {
              this.state.page--;
              this.render();
            }
          },
        });
        actionButton(list, {
          x: CX + 10,
          y,
          w: btnW,
          h: btnH,
          text: getText("next") || "Next",
          color: this.state.page < totalPages - 1 ? COLOR.card : COLOR.off,
          onClick: () => {
            if (this.state.page < totalPages - 1) {
              this.state.page++;
              this.render();
            }
          },
        });
      }
    },
    toggleVisibility(entity) {
      const nextVisible = entity.visible === false;
      this.request({
        method: METHOD.SET_ENTITY_VISIBILITY,
        params: { entity_id: entity.entity_id, visible: nextVisible },
      })
        .then(() => {
          entity.visible = nextVisible;
          toast(getText("done"));
          this.render();
        })
        .catch((e) => {
          toast(String(e));
        });
    },
    tap(entity) {
      runTap(this, entity, (fresh) => {
        this.state.entities = this.state.entities.map((en) => (en.entity_id === fresh.entity_id ? fresh : en));
        this.render();
      });
    },
    heading() {
      const q = this.state.query;
      return q.group ? getText(q.group) : q.name || q.title || "";
    },
    onDestroy() {
      this.state.alive = false;
      if (this.state.gestureHandler) {
        offGesture(this.state.gestureHandler);
        this.state.gestureHandler = null;
      }
      if (this.state.crownHandler) {
        offDigitalCrown(this.state.crownHandler);
        this.state.crownHandler = null;
      }
      clear(this.state.widgets);
    },
  })
);

