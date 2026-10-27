// scripts/i18n.js: merging the i18n-src files and writing gettext .po text.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeSources, toPo, languagesOf } from "../scripts/i18n.js";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../i18n-src");

test("mergeSources joins files with different keys", () => {
  const merged = mergeSources(
    [
      { file: "A.json", data: { hi: { "en-US": "Hi", "pt-BR": "Oi" } } },
      { file: "B.json", data: { bye: { "en-US": "Bye", "pt-BR": "Tchau" } } },
    ],
    () => assert.fail("no warning expected")
  );
  assert.deepEqual(merged, {
    hi: { "en-US": "Hi", "pt-BR": "Oi" },
    bye: { "en-US": "Bye", "pt-BR": "Tchau" },
  });
});

test("mergeSources keeps the first file on a duplicate key and warns when en-US differs", () => {
  const warnings = [];
  const merged = mergeSources(
    [
      { file: "A.json", data: { power: { "en-US": "On/Off", "pt-BR": "Ligar" } } },
      { file: "C.json", data: { power: { "en-US": "Power", "pt-BR": "Energia" } } },
    ],
    (msg) => warnings.push(msg)
  );
  assert.deepEqual(merged.power, { "en-US": "On/Off", "pt-BR": "Ligar" });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /power/);
  assert.match(warnings[0], /C\.json/);
});

test("mergeSources is silent for a duplicate with the same en-US text", () => {
  const warnings = [];
  const merged = mergeSources(
    [
      { file: "A.json", data: { ok: { "en-US": "OK", "pt-BR": "OK" } } },
      { file: "B.json", data: { ok: { "en-US": "OK", "pt-BR": "Certo" } } },
    ],
    (msg) => warnings.push(msg)
  );
  assert.deepEqual(merged.ok, { "en-US": "OK", "pt-BR": "OK" });
  assert.deepEqual(warnings, []);
});

test("toPo writes msgid/msgstr pairs with keys sorted", () => {
  const po = toPo(
    {
      zeta: { "en-US": "Z", "pt-BR": "Zz" },
      alpha: { "en-US": "A", "pt-BR": "Aa" },
    },
    "pt-BR"
  );
  assert.equal(po, 'msgid "alpha"\nmsgstr "Aa"\n\nmsgid "zeta"\nmsgstr "Zz"\n\n');
});

test("toPo escapes backslash, quote and newline", () => {
  const po = toPo({ 'a"b\\c': { "en-US": 'line one\nsay "hi" \\ done' } }, "en-US");
  assert.equal(po, 'msgid "a\\"b\\\\c"\nmsgstr "line one\\nsay \\"hi\\" \\\\ done"\n\n');
});

test("toPo falls back to en-US when a language has no text for the key", () => {
  const po = toPo({ go: { "en-US": "Go" } }, "es-ES");
  assert.equal(po, 'msgid "go"\nmsgstr "Go"\n\n');
});

test("toPo leaves out a key with no text at all, and writes nothing for no keys", () => {
  assert.equal(toPo({ ghost: { "pt-BR": "Fantasma" } }, "en-US"), "");
  assert.equal(toPo({}, "en-US"), "");
});

test("languagesOf always lists the three core languages and any other one translated", () => {
  assert.deepEqual(languagesOf({ a: { "en-US": "A" } }), ["en-US", "pt-BR", "es-ES"]);
  assert.deepEqual(languagesOf({ a: { "en-US": "A", "fr-FR": "A" } }), ["en-US", "pt-BR", "es-ES", "fr-FR"]);
});

test("the real i18n-src files merge without a conflicting duplicate key", () => {
  const sources = fs
    .readdirSync(SRC_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => ({ file, data: JSON.parse(fs.readFileSync(path.join(SRC_DIR, file), "utf8")) }));
  const warnings = [];
  mergeSources(sources, (msg) => warnings.push(msg));
  assert.deepEqual(warnings, []);
});
