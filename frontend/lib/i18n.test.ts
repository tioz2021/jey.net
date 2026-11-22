import { describe, expect, it } from "vitest";

import {
  detectLocale,
  formatDate,
  formatNumber,
  plural,
  translate,
} from "./i18n";
import { en } from "./i18n/en";
import { ru } from "./i18n/ru";
import { uk } from "./i18n/uk";

describe("i18n dictionaries", () => {
  it("has the same keys in every locale", () => {
    expect(Object.keys(uk).sort()).toEqual(Object.keys(ru).sort());
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
  });

  it("has no empty translations", () => {
    for (const [locale, dictionary] of [["ru", ru], ["uk", uk], ["en", en]] as const) {
      for (const [key, value] of Object.entries(dictionary)) {
        expect(value.trim(), `${locale}:${key}`).not.toBe("");
      }
    }
  });

  it("keeps placeholders consistent across locales", () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const key of Object.keys(ru) as Array<keyof typeof ru>) {
      expect(placeholders(uk[key]), key).toEqual(placeholders(ru[key]));
      expect(placeholders(en[key]), key).toEqual(placeholders(ru[key]));
    }
  });
});

describe("i18n formats", () => {
  it("detects supported Accept-Language tags", () => {
    expect(detectLocale("uk-UA,en;q=0.8")).toBe("uk");
    expect(detectLocale("en-US")).toBe("en");
    expect(detectLocale("de-DE")).toBe("ru");
  });

  it("formats numbers per locale", () => {
    expect(formatNumber("en", 1234)).toBe("1,234");
    expect(formatNumber("ru", 1234)).not.toBe("1,234");
  });

  it("uses locale-specific plural forms", () => {
    const forms = { one: "one", few: "few", many: "many" };
    expect(plural("en", 1, forms)).toBe("one");
    expect(plural("ru", 2, forms)).toBe("few");
    expect(plural("ru", 5, forms)).toBe("many");
    expect(plural("uk", 3, forms)).toBe("few");
  });

  it("formats dates with the selected locale", () => {
    const value = "2026-11-22T12:00:00Z";
    expect(formatDate("en", value, { dateStyle: "long" })).toContain("November");
    expect(formatDate("ru", value, { dateStyle: "long" })).toContain("ноября");
  });

  it("substitutes placeholders and leaves unknown names intact", () => {
    expect(translate("en", "feed.new", { count: 3 })).toBe("New records: 3");
    expect(translate("en", "feed.new")).toBe("New records: {count}");
  });
});
