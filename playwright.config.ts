import { defineConfig, devices } from '@playwright/test';
import { OrtoniReportConfig } from 'ortoni-report';
import path from 'path';
import EnvironmentDetector from './src/config/environment/detector/detector';
import { TIMEOUTS } from './src/config/timeouts/timeout.config';
import BrowserInitFlag from './src/config/browserInitFlag';

// Check if running in CI environment
const isCI = EnvironmentDetector.isCI();

const reportConfig: OrtoniReportConfig = {
  open: isCI ? 'never' : 'always',
  folderPath: 'ortoni-report',
  filename: 'index.html',
  logo: path.resolve(process.cwd(), ''),
  title: 'AES Argon2 Enhancement Test Report',
  showProject: false,
  projectName: 'playwright-aes-argon2-enhancement',
  testType: process.env.TEST_TYPE || 'Regression | Sanity',
  authorName: 'Tshifhiwa Sinugo',
  base64Image: false,
  stdIO: false,
  preferredTheme: 'dark',
  meta: {
    project: 'aes-argon2-enhancement',
    platform: process.env.TEST_PLATFORM || 'Windows',
    environment: process.env.ENV || 'DEV',
  },
};

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  timeout: TIMEOUTS.test,
  expect: {
    timeout: TIMEOUTS.expect,
  },
  testDir: './tests',
  globalSetup: './src/config/environment/global/globalEnvironmentSetup.ts',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? undefined : 4,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: isCI
    ? [
        ['html', { open: 'never' }],
        ['junit', { outputFile: 'results.xml' }],
        ['ortoni-report', reportConfig],
        ['dot'],
      ]
    : [
        ['html', { open: 'never' }],
        ['junit', { outputFile: 'results.xml' }],
        ['ortoni-report', reportConfig],
        ['dot'],
      ],
 grep:
  typeof process.env.PLAYWRIGHT_GREP === 'string'
    ? new RegExp(`${process.env.PLAYWRIGHT_GREP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`)
    : process.env.PLAYWRIGHT_GREP || /.*/,
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    /*
     * Project configuration with conditional browser setup:
     *
     * The browser context is always required for these tests, but the portal (e.g., login, dashboard, or full UI app)
     * may not be. This allows flexibility for both UI-based and non-UI (e.g., encryption, API, or low-level integration) tests.
     *
     * 1. When shouldSkipBrowserInit is FALSE (normal UI-enabled mode):
     *    - Portal or app-specific bootstrapping (e.g., navigation, login) may be performed
     *    - Full E2E tests can run with complete UI context
     *
     * 2. When shouldSkipBrowserInit is TRUE (non-UI mode):
     *    - Browser context is still initialized, but portal-specific setup is explicitly skipped
     *    - This is useful for tests that require a browser runtime (e.g., crypto in WebAssembly or secure storage)
     *      but do not need the overhead of loading a full application shell
     */

    ...(!BrowserInitFlag.shouldSkipBrowserInit() ? [] : []),
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run start',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
