const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/browser",
  timeout: 30000,
  snapshotPathTemplate: "{testDir}/snapshots/{arg}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02, threshold: 0.3 } },
  use: {
    baseURL: `http://127.0.0.1:${process.env.TEST_PORT || 3100}`,
    browserName: "chromium",
    channel: process.env.CI ? undefined : "msedge",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
