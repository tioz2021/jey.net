import { expect, test } from "@playwright/test";

import { register, unique, useSession } from "./helpers";

test("feed filters are shareable in the URL", async ({ context, page, request }) => {
  const account = await register(request, unique("UX User"));
  await useSession(context, account);

  await page.goto("/feed?kind=movie&sort=rating&period=week");
  await expect(page).toHaveURL(/kind=movie/);
  await expect(page.getByRole("button", { name: /Фильмы/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.getByRole("button", { name: /Игры/ }).click();
  await expect(page).toHaveURL(/kind=game/);
});

test("feed API failure shows a retry state", async ({ context, page, request }) => {
  const account = await register(request, unique("UX Error User"));
  await useSession(context, account);
  await page.route("**/api/v1/feed**", (route) => route.abort());

  await page.goto("/feed");
  await expect(page.getByRole("button", { name: "Повторить" })).toBeVisible();
  await expect(page.getByText("Не удалось загрузить записи")).toBeVisible();
});
