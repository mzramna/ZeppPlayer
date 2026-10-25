import { state } from "../state.js";

const names = (list) => Object.fromEntries(list.map((n) => [n, n]));
export const widget = names([
  "TEXT", "BUTTON", "FILL_RECT", "STROKE_RECT", "IMG", "ARC", "IMG_ANIM", "SLIDE_SWITCH",
  "SCROLL_LIST", "VIEW_CONTAINER", "GROUP", "CIRCLE", "TEXT_INPUT", "IMG_PROGRESS",
]);
export const align = names(["LEFT", "RIGHT", "CENTER_H", "TOP", "BOTTOM", "CENTER_V"]);
export const prop = names(["MORE", "TEXT", "X", "Y", "W", "H", "SRC", "VISIBLE", "UPDATE_DATA", "CHECKED"]);
export const event = names(["CLICK_UP", "CLICK_DOWN", "MOVE", "SELECT"]);
export const text_style = names(["WRAP", "CHAR_WRAP", "ELLIPSIS", "NONE"]);
export const anim_status = { START: 1, STOP: 2, PAUSE: 3, RESUME: 4 };

export function createWidget(type, props = {}) {
  if (!widget[type]) throw new Error(`unknown widget type ${type}`);
  const w = {
    type,
    props: { ...props },
    listeners: {},
    setProperty(p, value) {
      if (p === prop.MORE) Object.assign(this.props, value);
      else if (p === prop.TEXT) this.props.text = value;
      else this.props[p] = value;
    },
    getProperty(p) {
      return p === prop.TEXT ? this.props.text : this.props[p];
    },
    addEventListener(ev, cb) {
      (this.listeners[ev] = this.listeners[ev] || []).push(cb);
    },
    removeEventListener(ev) {
      delete this.listeners[ev];
    },
    setEnable() {},
  };
  state.widgets.push(w);
  return w;
}

export function deleteWidget(w) {
  const i = state.widgets.indexOf(w);
  if (i === -1) throw new Error("deleteWidget on a widget that is not alive");
  state.widgets.splice(i, 1);
  state.deleted.push(w);
}

export const setStatusBarVisible = () => {};
export const redraw = () => {};
export const setLayerScrolling = () => true;

export default { widget, align, prop, event, text_style, anim_status, createWidget, deleteWidget, setStatusBarVisible, redraw, setLayerScrolling };
