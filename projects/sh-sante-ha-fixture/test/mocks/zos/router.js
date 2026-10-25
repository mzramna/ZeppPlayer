import { state } from "../state.js";

export const push = ({ url, params }) => state.routes.push({ type: "push", url, params });
export const replace = ({ url, params }) => state.routes.push({ type: "replace", url, params });
export const back = () => state.routes.push({ type: "back" });
export const home = () => state.routes.push({ type: "home" });
export const exit = () => state.routes.push({ type: "exit" });
