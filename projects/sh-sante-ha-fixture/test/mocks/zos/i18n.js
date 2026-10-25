import { state } from "../state.js";

export const getText = (key) => (key in state.strings ? state.strings[key] : key);
