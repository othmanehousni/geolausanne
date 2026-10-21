import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
// software WebGL so the 3D city also renders on CI machines without a GPU
const args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // one browser at a time on CI: the city renders on the CPU (SwiftShader) and
  // two of them starve each other on a 2-core runner (docs/operations/testing.md)
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: { args, executablePath },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { args, executablePath } } },
  ],
  webServer: {
    // the app must be built first (`bun run build`); demo mode, Flon tiles
    command: `bun run start -p ${PORT}`,
    url: `http://localhost:${PORT}/fr`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
