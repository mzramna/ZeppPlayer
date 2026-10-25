// Pure feature checks for the light and media pages (no @zos imports, so tests can run in Node).

// Home Assistant media_player SUPPORT_* bits.
export const MEDIA_FEATURE = {
  PAUSE: 1,
  VOLUME_SET: 4,
  PREVIOUS_TRACK: 16,
  NEXT_TRACK: 32,
  TURN_ON: 128,
  TURN_OFF: 256,
};

// HA 2022.5+ no longer reports brightness in supported_features; any mode but "onoff" implies it.
export const supportsBrightness = (colorModes) => (colorModes || []).some((m) => m !== "onoff");

export const supportsColorTemp = (colorModes, attrs = {}) =>
  (colorModes || []).some((m) => ["color_temp", "rgbww", "xy"].includes(m)) ||
  Boolean(attrs && (attrs.color_temp != null || attrs.color_temp_kelvin != null || attrs.min_color_temp_kelvin != null || attrs.min_mireds != null));

export const supportsColor = (colorModes, attrs = {}) =>
  (colorModes || []).some((m) => ["hs", "rgb", "rgbw", "rgbww", "xy"].includes(m)) ||
  Boolean(attrs && (attrs.hs_color != null || attrs.rgb_color != null));

export function lightModes(colorModes, attrs = {}) {
  if (colorModes && colorModes.length === 1 && colorModes[0] === "onoff") {
    return [];
  }
  const modes = [];
  if (supportsBrightness(colorModes)) modes.push("brightness");
  if (supportsColorTemp(colorModes, attrs)) modes.push("color_temp");
  if (supportsColor(colorModes, attrs)) modes.push("color");
  if (!modes.length && colorModes && colorModes.length > 0) {
    modes.push("brightness");
  }
  return modes;
}

