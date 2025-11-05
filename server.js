// server.js - Enhanced Puppeteer Service with Captcha Storage
const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Optional plugins
let prefsPlugin;
let anonymizeUa;
let userDataDirPlugin;
try { prefsPlugin = require('puppeteer-extra-plugin-user-preferences')(); } catch (e) { prefsPlugin = null; }
try { anonymizeUa = require('puppeteer-extra-plugin-anonymize-ua')(); } catch (e) { anonymizeUa = null; }
try { userDataDirPlugin = require('puppeteer-extra-plugin-user-data-dir')({ persistUserData: true }); } catch (e) { userDataDirPlugin = null; }

puppeteer.use(StealthPlugin());
if (prefsPlugin) puppeteer.use(prefsPlugin);
if (anonymizeUa) puppeteer.use(anonymizeUa);
if (userDataDirPlugin) puppeteer.use(userDataDirPlugin);

// ============ CAPTCHA STORAGE ============
const captchaStore = new Map(); // { executionId: { html, url, screenshot, timestamp } }

// Cleanup old captchas every hour (older than 24 hours)
setInterval(() => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  for (const [key, value] of captchaStore.entries()) {
    if (now - value.timestamp > day) {
      captchaStore.delete(key);
      console.log(`[Cleanup] Removed old captcha for execution ${key}`);
    }
  }
}, 60 * 60 * 1000);

// ============ CONFIG ============
const DEFAULT_TIMEOUT = 45000;
const DEFAULT_RETRIES = 2;
const DEFAULT_VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 }
];

const RANDOM_INT = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const DEFAULT_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
];

const createLaunchOptions = (headless = true) => {
  const proxy = process.env.PROXY || null;
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    `--window-size=${pick(DEFAULT_VIEWPORTS).width},${pick(DEFAULT_VIEWPORTS).height}`
  ];
  if (proxy) args.push(`--proxy-server=${proxy}`);

  return {
    headless: headless ? 'new' : false,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    args,
    defaultViewport: null,
    ignoreHTTPSErrors: true,
    timeout: DEFAULT_TIMEOUT
  };
};

async function humanScroll(page) {
  await page.evaluate(() => { window.scrollBy(0, 1); });
  const distance = await page.evaluate(() => document.body.scrollHeight || document.documentElement.scrollHeight);
  const step = 150 + Math.floor(Math.random() * 200);
  for (let pos = 0; pos < distance; pos += step) {
    await page.evaluate((y) => window.scrollBy(0, y), step);
    await delay(150 + Math.random() * 400);
  }
  await page.evaluate(() => window.scrollBy(0, -Math.floor(Math.random() * 200)));
  await delay(500 + Math.random() * 800);
}

async function humanMouseMovement(page) {
  try {
    const box = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(Math.random() * box.w);
      const y = Math.floor(Math.random() * box.h);
      await page.mouse.move(x, y, { steps: 20 });
      await delay(200 + Math.random() * 400);
    }
  } catch (e) { /* ignore */ }
}

async function handleCaptchaIfNeeded(page) {
  const html = await page.content();
  if (/captcha|datadome|hcaptcha|recaptcha|cloudflare|challenge-platform/i.test(html)) {
    return { found: true, reason: 'captcha-detected' };
  }
  return { found: false };
}

async function fetchPage(url, options = {}) {
  const retries = options.retries != null ? options.retries : DEFAULT_RETRIES;
  const headless = options.headless != null ? options.headless : (process.env.DEFAULT_HEADLESS !== 'false');
  const takeScreenshot = options.screenshot != null ? !!options.screenshot : true;
  const executionId = options.executionId || null;

  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let browser;
    try {
      const launchOptions = createLaunchOptions(headless);
      browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();

      const ua = options.userAgent || pick(DEFAULT_UAS);
      await page.setUserAgent(ua);
      const vp = options.viewport || pick(DEFAULT_VIEWPORTS);
      await page.setViewport(vp);

      await page.setExtraHTTPHeaders({
        'accept-language': 'en-US,en;q=0.9',
        'upgrade-insecure-requests': '1'
      });

      await delay(300 + Math.random() * 700);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: DEFAULT_TIMEOUT });

      // Check for captcha
      const captchaCheck = await handleCaptchaIfNeeded(page);
      if (captchaCheck.found) {
        console.log(`[Captcha] Detected for ${url}`);
        
        // Capture the captcha page
        const captchaHtml = await page.content();
        let screenshot = null;
        
        try {
          screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });
        } catch (e) {
          console.error('[Screenshot] Error:', e.message);
        }

        await browser.close();

        // Store captcha if executionId provided
        if (executionId) {
          captchaStore.set(executionId, {
            html: captchaHtml,
            url: url,
            screenshot: screenshot,
            timestamp: Date.now(),
            userAgent: ua,
            viewport: vp
          });
          console.log(`[Captcha] Stored for execution ${executionId}`);
        }

        return {
          success: false,
          captcha: true,
          captchaHtml: captchaHtml,
          screenshot: screenshot,
          error: 'CAPTCHA or anti-bot detected',
          details: captchaCheck.reason
        };
      }

      // Simulate human behavior
      await humanMouseMovement(page);
      await humanScroll(page);
      await delay(500 + Math.random() * 1000);

      if (options.waitForSelector) {
        try {
          await page.waitForSelector(options.waitForSelector, { timeout: options.selectorTimeout || 15000 });
        } catch (e) {
          // Continue anyway
        }
      }

      const html = await page.content();
      let screenshot = null;
      if (takeScreenshot) {
        try {
          screenshot = await page.screenshot({ encoding: 'base64', fullPage: true });
        } catch (e) {
          screenshot = null;
        }
      }

      await browser.close();
      return { success: true, html, screenshot, userAgent: ua, viewport: vp };
    } catch (err) {
      lastErr = err;
      try { if (browser) await browser.close(); } catch (e) { /* ignore */ }
      await delay(500 + Math.random() * 1000);
    }
  }

  return { success: false, error: lastErr ? lastErr.message : 'unknown' };
}

// ============ EXPRESS APP ============
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb', type: 'text/html' }));

// Optional auth
app.use((req, res, next) => {
  const token = process.env.AUTH_TOKEN;
  if (!token) return next();
  const header = req.get('authorization') || '';
  if (header === `Bearer ${token}`) return next();
  return res.status(401).json({ error: 'unauthorized' });
});

// Main scraping endpoint
app.post(['/html', '/screenshot'], async (req, res) => {
  const body = req.body || {};
  const url = body.url || body.target || req.query.url;
  if (!url) return res.status(400).json({ success: false, error: 'Missing url in body' });

  const headless = body.headless !== undefined ? !!body.headless : undefined;
  const waitForSelector = body.waitForSelector || undefined;
  const takeScreenshot = req.path === '/screenshot' || body.screenshot !== undefined ? !!body.screenshot : (req.path === '/screenshot');
  const retries = body.retries != null ? parseInt(body.retries, 10) : undefined;
  const executionId = body.executionId || body.execution_id || null;

  if (body.proxy) process.env.PROXY = body.proxy;

  try {
    const result = await fetchPage(url, {
      headless,
      waitForSelector,
      screenshot: takeScreenshot,
      retries,
      executionId
    });

    if (result.captcha) {
      return res.status(409).json({
        success: false,
        captcha: true,
        error: result.error,
        captchaHtml: result.captchaHtml,
        screenshot: result.screenshot,
        executionId: executionId
      });
    }

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    const response = {
      success: true,
      url,
      html: result.html,
    };
    if (result.screenshot) response.screenshot = result.screenshot;
    if (result.userAgent) response.userAgent = result.userAgent;
    if (result.viewport) response.viewport = result.viewport;
    return res.json(response);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Store captcha HTML (called by n8n)
app.post('/store-captcha', (req, res) => {
  const { executionId, html, url, screenshot } = req.body;
  if (!executionId || !html) {
    return res.status(400).json({ success: false, error: 'Missing executionId or html' });
  }

  captchaStore.set(executionId, {
    html,
    url: url || 'unknown',
    screenshot: screenshot || null,
    timestamp: Date.now()
  });

  console.log(`[Store] Captcha stored for execution ${executionId}`);
  res.json({ success: true, executionId });
});

// Get stored captcha HTML
app.get('/captcha/:executionId', (req, res) => {
  const executionId = req.params.executionId;
  const data = captchaStore.get(executionId);

  if (!data) {
    console.log(`[Get] Captcha not found for execution ${executionId}`);
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Not Found</title></head>
      <body>
        <h1>Captcha Not Found</h1>
        <p>No captcha data for execution ${executionId}</p>
        <p>It may have expired or never been stored.</p>
      </body>
      </html>
    `);
  }

  console.log(`[Get] Serving captcha for execution ${executionId}`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(data.html);
});

// Get captcha metadata (JSON)
app.get('/captcha-info/:executionId', (req, res) => {
  const executionId = req.params.executionId;
  const data = captchaStore.get(executionId);

  if (!data) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json({
    executionId,
    url: data.url,
    timestamp: data.timestamp,
    hasScreenshot: !!data.screenshot,
    htmlLength: data.html.length
  });
});

// List all stored captchas
app.get('/captchas', (req, res) => {
  const list = [];
  for (const [executionId, data] of captchaStore.entries()) {
    list.push({
      executionId,
      url: data.url,
      timestamp: data.timestamp,
      age: Date.now() - data.timestamp
    });
  }
  res.json({ count: list.length, captchas: list });
});

// Delete captcha
app.delete('/captcha/:executionId', (req, res) => {
  const executionId = req.params.executionId;
  const deleted = captchaStore.delete(executionId);
  res.json({ success: deleted, executionId });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    captchasStored: captchaStore.size,
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Puppeteer service with captcha storage listening on port ${PORT}`);
  console.log(`   - POST /html - Scrape page (returns captcha HTML if detected)`);
  console.log(`   - GET /captcha/:executionId - Get stored captcha HTML`);
  console.log(`   - GET /captcha-info/:executionId - Get captcha metadata`);
  console.log(`   - GET /captchas - List all stored captchas`);
});
