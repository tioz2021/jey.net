import { expect, test } from "@playwright/test";

import { createItem, follow, register, unique, useSession } from "./helpers";

test("followed activity and likes reach the notebook", async ({
  context,
  page,
  request,
}) => {
  const author = await register(request, unique("Feed Author"));
  const viewer = await register(request, unique("Feed Viewer"));
  const title = unique("E2E social record");
  await createItem(request, author, { title, rating: 9 });
  await follow(request, viewer, author);
  await useSession(context, viewer);

  await page.goto("/feed");
  await expect(page.getByText(title).first()).toBeVisible();

  await page.goto("/recommendations/all");
  await expect(page.getByText(title).first()).toBeVisible();
  const card = page.locator("article").filter({ hasText: title });
  const reaction = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes("/api/v1/public/items/") &&
      response.url().endsWith("/reactions"),
  );
  await card.getByRole("button", { name: "Нравится" }).click();
  expect((await reaction).ok()).toBe(true);

  await page.goto("/liked");
  await expect(page.getByText(title).first()).toBeVisible();
});
