import { expect, test, type Page } from "@playwright/test";

import { createItem, follow, register, useSession, type Account } from "./helpers";

const widths = [1440, 1024, 390] as const;

let author: Account;
let viewer: Account;
let viewerItemId = "";

test.beforeAll(async ({ request }) => {
  author = await register(request, "Visual Author");
  viewer = await register(request, "Visual Viewer");
  await follow(request, viewer, author);

  for (let index = 1; index <= 3; index += 1) {
    await createItem(request, author, {
      title: `Visual feed ${index}`,
      rating: 8,
      review: `Стабильная рецензия ${index}`,
    });
  }
  for (let index = 1; index <= 3; index += 1) {
    const item = await createItem(request, viewer, {
      title: `Visual record ${index}`,
      rating: 7,
      review: `Заметка ${index}`,
    });
    if (index === 1) viewerItemId = item.id;
  }
});

async function stabilize(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
}

async function snap(page: Page, name: string): Promise<void> {
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    animations: "disabled",
    maxDiffPixelRatio: 0.05,
    mask: [page.locator("[data-visual-mask]")],
  });
}

test("visual: items grid and list", async ({ context, page }) => {
  await useSession(context, viewer);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/items");
    await page.getByRole("button", { name: "Сетка" }).waitFor();
    await stabilize(page);
    await snap(page, `items-grid-${width}`);

    await page.getByRole("button", { name: "Список" }).click();
    await page.waitForTimeout(150);
    await snap(page, `items-list-${width}`);
  }
});

test("visual: feed tabs", async ({ context, page }) => {
  await useSession(context, viewer);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, name] of [
      ["/feed", "feed-activity"],
      ["/recommendations", "feed-friends"],
      ["/recommendations/all", "feed-community"],
    ] as const) {
      await page.goto(route);
      await page.locator("main").first().waitFor();
      await stabilize(page);
      await snap(page, `${name}-${width}`);
    }
  }
});

test("visual: public profile", async ({ context, page }) => {
  await useSession(context, viewer);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/u/${author.handle}`);
    await page.getByRole("heading", { name: "Visual Author" }).waitFor();
    await stabilize(page);
    await snap(page, `public-profile-${width}`);
  }
});

test("visual: notifications", async ({ context, page }) => {
  await useSession(context, viewer);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/notifications");
    await page.getByRole("heading", { name: "Уведомления" }).waitFor();
    await stabilize(page);
    await snap(page, `notifications-${width}`);
  }
});

test("visual: item detail", async ({ context, page }) => {
  await useSession(context, viewer);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/items/${viewerItemId}`);
    await page.locator("main").first().waitFor();
    await stabilize(page);
    await snap(page, `item-detail-${width}`);
  }
});
