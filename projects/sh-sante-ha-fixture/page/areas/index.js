import { push } from "@zos/router";
import { getText } from "@zos/i18n";
import { onGesture, offGesture, onDigitalCrown, offDigitalCrown, GESTURE_LEFT, GESTURE_RIGHT } from "@zos/interaction";
import { BasePage } from "@zeppos/zml/base-page";
import * as hmUI from "@zos/ui";
import { METHOD } from "../../shared/protocol.js";
import { TOP, COLOR, W, MARGIN, FONT } from "../../utils/theme.js";
import { clear, title, message, loading, entityCard, createTracked } from "../../utils/ui.js";

const AREAS_PAGE_SIZE = 5;

Page(
  BasePage({
    state: {
      widgets: [],
      areas: [],
      page: 0,
      alive: false,
      gestureHandler: null,
      crownHandler: null,
    },
    build() {
      this.state.alive = true;
      loading(this.state.widgets);
      this.setupControls();
      this.request({ method: METHOD.GET_AREAS, params: {} })
        .then((areas) => {
          if (!this.state.alive) return;
          this.state.areas = areas || [];
          this.state.page = 0;
          this.render(this.state.areas);
        })
        .catch((e) => {
          if (!this.state.alive) return;
          clear(this.state.widgets);
          message(this.state.widgets, (e && e.message) || String(e), COLOR.danger);
        });
    },
    setupControls() {
      const s = this.state;
      s.gestureHandler = (event) => {
        if (!s.alive) return false;
        const total = s.areas.length;
        const totalPages = Math.max(1, Math.ceil(total / AREAS_PAGE_SIZE));
        if (event === GESTURE_LEFT && s.page < totalPages - 1) {
          s.page++;
          this.render(s.areas);
          return true;
        }
        if (event === GESTURE_RIGHT && s.page > 0) {
          s.page--;
          this.render(s.areas);
          return true;
        }
        return false;
      };
      onGesture(s.gestureHandler);

      s.crownHandler = (keyOrEvent, maybeDegree) => {
        if (!s.alive) return;
        const delta = typeof maybeDegree === "number" ? maybeDegree : ((keyOrEvent?.degree ?? Number(keyOrEvent)) || 0);
        if (!delta) return;
        const total = s.areas.length;
        const totalPages = Math.max(1, Math.ceil(total / AREAS_PAGE_SIZE));
        if (delta > 0 && s.page < totalPages - 1) {
          s.page++;
          this.render(s.areas);
        } else if (delta < 0 && s.page > 0) {
          s.page--;
          this.render(s.areas);
        }
      };
      onDigitalCrown(s.crownHandler);
    },
    render(areas) {
      clear(this.state.widgets);
      const list = this.state.widgets;
      title(list, getText("areas"));
      if (!areas || !areas.length) {
        message(list, getText("no_areas"));
        return;
      }
      const total = areas.length;
      const totalPages = Math.max(1, Math.ceil(total / AREAS_PAGE_SIZE));
      if (this.state.page >= totalPages) this.state.page = totalPages - 1;
      if (this.state.page < 0) this.state.page = 0;

      const visible = areas.slice(this.state.page * AREAS_PAGE_SIZE, (this.state.page + 1) * AREAS_PAGE_SIZE);
      let y = TOP + 12;
      for (const area of visible) {
        // Fake entity: entityCard draws the row, the count is the subtitle.
        const entity = {
          entity_id: "sensor.area",
          name: area.name,
          state: `${area.entity_ids.length} ${getText("entities")}`,
        };
        y = entityCard(list, {
          y,
          entity,
          onClick: () => push({ url: "page/entities/index", params: JSON.stringify({ area_id: area.area_id, name: area.name }) }),
        });
      }

      if (totalPages > 1) {
        createTracked(list, hmUI.widget.TEXT, {
          x: MARGIN,
          y,
          w: W - MARGIN * 2,
          h: 32,
          text: `${this.state.page + 1}/${totalPages}`,
          color: COLOR.textDim,
          text_size: FONT.small,
          align_h: hmUI.align.CENTER_H,
          align_v: hmUI.align.CENTER_V,
        });
      }
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

