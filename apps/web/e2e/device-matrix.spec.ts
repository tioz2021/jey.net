import { expect, test } from "@playwright/test";

import { createItem, register, unique, useSession } from "./helpers";

test("pages do not overflow at phone, tablet and desktop widths", async ({
  context,
  page,
  request,
}) => {
  const account = await register(request, unique("Matrix User"));
  await createItem(request, account, { title: unique("Matrix record") });
  await useSession(context, account);

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const path of ["/items", "/collections", "/feed", "/recommendations/all", "/liked", "/messages"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} at ${viewport.width}px`).toBeLessThanOrEqual(1);
    }
  }
});

test("all supported locales render and set the document language", async ({
  context,
  page,
  request,
}) => {
  const account = await register(request, unique("Locale Matrix"));
  await useSession(context, account);

  for (const locale of ["ru", "uk", "en"] as const) {
    await context.addCookies([
      { name: "jey_lang", value: locale, domain: "127.0.0.1", path: "/" },
    ]);
    await page.goto("/items");
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("link", { name: /Записи|Записи|Records/i }).first()).toBeVisible();
  }
});
