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

test("the whole new item form survives a reload", async ({ context, page, request }) => {
  const account = await register(request, unique("Full Draft User"));
  await useSession(context, account);
  await page.goto("/items/new");
  await page.getByRole("button", { name: "Дополнительные настройки" }).click();
  const title = unique("Cached draft");
  const review = `Полный черновик ${Date.now()}`;
  await page.getByLabel("Название").fill(title);
  await page.getByLabel("Публичная рецензия").fill(review);
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByLabel("Название")).toHaveValue(title);
  await expect(page.getByLabel("Публичная рецензия")).toHaveValue(review);
  await expect(page.getByText("Черновик рецензии восстановлен")).toBeVisible();
});

test("an uploaded cover preview survives a reload with the form draft", async ({
  context,
  page,
  request,
}) => {
  const account = await register(request, unique("Cover Draft User"));
  await useSession(context, account);
  await page.goto("/items/new");
  await page.getByRole("button", { name: "Дополнительные настройки" }).click();
  await page.getByLabel("Название").fill(unique("Cover draft"));

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "cover.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.locator('img[src^="blob:"]')).toBeVisible();
  await page.waitForTimeout(900);
  await page.reload();
  await expect(page.locator('img[src^="data:image/"]')).toBeVisible();
});
