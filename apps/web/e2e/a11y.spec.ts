import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { createItem, register, unique, useSession } from "./helpers";

test("critical pages have no serious accessibility violations", async ({
  context,
  page,
  request,
}) => {
  const account = await register(request, unique("A11y User"));
  await createItem(request, account, { title: unique("A11y record"), rating: 9 });
  await useSession(context, account);

  for (const path of ["/items", "/collections", "/recommendations/all", "/liked"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(serious, `${path}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/items");
  const mobile = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    mobile.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical"),
    JSON.stringify(mobile.violations, null, 2),
  ).toEqual([]);
});

test("skip link is the first keyboard stop", async ({ context, page, request }) => {
  const account = await register(request, unique("Keyboard User"));
  await useSession(context, account);
  await page.goto("/items");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveClass(/skip-link/);
  await expect(page.locator(":focus")).toHaveText("Перейти к содержимому");
});
