// server.js
const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

const app = express();
app.use(express.json());

// Screenshot endpoint
app.post('/screenshot', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'Missing URL' });
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });

        const screenshot = await page.screenshot({ encoding: 'base64' });

        res.json({ screenshot });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to capture screenshot', details: err.message });
    } finally {
        if (browser) await browser.close();
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Puppeteer service running on port ${PORT}`);
});
