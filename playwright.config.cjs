const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "browser.spec.cjs",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 30_000,
  use: {
    viewport: { width: 1440, height: 1000 },
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
    screenshot: "only-on-failure",
  },
});
