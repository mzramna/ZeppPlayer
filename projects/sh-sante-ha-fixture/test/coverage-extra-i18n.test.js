// scripts/i18n.js main(): runs only when the file is the process entry point, so this test makes it
// the main module and stubs fs and console. Nothing is written to the repository.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeSources, toPo, languagesOf } from "../scripts/i18n.js";

const file = fileURLToPath(new URL("../scripts/i18n.js", import.meta.url));
const root = path.dirname(path.dirname(file));
const srcDir = path.join(root, "i18n-src");
const outDir = path.join(root, "page", "i18n");

const SOURCES = {
  "a.json": { hi: { "en-US": "Hi", "pt-BR": "Oi" } },
  "b.json": { bye: { "en-US": "Bye", "es-ES": "Adiós", "fr-FR": "Salut" }, hi: { "en-US": "Hello" } },
};

test("main reads i18n-src, keeps the first duplicate, writes one .po per language and warns about conflicts", () => {
  const source = fs.readFileSync(file, "utf8");
  const realFs = { readdirSync: fs.readdirSync, readFileSync: fs.readFileSync, writeFileSync: fs.writeFileSync, mkdirSync: fs.mkdirSync };
  const realLog = console.log;
  const realWarn = console.warn;
  const reads = [];
  const made = [];
  const written = {};
  const logs = [];
  const warns = [];
  fs.readdirSync = (dir) => {
    assert.equal(dir, srcDir);
    return ["b.json", "notes.txt", "a.json"];
  };
  fs.readFileSync = (p, enc) => {
    if (!p.startsWith(srcDir)) return realFs.readFileSync(p, enc);
    reads.push(path.basename(p));
    return JSON.stringify(SOURCES[path.basename(p)]);
  };
  fs.mkdirSync = (dir, opts) => made.push([dir, opts]);
  fs.writeFileSync = (p, text) => (written[path.basename(p)] = text);
  console.log = (msg) => logs.push(msg);
  console.warn = (msg) => warns.push(msg);

  // Compile the file as the entry module: require.main === module is then true and main() runs.
  const mod = new Module(file, null);
  mod.filename = file;
  const savedMain = process.mainModule;
  process.mainModule = mod;
  try {
    mod._compile(source, file);
  } finally {
    process.mainModule = savedMain;
    Object.assign(fs, realFs);
    console.log = realLog;
    console.warn = realWarn;
  }

  assert.deepEqual(reads, ["a.json", "b.json"], "only .json sources, in name order");
  assert.deepEqual(made, [[outDir, { recursive: true }]]);
  assert.deepEqual(Object.keys(written), ["en-US.po", "pt-BR.po", "es-ES.po", "fr-FR.po"]);
  assert.equal(written["pt-BR.po"], 'msgid "bye"\nmsgstr "Bye"\n\nmsgid "hi"\nmsgstr "Oi"\n\n');
  assert.equal(written["en-US.po"], 'msgid "bye"\nmsgstr "Bye"\n\nmsgid "hi"\nmsgstr "Hi"\n\n');
  assert.equal(written["fr-FR.po"], 'msgid "bye"\nmsgstr "Salut"\n\nmsgid "hi"\nmsgstr "Hi"\n\n');
  assert.deepEqual(logs, [
    "wrote page/i18n/en-US.po",
    "wrote page/i18n/pt-BR.po",
    "wrote page/i18n/es-ES.po",
    "wrote page/i18n/fr-FR.po",
  ]);
  assert.equal(warns.length, 1);
  assert.match(warns[0], /"hi" in b\.json \(Hello\)/);
});

test("the helpers the script exports keep their behaviour for the same inputs", () => {
  assert.deepEqual(mergeSources([{ file: "x.json", data: { k: { "en-US": "K" } } }], () => {}), { k: { "en-US": "K" } });
  assert.equal(toPo({ k: { "en-US": "K" } }, "pt-BR"), 'msgid "k"\nmsgstr "K"\n\n');
  assert.deepEqual(languagesOf({}), ["en-US", "pt-BR", "es-ES"]);
});
