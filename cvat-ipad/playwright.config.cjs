const { defineConfig } = require('@playwright/test');
const fs = require('node:fs');

module.exports = defineConfig({
    testDir: './tests',
    testMatch: '*.spec.cjs',
    workers: 1,
    use: {
        baseURL: 'http://127.0.0.1:3001',
        viewport: { width: 1180, height: 820 },
        hasTouch: true,
        launchOptions: {
            executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
        },
    },
    webServer: {
        command: 'npm run start',
        url: 'http://127.0.0.1:3001',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },
});
