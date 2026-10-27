import { state } from "../state.js";

export const showToast = ({ content }) => state.toasts.push(content);
export const GESTURE_UP = 1, GESTURE_DOWN = 2, GESTURE_LEFT = 3, GESTURE_RIGHT = 4;

let crownHandlers = [];
let gestureHandlers = [];

export const onDigitalCrown = (optOrCb) => {
  const cb = typeof optOrCb === "function" ? optOrCb : optOrCb?.callback;
  if (cb) crownHandlers.push(cb);
};

export const offDigitalCrown = (optOrCb) => {
  const cb = typeof optOrCb === "function" ? optOrCb : optOrCb?.callback;
  if (cb) {
    crownHandlers = crownHandlers.filter((h) => h !== cb);
  } else {
    crownHandlers = [];
  }
};

export const emitDigitalCrown = (arg1, arg2) => {
  let degree = 0;
  let key = 1;
  if (typeof arg1 === "object" && arg1 !== null) {
    degree = arg1.degree ?? 0;
    key = arg1.key ?? 1;
  } else if (arg2 !== undefined) {
    key = arg1;
    degree = arg2;
  } else if (typeof arg1 === "number") {
    degree = arg1;
  }
  for (const cb of [...crownHandlers]) {
    const keyObj = Object.assign(new Number(key), { key, degree });
    cb(keyObj, degree);
  }
};

export const onGesture = (optOrCb) => {
  const cb = typeof optOrCb === "function" ? optOrCb : optOrCb?.callback;
  if (cb) gestureHandlers.push(cb);
};

export const offGesture = (optOrCb) => {
  const cb = typeof optOrCb === "function" ? optOrCb : optOrCb?.callback;
  if (cb) {
    gestureHandlers = gestureHandlers.filter((h) => h !== cb);
  } else {
    gestureHandlers = [];
  }
};

export const emitGesture = (event) => {
  let handled = false;
  for (const cb of [...gestureHandlers]) {
    if (cb(event) === true) handled = true;
  }
  return handled;
};

export const resetInteraction = () => {
  crownHandlers = [];
  gestureHandlers = [];
};

export const createModal = (opts) => ({ opts, show() {} });
export const onKey = () => {};
export const offKey = () => {};

