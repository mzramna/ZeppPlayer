// Shared watch widgets so every page has the same look. Inputs are design units
// (see utils/theme.js); px() scales them to the real screen.
import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { getText } from "@zos/i18n";
import { showToast, onDigitalCrown, offDigitalCrown } from "@zos/interaction";
import { FEATURES } from "../config/build.js";
import { W, CX, COLOR, FONT, RADIUS, MARGIN, TOP, domainMeta } from "./theme.js";

// Every create* call goes through here so pages can clear what they drew.
export function createTracked(list, type, opts) {
  const scaled = {};
  for (const k in opts) {
    scaled[k] = ["x", "y", "w", "h", "text_size", "radius", "line_width", "center_x", "center_y"].includes(k)
      ? px(opts[k])
      : opts[k];
  }
  const w = hmUI.createWidget(type, scaled);
  list.push(w);
  return w;
}

export function clear(list) {
  while (list.length) {
    const w = list.pop();
    try {
      hmUI.deleteWidget(w);
    } catch (e) {}
  }
}

export function title(list, text, y = TOP - 40) {
  return createTracked(list, hmUI.widget.TEXT, {
    x: MARGIN, y, w: W - MARGIN * 2, h: 44,
    text, text_size: FONT.title, color: COLOR.text,
    align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
  });
}

// Full screen centered text: loading, empty and error states.
export function message(list, text, color = COLOR.textDim) {
  return createTracked(list, hmUI.widget.TEXT, {
    x: MARGIN, y: 0, w: W - MARGIN * 2, h: W,
    text, text_size: FONT.body, color,
    align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
    text_style: hmUI.text_style.WRAP,
  });
}

export const loading = (list) => message(list, getText("loading"));

// One entity row: icon, name, state. Returns the y below the card.
export function entityCard(list, { y, entity, onClick, h = 96 }) {
  const meta = domainMeta(entity.entity_id);
  const isOn = ["on", "open", "unlocked", "playing", "heat", "cool", "auto", "cleaning"].includes(entity.state);
  const bg = createTracked(list, hmUI.widget.FILL_RECT, {
    x: MARGIN, y, w: W - MARGIN * 2, h, radius: RADIUS, color: COLOR.card,
  });
  const badge = createTracked(list, hmUI.widget.FILL_RECT, {
    x: MARGIN + 20, y: y + h / 2 - 28, w: 56, h: 56, radius: 28, color: isOn ? meta.color : COLOR.off,
  });
  const icon = createTracked(list, hmUI.widget.IMG, { x: MARGIN + 32, y: y + h / 2 - 16, src: `icons/${meta.icon}` });
  const name = createTracked(list, hmUI.widget.TEXT, {
    x: MARGIN + 92, y: y + 12, w: W - MARGIN * 2 - 112, h: 40,
    text: entity.name, text_size: FONT.body, color: COLOR.text,
    align_v: hmUI.align.CENTER_V, text_style: hmUI.text_style.ELLIPSIS,
  });
  const state = createTracked(list, hmUI.widget.TEXT, {
    x: MARGIN + 92, y: y + 52, w: W - MARGIN * 2 - 112, h: 32,
    text: formatState(entity), text_size: FONT.small, color: isOn ? meta.color : COLOR.textDim,
    align_v: hmUI.align.CENTER_V, text_style: hmUI.text_style.ELLIPSIS,
  });
  for (const child of [badge, icon, name, state]) {
    if (typeof child.setEnable === "function") child.setEnable(false);
  }
  if (onClick) {
    bg.addEventListener(hmUI.event.CLICK_UP, () => {
      try {
        onClick(entity);
      } catch (e) {}
    });
  }
  return y + h + 12;
}

export function formatState(entity) {
  const key = `state_${entity.state}`;
  const translated = getText(key);
  const state = translated && translated !== key ? translated : entity.state;
  return entity.unit ? `${state} ${entity.unit}` : state;
}

// Big round button with a text label, used for actions (toggle, open, lock...).
export function actionButton(list, { x, y, w = 160, h = 72, text, color = COLOR.card, onClick }) {
  return createTracked(list, hmUI.widget.BUTTON, {
    x, y, w, h, radius: h / 2, text, text_size: FONT.body, color: COLOR.text,
    normal_color: color, press_color: COLOR.cardPressed, click_func: onClick,
  });
}

// Rounds target jump to multiple of step in the given direction (+1 or -1).
export function roundStep(current, step, direction, min = 0, max = 100) {
  let target;
  const eps = step * 1e-6;
  if (direction > 0) {
    target = Math.floor((current + eps) / step) * step + step;
  } else if (direction < 0) {
    target = Math.ceil((current - eps) / step) * step - step;
  } else {
    target = Math.round(current / step) * step;
  }
  const decimals = (String(step).split(".")[1] || "").length;
  target = Number(target.toFixed(decimals));
  return Math.min(max, Math.max(min, target));
}

// Ring showing value in [min, max] with - / + buttons under it. Returns { set(v, color) }.
// Used for brightness, temperature, position, speed and volume.
export function valueRing(list, { y, value, min = 0, max = 100, step = 10, unit = "%", color = COLOR.accent, onChange, onCenterClick, onOutsideClick }) {
  const size = 240;
  const x = CX - size / 2;
  let currentColor = color;
  const bg = createTracked(list, hmUI.widget.ARC, {
    x, y, w: size, h: size, start_angle: -225, end_angle: 45, color: COLOR.off, line_width: 20,
  });
  const fg = createTracked(list, hmUI.widget.ARC, {
    x, y, w: size, h: size, start_angle: -225, end_angle: -225, color: currentColor, line_width: 20,
  });
  const label = createTracked(list, hmUI.widget.TEXT, {
    x, y: y + size / 2 - 40, w: size, h: 80, text: "", text_size: FONT.big, color: COLOR.text,
    align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
  });
  let current = value;
  const set = (v, newColor) => {
    if (newColor !== undefined) currentColor = newColor;
    current = Math.min(max, Math.max(min, v));
    const angle = -225 + ((current - min) / (max - min || 1)) * 270;
    fg.setProperty(hmUI.prop.MORE, {
      x: px(x),
      y: px(y),
      w: px(size),
      h: px(size),
      start_angle: -225,
      end_angle: angle,
      color: currentColor,
      line_width: px(20),
    });
    label.setProperty(hmUI.prop.TEXT, `${Math.round(current * 10) / 10}${unit}`);
  };
  set(value, currentColor);

  const change = (direction) => {
    const before = current;
    const next = roundStep(current, step, direction, min, max);
    set(next);
    if (current !== before) onChange && onChange(current);
  };

  actionButton(list, { x: CX - 150, y: y + size + 8, w: 120, text: "−", onClick: () => change(-1) });
  actionButton(list, { x: CX + 30, y: y + size + 8, w: 120, text: "+", onClick: () => change(1) });

  if (onOutsideClick) {
    const outside = createTracked(list, hmUI.widget.FILL_RECT, {
      x: 0, y: 0, w: W, h: 480, color: 0x000000,
    });
    outside.addEventListener(hmUI.event.CLICK_UP, () => {
      onOutsideClick();
    });
  }

  if (onCenterClick) {
    label.addEventListener(hmUI.event.CLICK_UP, () => {
      onCenterClick();
    });
  }

  // Digital Crown support
  const crownHandler = (keyOrEvent, maybeDegree) => {
    const delta = typeof maybeDegree === "number" ? maybeDegree : ((keyOrEvent?.degree ?? Number(keyOrEvent)) || 0);
    if (!delta) return;
    const direction = delta > 0 ? 1 : -1;
    const before = current;
    const next = roundStep(current, step, direction, min, max);
    set(next);
    if (current !== before) onChange && onChange(current);
  };
  onDigitalCrown(crownHandler);

  // Touch drag support (CLICK_DOWN, MOVE, CLICK_UP)
  let startY = null;
  let startX = null;
  let startVal = current;

  const onTouchDown = (e) => {
    startY = e?.y ?? 0;
    startX = e?.x ?? 0;
    startVal = current;
  };

  const onTouchMove = (e) => {
    if (startY === null) {
      startY = e?.y ?? 0;
      startX = e?.x ?? 0;
      startVal = current;
      return;
    }
    const curY = e?.y ?? startY;
    const curX = e?.x ?? startX;
    const dy = startY - curY;
    const dx = curX - startX;
    const deltaDist = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
    const range = max - min || 1;
    const deltaVal = (deltaDist / px(150)) * range;
    const before = current;
    set(startVal + deltaVal);
    if (current !== before) onChange && onChange(current);
  };

  const onTouchUp = (e) => {
    if (onCenterClick && startY !== null && e && e.x !== undefined && e.y !== undefined) {
      const dist = Math.hypot(e.x - startX, e.y - startY);
      if (dist < 10) onCenterClick();
    }
    startY = null;
    startX = null;
  };

  for (const w of [bg, label]) {
    w.addEventListener(hmUI.event.CLICK_DOWN, onTouchDown);
    w.addEventListener(hmUI.event.MOVE, onTouchMove);
    w.addEventListener(hmUI.event.CLICK_UP, onTouchUp);
  }

  return {
    set,
    get: () => current,
    bottom: y + size + 88,
    destroy: () => offDigitalCrown(crownHandler),
  };
}

export function toast(text) {
  if (FEATURES.toast) showToast({ content: text });
}
