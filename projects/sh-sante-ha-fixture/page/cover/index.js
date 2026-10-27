import * as hmUI from "@zos/ui";
import { getText } from "@zos/i18n";
import { COLOR, DOMAINS, FONT, MARGIN, W } from "../../utils/theme.js";
import { entityPage } from "../../utils/entity-page.js";
import { actionButton, createTracked, formatState, title, valueRing } from "../../utils/ui.js";
import { COVER_FEATURE, rowX, supportsFeature } from "../../utils/controls.js";

const { color } = DOMAINS.cover;

Page(
  entityPage({
    domain: "cover",
    draw(e, list) {
      const a = e.attributes || {};
      const f = a.supported_features;
      title(list, e.name);

      const buttons = [
        [COVER_FEATURE.OPEN, getText("open"), "open_cover"],
        [COVER_FEATURE.STOP, getText("stop"), "stop_cover"],
        [COVER_FEATURE.CLOSE, getText("close"), "close_cover"],
      ].filter(([bit]) => supportsFeature(f, bit));
      const xs = rowX(buttons.length, 100, 8);
      buttons.forEach(([, text, service], i) =>
        actionButton(list, { x: xs[i], y: 80, w: 100, h: 48, text, onClick: () => this.act(service) })
      );

      const withRing = supportsFeature(f, COVER_FEATURE.SET_POSITION);
      if (withRing) {
        const setPos = this.debounced("position", (position) => this.act("set_cover_position", { position }));
        valueRing(list, {
          y: 132, value: a.current_position || 0, min: 0, max: 100, step: 10, color, onChange: setPos,
        });
      }
      createTracked(list, hmUI.widget.TEXT, {
        x: MARGIN, y: withRing ? 296 : 216, w: W - MARGIN * 2, h: 40,
        text: formatState(e), text_size: FONT.body, color: COLOR.textDim,
        align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
      });
    },
  })
);
