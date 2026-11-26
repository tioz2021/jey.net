import { expect, test } from "@playwright/test";

import { createItem, follow, register, unique, useSession } from "./helpers";

test("feed badge shows one new record, not the old 9+ bucket", async ({
  context,
  page,
  request,
}) => {
  const author = await register(request, unique("Badge Author"));
  const viewer = await register(request, unique("Badge Viewer"));
  await follow(request, viewer, author);
  await createItem(request, author, { title: "Badge first" });

  await useSession(context, viewer);
  await page.goto("/feed");
  await expect(page.getByRole("link", { name: "Активность" })).toBeVisible();
  await expect(page.locator(".feed-badge")).toHaveCount(0, { timeout: 7000 });

  await createItem(request, author, { title: "Badge second" });
  await expect(page.locator(".feed-badge").first()).toHaveText("1", { timeout: 7000 });
});
