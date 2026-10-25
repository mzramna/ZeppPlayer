import * as hmUI from "@zos/ui";
import { getText } from "@zos/i18n";
import { COLOR, FONT, MARGIN, W } from "../../utils/theme.js";
import { actionButton, createTracked, formatState, title } from "../../utils/ui.js";
import { entityPage } from "../../utils/entity-page.js";
import { VACUUM_FEATURE, rowX, supportsFeature } from "../../utils/controls.js";

Page(
  entityPage({
    domain: "vacuum",
    draw(e, list) {
      const a = e.attributes || {};
      // Old integrations send no supported_features: show every command.
      const can = (bit) => a.supported_features == null || supportsFeature(a.supported_features, bit);
      title(list, e.name);

      createTracked(list, hmUI.widget.TEXT, {
        x: MARGIN, y: 80, w: W - MARGIN * 2, h: 40,
        text: formatState(e), text_size: FONT.body, color: COLOR.text,
        align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
      });
      if (a.battery_level != null) {
        createTracked(list, hmUI.widget.TEXT, {
          x: MARGIN, y: 120, w: W - MARGIN * 2, h: 32,
          text: `${getText("battery")} ${a.battery_level}%`, text_size: FONT.small, color: COLOR.textDim,
          align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
        });
      }

      const buttons = [
        { text: getText("start"), service: "start", bit: VACUUM_FEATURE.START },
        { text: getText("pause"), service: "pause", bit: VACUUM_FEATURE.PAUSE },
        { text: getText("dock"), service: "return_to_base", bit: VACUUM_FEATURE.RETURN_HOME },
        { text: getText("locate"), service: "locate", bit: VACUUM_FEATURE.LOCATE },
      ].filter((b) => can(b.bit));
      const xs = rowX(2, 160, 16);
      buttons.forEach((b, i) =>
        actionButton(list, {
          x: xs[i % 2], y: 168 + Math.floor(i / 2) * 88, w: 160, h: 72, text: b.text,
          onClick: () => this.act(b.service),
        })
      );
    },
  })
);
