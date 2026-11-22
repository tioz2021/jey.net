import { expect, test } from "@playwright/test";

import { createItem, register, unique, useSession } from "./helpers";

test("a collection is created and a record is added from the picker", async ({
  context,
  page,
  request,
}) => {
  const account = await register(request, unique("Collection User"));
  const title = unique("E2E collection record");
  await createItem(request, account, { title });
  await useSession(context, account);
  const collection = unique("E2E collection");

  await page.goto("/collections");
  await page.getByRole("button", { name: "Создать" }).first().click();
  await page.getByLabel("Название").fill(collection);
  await page.getByRole("dialog").getByRole("button", { name: "Создать" }).click();
  await page.getByRole("link", { name: collection }).click();
  await expect(page.getByRole("heading", { name: collection })).toBeVisible();

  await page.getByRole("button", { name: "Добавить записи" }).click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog.getByText(title)).toBeVisible();
  await dialog.locator("li").filter({ hasText: title }).getByRole("button", { name: "Добавить" }).click();
  await expect(dialog.getByText(title)).toBeHidden();
  await page.getByRole("button", { name: "Отмена" }).click();
  await expect(page.getByText(title).first()).toBeVisible();
});
