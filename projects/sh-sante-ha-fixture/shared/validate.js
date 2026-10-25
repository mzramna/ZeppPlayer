// Input checks used by the phone side service and the settings page. Entity and service names end up
// in URLs and in the Jinja template, so only Home Assistant's own format passes.
export const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
export const NAME = /^[a-z0-9_]+$/;

// Parsed JSON, or the fallback when the text is missing, corrupt, or null.
export function parseJson(text, fallback) {
  try {
    const value = JSON.parse(text);
    return value === null || value === undefined ? fallback : value;
  } catch (e) {
    return fallback;
  }
}

// A stored JSON array; anything else reads as an empty list.
export function readList(text) {
  const value = parseJson(text, []);
  return Array.isArray(value) ? value : [];
}
