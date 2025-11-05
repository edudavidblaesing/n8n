const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

// Optional: Set your proxy here (residential / rotating)
const PROXY_SERVER = process.env.PROXY_SERVER || '';
// Example: "http://username:password@residential-proxy.com:port"

app.post('/screenshot', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing URL' });

    let browser;
    try {
        const launchOptions = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--window-size=1920,1080',
                '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ]
        };

        if (PROXY_SERVER) {
            launchOptions.args.push(`--proxy-server=${PROXY_SERVER}`);
        }

        browser = await puppeteer.launch(launchOptions);
        const page = await browser.newPage();

        // Set viewport
        await page.setViewport({ width: 1920, height: 1080 });

        // Stealthy evaluation
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5] });
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            window.chrome = { runtime: {} };
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (params) =>
                params.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : originalQuery(params);
        });

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

        // Random delay to mimic human behavior
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));

        // Detect anti-bot frame
        const captchaFrame = await page.$('iframe[src*="captcha"]');
        if (captchaFrame) {
            return res.json({ html: null, error: 'CAPTCHA or anti-bot detected', success: false });
        }

        // Get HTML
        const html = await page.content();

        res.json({ html, success: true, error: null });
    } catch (err) {
        console.error(err);
        res.status(500).json({ html: null, error: err.message, success: false });
    } finally {
        if (browser) await browser.close();
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Puppeteer service running on port ${PORT}`));
