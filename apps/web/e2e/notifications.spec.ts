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
  // Let both the page and the shell attach their live listeners.
  await page.waitForTimeout(300);

  await follow(request, actor, target);

  await expect(page.getByText("подписался")).toBeVisible({ timeout: 5000 });
});
