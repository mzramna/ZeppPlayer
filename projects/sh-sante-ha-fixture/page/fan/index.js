import * as hmUI from "@zos/ui";
import { getText } from "@zos/i18n";
import { COLOR, DOMAINS, FONT, MARGIN, W } from "../../utils/theme.js";
import { entityPage } from "../../utils/entity-page.js";
import { actionButton, createTracked, formatState, title, valueRing } from "../../utils/ui.js";
import { rowX } from "../../utils/controls.js";

const { color } = DOMAINS.fan;

Page(
  entityPage({
    domain: "fan",
    draw(e, list) {
      const a = e.attributes || {};
      const isOn = e.state === "on";
      title(list, e.name);

      const buttons = [
        { text: getText("power"), color: isOn ? color : COLOR.card, onClick: () => this.act("toggle") },
      ];
      if (a.oscillating !== undefined) {
        buttons.push({
          text: getText("oscillate"), color: a.oscillating ? color : COLOR.card,
          onClick: () => this.act("oscillate", { oscillating: !a.oscillating }),
        });
      }
      const xs = rowX(buttons.length, 120, 8);
      buttons.forEach((b, i) => actionButton(list, { x: xs[i], y: 80, w: 120, h: 48, ...b }));

      const withRing = a.percentage != null;
      if (withRing) {
        const setSpeed = this.debounced("percentage", (percentage) => this.act("set_percentage", { percentage }));
        valueRing(list, {
          y: 132, value: a.percentage, min: 0, max: 100, step: a.percentage_step || 10, color, onChange: setSpeed,
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
