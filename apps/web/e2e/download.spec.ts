import { expect, test } from "@playwright/test";

const manifest = {
  version: "0.7.1",
  notes: "Release notes",
  published_at: "2026-11-22T18:00:00Z",
  files: {
    "linux-x86_64": {
      name: "jey.net_0.7.1_amd64.AppImage",
      url: "https://j3ynet.site/downloads/desktop/releases/0.7.1/jey.net_0.7.1_amd64.AppImage",
      sha256: "6768db5f6b9341004ae54f1a782df0e8655e9ef6d88b4aa7410674ed4c7ff1e1",
      size: 120363512,
    },
    "linux-x86_64-deb": {
      name: "jey.net_0.7.1_amd64.deb",
      url: "https://j3ynet.site/downloads/desktop/releases/0.7.1/jey.net_0.7.1_amd64.deb",
      sha256: "e97514c199c85016d4042dea327c0d454210bbe20d9674d515c576fac673509a",
      size: 8653388,
    },
    "windows-x86_64": {
      name: "jey.net_0.7.1_x64-setup.exe",
      url: "https://j3ynet.site/downloads/desktop/releases/0.7.1/jey.net_0.7.1_x64-setup.exe",
      sha256: "abc",
      size: 90000000,
    },
  },
};

test("download page shows VPS builds and install instructions", async ({ page }) => {
  await page.route("**/downloads/desktop/latest.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(manifest) }),
  );
  await page.goto("/download");

  await expect(page.getByRole("heading", { name: "jey.net на компьютере" })).toBeVisible();
  await expect(page.getByText("Версия 0.7.1")).toBeVisible();
  await expect(page.getByRole("link", { name: /AppImage/ })).toHaveAttribute("href", manifest.files["linux-x86_64"].url);
  await expect(page.locator(`a[href="${manifest.files["windows-x86_64"].url}"]`)).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Установка" })).toBeVisible();
  await expect(page.getByText(/SmartScreen/)).toBeVisible();
});

test("download page explains a failed manifest request", async ({ page }) => {
  await page.route("**/downloads/desktop/latest.json", (route) => route.abort());
  await page.goto("/download");
  await expect(page.getByText(/Не удалось получить список сборок/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Повторить" })).toBeVisible();
});
