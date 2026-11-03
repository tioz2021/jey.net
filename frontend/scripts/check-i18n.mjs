#!/usr/bin/env node
// Checks that ru/uk/en dictionaries have the same keys and that every
// statically referenced t("...") key exists.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const I18N = join(ROOT, "lib/i18n");
const LOCALES = ["ru", "uk", "en"];

function keysOf(file) {
  const source = readFileSync(file, "utf8");
  const keys = new Set();

  for (const match of source.matchAll(/^\s*(['"])((?:[^\\]|\\.)*?)\1\s*:/gm)) {
    keys.add(match[2]);
  }

  return keys;
}

const dictionaries = {};
for (const locale of LOCALES) {
  dictionaries[locale] = keysOf(join(I18N, `${locale}.ts`));
}

const all = new Set([...LOCALES.flatMap((locale) => [...dictionaries[locale]])]);
let failed = false;

for (const locale of LOCALES) {
  const missing = [...all].filter((key) => !dictionaries[locale].has(key));
  if (missing.length > 0) {
    failed = true;
    console.error(`✖ ${locale}: missing ${missing.length} keys`);
    for (const key of missing.sort()) console.error(`   - ${key}`);
  }
}

// Every t("...") in the app must point at a real dictionary key.
const referenced = new Set();
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(path);
      continue;
    }
    if (!/\.(tsx?|jsx?)$/.test(entry)) continue;
    if (path.includes(`${join(ROOT, "lib/i18n")}`)) continue;

    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/\bt\(\s*(['"])([a-zA-Z0-9._-]+)\1/g)) {
      referenced.add(match[2]);
    }
  }
}
walk(join(ROOT, "app"));
walk(join(ROOT, "components"));

const unknown = [...referenced].filter((key) => !all.has(key));
if (unknown.length > 0) {
  failed = true;
  console.error(`✖ ${unknown.length} keys used in code but absent from dictionaries`);
  for (const key of unknown.sort()) console.error(`   - ${key}`);
}

if (failed) {
  process.exit(1);
}

console.log(
  `i18n OK: ${all.size} keys × ${LOCALES.length} locales, ${referenced.size} keys referenced`,
);
