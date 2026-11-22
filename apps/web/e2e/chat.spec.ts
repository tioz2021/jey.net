import { expect, test } from "@playwright/test";

import { register, unique, useSession } from "./helpers";

test("a viewer can start a chat and send a message", async ({
  context,
  page,
  request,
}) => {
  const author = await register(request, unique("Chat Author"));
  const viewer = await register(request, unique("Chat Viewer"));
  await useSession(context, viewer);
  const text = unique("E2E message");

  await page.goto(`/u/${author.handle}`);
  await page.getByRole("button", { name: "Написать" }).click();
  await expect(page).toHaveURL(/\/messages\//);
  await page.getByLabel("Написать сообщение…").fill(text);
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText(text).first()).toBeVisible();
});
