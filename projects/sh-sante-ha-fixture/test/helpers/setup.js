// Loaded with `node --import ./test/helpers/setup.js --test`: installs the
// module mocks and the global entry points of the Zepp OS runtimes.
import { register } from "node:module";

register("./loader.js", import.meta.url);

const registry = (globalThis.__zepp = { page: null, app: null, side: null, service: null, settingsPage: null });
globalThis.Page = (def) => (registry.page = def);
globalThis.App = (def) => (registry.app = def);
globalThis.AppSideService = (def) => (registry.side = def);
globalThis.AppService = (def) => (registry.service = def);
globalThis.AppSettingsPage = (def) => (registry.settingsPage = def);
globalThis.getApp = () => registry.app || { _options: { globalData: {} } };
