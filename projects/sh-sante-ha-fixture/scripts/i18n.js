// Turns i18n-src/*.json ({ key: { "en-US", "pt-BR", "es-ES" } }) into the watch's gettext
// files page/i18n/<lang>.po. Run: npm run i18n
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "i18n-src");
const OUT_DIR = path.join(ROOT, "page", "i18n");
const SOURCE_LANG = "en-US";
// Always written; any other language is written only when some source translates it.
const REQUIRED_LANGS = ["en-US", "pt-BR", "es-ES"];

// Same key in two files: the first file (by name) wins. A different en-US text is reported.
function mergeSources(sources, warn = console.warn) {
  const merged = {};
  for (const { file, data } of sources) {
    for (const [key, texts] of Object.entries(data)) {
      const prev = merged[key];
      if (!prev) {
        merged[key] = texts;
      } else if (prev[SOURCE_LANG] !== texts[SOURCE_LANG]) {
        warn(`i18n: "${key}" in ${file} (${texts[SOURCE_LANG]}) conflicts with an earlier file (${prev[SOURCE_LANG]}); keeping the earlier one`);
      }
    }
  }
  return merged;
}

const escape = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

// Keys sorted; a missing translation falls back to the en-US text, a key with none is left out.
function toPo(entries, lang) {
  let po = "";
  for (const key of Object.keys(entries).sort()) {
    const texts = entries[key];
    const text = texts[lang] || texts[SOURCE_LANG];
    if (!text) continue;
    po += `msgid "${escape(key)}"\nmsgstr "${escape(text)}"\n\n`;
  }
  return po;
}

function languagesOf(entries) {
  const langs = new Set(REQUIRED_LANGS);
  for (const texts of Object.values(entries)) Object.keys(texts).forEach((lang) => langs.add(lang));
  return [...langs];
}

function main() {
  const sources = fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => ({ file, data: JSON.parse(fs.readFileSync(path.join(SRC_DIR, file), "utf8")) }));
  const entries = mergeSources(sources);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const lang of languagesOf(entries)) {
    fs.writeFileSync(path.join(OUT_DIR, `${lang}.po`), toPo(entries, lang));
    console.log(`wrote page/i18n/${lang}.po`);
  }
}

if (require.main === module) main();

module.exports = { mergeSources, toPo, languagesOf };
