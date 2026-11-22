import { expect, test } from "@playwright/test";

import { follow, register, unique, useSession } from "./helpers";

test("a notification arrives without reloading the page", async ({
  context,
  page,
  request,
}) => {
  const target = await register(request, unique("Notify Target"));
  const actor = await register(request, unique("Notify Actor"));
  await useSession(context, target);

  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Уведомления" })).toBeVisible();
  await follow(request, actor, target);

  await expect(page.getByRole("link", { name: "Уведомления" })).toContainText("1", { timeout: 5000 });
  await expect(page.getByText("подписался")).toBeVisible({ timeout: 5000 });
});
