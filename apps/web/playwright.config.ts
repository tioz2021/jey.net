import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:8091";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    extraHTTPHeaders: { Origin: baseURL },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "bash ../../scripts/e2e-server.sh",
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
