import * as hmUI from "@zos/ui";
import { getText } from "@zos/i18n";
import { COLOR, DOMAINS, FONT, MARGIN, W } from "../../utils/theme.js";
import { entityPage } from "../../utils/entity-page.js";
import { actionButton, createTracked, title, valueRing } from "../../utils/ui.js";
import { pickHvacModes, rowX } from "../../utils/controls.js";

const { color } = DOMAINS.climate;

Page(
  entityPage({
    domain: "climate",
    draw(e, list) {
      const a = e.attributes || {};
      title(list, e.name);

      const modes = pickHvacModes(a.hvac_modes, e.state);
      const xs = rowX(modes.length, 72, 8);
      modes.forEach((mode, i) =>
        actionButton(list, {
          x: xs[i], y: 80, w: 72, h: 48, text: getText(`state_${mode}`),
          color: mode === e.state ? color : COLOR.card,
          onClick: () => this.act("set_hvac_mode", { hvac_mode: mode }),
        })
      );

      if (a.temperature != null) {
        // Dragging the ring sends one change, after the value settles.
        const setTemp = this.debounced("temperature", (temperature) => this.act("set_temperature", { temperature }));
        valueRing(list, {
          y: 132, value: a.temperature, min: a.min_temp || 7, max: a.max_temp || 35,
          step: a.target_temp_step || 0.5, unit: "°", color, onChange: setTemp,
        });
      }
      if (a.current_temperature != null) {
        createTracked(list, hmUI.widget.TEXT, {
          x: MARGIN, y: 296, w: W - MARGIN * 2, h: 32,
          text: `${getText("current")} ${a.current_temperature}°`, text_size: FONT.small, color: COLOR.textDim,
          align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
        });
      }
    },
  })
);
