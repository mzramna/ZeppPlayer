import * as hmUI from "@zos/ui";
import { getText } from "@zos/i18n";
import { CX, COLOR, FONT, MARGIN, W } from "../../utils/theme.js";
import { entityPage } from "../../utils/entity-page.js";
import { actionButton, createTracked, title, valueRing } from "../../utils/ui.js";
import { MEDIA_FEATURE } from "../../utils/features.js";
import { supportsFeature } from "../../utils/controls.js";

const BTN_W = 100;
const BTN_GAP = 8;

Page(
  entityPage({
    domain: "media_player",
    pollMs: 10000,
    draw(entity, w) {
      const a = entity.attributes;
      const f = a.supported_features;
      title(w, entity.name);

      createTracked(w, hmUI.widget.TEXT, {
        x: MARGIN, y: 80, w: W - MARGIN * 2, h: 36, text: a.media_title || "", text_size: FONT.body,
        color: COLOR.text, align_h: hmUI.align.CENTER_H, text_style: hmUI.text_style.ELLIPSIS,
      });
      createTracked(w, hmUI.widget.TEXT, {
        x: MARGIN, y: 116, w: W - MARGIN * 2, h: 30, text: a.media_artist || "", text_size: FONT.small,
        color: COLOR.textDim, align_h: hmUI.align.CENTER_H, text_style: hmUI.text_style.ELLIPSIS,
      });

      const buttons = [];
      if (supportsFeature(f, MEDIA_FEATURE.PREVIOUS_TRACK)) {
        buttons.push({ text: getText("prev"), onClick: () => this.act("media_previous_track") });
      }
      if (supportsFeature(f, MEDIA_FEATURE.PAUSE)) {
        buttons.push({
          text: getText(entity.state === "playing" ? "pause" : "play"),
          onClick: () => this.act("media_play_pause"),
        });
      }
      if (supportsFeature(f, MEDIA_FEATURE.NEXT_TRACK)) {
        buttons.push({ text: getText("next"), onClick: () => this.act("media_next_track") });
      }
      if (supportsFeature(f, MEDIA_FEATURE.TURN_ON) && supportsFeature(f, MEDIA_FEATURE.TURN_OFF)) {
        buttons.push({ text: getText("power"), onClick: () => this.act("toggle") });
      }
      const x0 = CX - (buttons.length * BTN_W + (buttons.length - 1) * BTN_GAP) / 2;
      buttons.forEach((b, i) => actionButton(w, { x: x0 + i * (BTN_W + BTN_GAP), y: 156, w: BTN_W, h: 56, text: b.text, onClick: b.onClick }));

      if (supportsFeature(f, MEDIA_FEATURE.VOLUME_SET) && typeof a.volume_level === "number") {
        valueRing(w, {
          y: 224,
          value: Math.round(a.volume_level * 100),
          onChange: this.debounced("volume", (v) => this.act("volume_set", { volume_level: v / 100 })),
        });
      }
    },
  })
);
