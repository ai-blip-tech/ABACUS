import { defineConfig, type Project } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const viewports = [
  { name: "1920", viewport: { width: 1920, height: 1080 } },
  { name: "1440", viewport: { width: 1440, height: 900 } },
  { name: "1366", viewport: { width: 1366, height: 768 } },
  { name: "tablet", viewport: { width: 1024, height: 768 } },
  { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
] as const;

const engines = ["chromium", "webkit", "firefox"] as const;
const projects: Project[] = engines.flatMap((browserName) => viewports.map((entry) => ({
  name: `${browserName}-${entry.name}`,
  use: {
    browserName,
    viewport: entry.viewport,
    isMobile: "isMobile" in entry ? entry.isMobile : false,
    hasTouch: "hasTouch" in entry ? entry.hasTouch : false,
  },
})));

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3111",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects,
  webServer: {
    command: `"${process.execPath}" node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3111`,
    url: "http://127.0.0.1:3111",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      ROOM_DESIGN_DATA_DIR: join(tmpdir(), "room-design-playwright"),
    },
  },
});
