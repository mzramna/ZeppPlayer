import { state } from "../state.js";

export class LocalStorage {
  setItem(k, v) { state.storage.set(k, v); }
  getItem(k, d) { return state.storage.has(k) ? state.storage.get(k) : d; }
  removeItem(k) { state.storage.delete(k); }
  clear() { state.storage.clear(); }
}
export const localStorage = new LocalStorage();
export const sessionStorage = new LocalStorage();
