// Globals of the phone side service and settings app (not in @zeppos/device-types).
declare const settings: {
  settingsStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    addListener(event: "change", cb: (e: { key: string; newValue: string; oldValue: string }) => void): void;
  };
};
declare function fetch(opts: { url: string; method?: string; headers?: Record<string, string>; body?: string; timeout?: number }): Promise<{ status: number; body: any; headers?: any }>;
declare function AppSideService(opts: any): void;
declare function AppSettingsPage(opts: any): void;
declare function AppService(opts: any): void;
// Settings app components (setting/index.js).
declare const View: any, Text: any, Button: any, Toggle: any, Section: any, TextInput: any, Select: any, Image: any, Link: any, Slider: any;
declare module "i18n" {
  export function gettext(key: string): string;
}
