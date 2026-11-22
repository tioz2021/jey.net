import { expect, test } from "@playwright/test";

import { register, unique, useSession } from "./helpers";

test("a record can be added from the notebook", async ({ context, page, request }) => {
  const account = await register(request, unique("Item User"));
  await useSession(context, account);
  const title = unique("E2E record");

  await page.goto("/items/new");
  await page.getByRole("button", { name: "Дополнительные настройки" }).click();
  await page.getByLabel("Название").fill(title);
  await page.getByRole("button", { name: "Сохранить" }).click();

  await expect(page).toHaveURL(/\/items\//);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});
