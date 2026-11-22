import { expect, test } from "@playwright/test";

import { register, unique, useSession } from "./helpers";

test("registration creates a session and opens the notebook", async ({
  context,
  page,
  request,
}) => {
  const account = await register(request, unique("E2E User"));
  await useSession(context, account);

  await page.goto("/items");
  await expect(page).toHaveURL(/\/items/);
  await expect(page.getByRole("link", { name: /Мои записи/ }).first()).toBeVisible();
});
