import { getText } from "@zos/i18n";
import { push } from "@zos/router";
import * as hmUI from "@zos/ui";
import { onGesture, offGesture, GESTURE_LEFT, GESTURE_RIGHT } from "@zos/interaction";
import { CX, COLOR, DOMAINS, FONT, MARGIN, W, hsvToHex } from "../../utils/theme.js";
import { entityPage } from "../../utils/entity-page.js";
import { actionButton, createTracked, formatState, title, valueRing } from "../../utils/ui.js";
import { lightModes } from "../../utils/features.js";

const MODE_NAMES = {
  brightness: "Potência",
  color_temp: "Tonalidade",
  color: "Coloração",
};

// Named so the object is not an inline literal: entityPage's JSDoc type has no onResume key.
const options = {
  domain: "light",
  draw(entity, w) {
    const s = this.state;
    const attrs = entity.attributes || {};
    const effects = attrs.effect_list || [];
    const modes = lightModes(attrs.supported_color_modes, attrs);

    if (s.modeIndex === undefined || s.modeIndex >= modes.length) {
      s.modeIndex = 0;
    }

    if (!s.gestureRegistered) {
      s.gestureRegistered = true;
      s.gestureHandler = (event) => {
        if (!s.alive) return false;
        const currentModes = lightModes(this.state.entity?.attributes?.supported_color_modes, this.state.entity?.attributes);
        if (currentModes.length <= 1) return false;
        if (event === GESTURE_LEFT) {
          s.modeIndex = (s.modeIndex + 1) % currentModes.length;
          this.render();
          return true;
        }
        if (event === GESTURE_RIGHT) {
          if (s.modeIndex > 0) {
            s.modeIndex = s.modeIndex - 1;
            this.render();
            return true;
          }
          return false;
        }
        return false;
      };
      onGesture(s.gestureHandler);
    }

    title(w, entity.name);

    const powerX = effects.length ? CX - 170 : CX - 80;
    actionButton(w, {
      x: powerX, y: 88, w: 160, h: 60,
      text: formatState(entity),
      color: entity.state === "on" ? DOMAINS.light.color : COLOR.card,
      onClick: () => this.act("toggle"),
    });

    if (effects.length) {
      actionButton(w, {
        x: CX + 10, y: 88, w: 160, h: 60,
        text: attrs.effect || getText("effect"),
        onClick: () => push({ url: "page/light/effect", params: JSON.stringify({ entity_id: entity.entity_id }) }),
      });
    }

    if (modes.length) {
      const mode = modes[s.modeIndex];
      const translatedMode = getText(`mode_${mode}`);
      const modeName = translatedMode && translatedMode !== `mode_${mode}` ? translatedMode : MODE_NAMES[mode] || mode;
      const modeLabel = modes.length > 1 ? `${modeName} (${s.modeIndex + 1}/${modes.length})` : modeName;

      createTracked(w, hmUI.widget.TEXT, {
        x: MARGIN,
        y: 56,
        w: W - MARGIN * 2,
        h: 28,
        text: modeLabel,
        text_size: FONT.small,
        color: COLOR.textDim,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
      });

      const cycleMode = () => {
        if (modes.length > 1) {
          s.modeIndex = (s.modeIndex + 1) % modes.length;
          this.render();
        }
      };

      if (mode === "brightness") {
        const val = attrs.brightness_pct !== undefined
          ? attrs.brightness_pct
          : (attrs.brightness !== undefined ? Math.round((attrs.brightness / 255) * 100) : 0);

        valueRing(w, {
          y: 156,
          value: val,
          min: 0,
          max: 100,
          step: 10,
          unit: "%",
          color: DOMAINS.light.color,
          onChange: this.debounced("brightness", (v) => this.act("turn_on", { brightness_pct: v })),
          onCenterClick: () => this.act("toggle"),
          onOutsideClick: cycleMode,
        });
      } else if (mode === "color_temp") {
        const minK = attrs.min_color_temp_kelvin || (attrs.max_mireds ? Math.round(1000000 / attrs.max_mireds) : 2700);
        const maxK = attrs.max_color_temp_kelvin || (attrs.min_mireds ? Math.round(1000000 / attrs.min_mireds) : 6500);
        const val = attrs.color_temp_kelvin || (attrs.color_temp ? Math.round(1000000 / attrs.color_temp) : minK);

        valueRing(w, {
          y: 156,
          value: val,
          min: minK,
          max: maxK,
          step: 250,
          unit: "K",
          color: 0xffb14e,
          onChange: this.debounced("color_temp", (v) => this.act("turn_on", { color_temp_kelvin: v })),
          onCenterClick: () => this.act("toggle"),
          onOutsideClick: cycleMode,
        });
      } else if (mode === "color") {
        const currentHue = attrs.hs_color ? attrs.hs_color[0] : 0;
        const initialColor = hsvToHex(currentHue, 100, 100);

        let ring;
        ring = valueRing(w, {
          y: 156,
          value: currentHue,
          min: 0,
          max: 360,
          step: 30,
          unit: "°",
          color: initialColor,
          onChange: this.debounced("color", (v) => {
            const hex = hsvToHex(v, 100, 100);
            ring.set(v, hex);
            this.act("turn_on", { hs_color: [v, 100] });
          }),
          onCenterClick: () => this.act("toggle"),
          onOutsideClick: cycleMode,
        });
      }
    }
  },
  // Back from the effect picker: show the effect that was just set.
  onResume() {
    this.load();
  },
  onDestroy() {
    if (this.state.gestureHandler) {
      offGesture(this.state.gestureHandler);
      this.state.gestureHandler = null;
    }
  },
};

Page(entityPage(options));

