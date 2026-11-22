import { expect, test } from "@playwright/test";

import { createItem, register, unique, useSession } from "./helpers";

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

test("an unsaved public review survives a reload", async ({ context, page, request }) => {
  const account = await register(request, unique("Draft User"));
  await useSession(context, account);
  const item = await createItem(request, account, { title: unique("Draft record") });

  await page.goto(`/items/${item.id}/edit`);
  const review = page.getByLabel("Публичная рецензия");
  const draft = `Не потерять этот текст ${Date.now()}`;
  await review.fill(draft);
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByLabel("Публичная рецензия")).toHaveValue(draft);
  await expect(page.getByText("Черновик рецензии восстановлен")).toBeVisible();
});
