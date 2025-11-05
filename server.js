// server.js
const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Optional plugins — only require if installed
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

// Config
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
  // common modern desktop UAs
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
];

const createLaunchOptions = (headless = true) => {
  // allow optional proxy via env var: PROXY=http://user:pass@host:port
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
  // progressive, human-like scroll
  await page.evaluate(() => { window.scrollBy(0, 1); });
  const distance = await page.evaluate(() => document.body.scrollHeight || document.documentElement.scrollHeight);
  const step = 150 + Math.floor(Math.random() * 200);
  for (let pos = 0; pos < distance; pos += step) {
    await page.evaluate((y) => window.scrollBy(0, y), step);
    await delay(150 + Math.random() * 400);
  }
  // scroll back a little to simulate reading
  await page.evaluate(() => window.scrollBy(0, -Math.floor(Math.random() * 200)));
  await delay(500 + Math.random() * 800);
}

async function humanMouseMovement(page) {
  // move mouse in a few natural arcs
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

// placeholder for captcha solving - you need to integrate with 2captcha/anticaptcha etc.
async function handleCaptchaIfNeeded(page) {
  // detect common indicators of captcha frames/containers and return true if present
  const html = await page.content();
  if (/captcha|datadome|hcaptcha|recaptcha|cloudflare/i.test(html)) {
    // You can either:
    // - send the challenge to a captcha-solving provider and apply solution tokens,
    // - or return an explicit error telling the caller to solve CAPTCHA manually.
    // For now we return a structured error so the caller can react.
    return { found: true, reason: 'captcha-detected' };
  }
  return { found: false };
}

async function fetchPage(url, options = {}) {
  const retries = options.retries != null ? options.retries : DEFAULT_RETRIES;
  const headless = options.headless != null ? options.headless : (process.env.DEFAULT_HEADLESS !== 'false');
  const takeScreenshot = options.screenshot != null ? !!options.screenshot : true;

  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let browser;
    try {
      const launchOptions = createLaunchOptions(headless);
      browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();

      // Set randomized UA and viewport
      const ua = options.userAgent || pick(DEFAULT_UAS);
      await page.setUserAgent(ua);
      const vp = options.viewport || pick(DEFAULT_VIEWPORTS);
      await page.setViewport(vp);

      // extra headers
      await page.setExtraHTTPHeaders({
        'accept-language': 'en-US,en;q=0.9',
        'upgrade-insecure-requests': '1'
      });

      // small pre-navigation delays to emulate human reading
      await delay(300 + Math.random() * 700);

      // navigate
      await page.goto(url, { waitUntil: 'networkidle2', timeout: DEFAULT_TIMEOUT });

      // detect captcha quickly
      const captchaCheck = await handleCaptchaIfNeeded(page);
      if (captchaCheck.found) {
        await browser.close();
        return { success: false, captcha: true, error: 'CAPTCHA or anti-bot detected', details: captchaCheck.reason };
      }

      // simulate human behaviour
      await humanMouseMovement(page);
      await humanScroll(page);

      // wait a bit more for dynamic content
      await delay(500 + Math.random() * 1000);

      // final wait for a common selector if provided
      if (options.waitForSelector) {
        try {
          await page.waitForSelector(options.waitForSelector, { timeout: options.selectorTimeout || 15000 });
        } catch (e) {
          // continue; may still have partial content
        }
      }

      const html = await page.content();
      let screenshot = null;
      if (takeScreenshot) {
        try {
          const clip = await page.screenshot({ encoding: 'base64', fullPage: true });
          screenshot = clip;
        } catch (e) {
          // ignore screenshot errors
          screenshot = null;
        }
      }

      await browser.close();
      return { success: true, html, screenshot, userAgent: ua, viewport: vp };
    } catch (err) {
      lastErr = err;
      try { if (browser) await browser.close(); } catch (e) { /* ignore */ }
      // small backoff
      await delay(500 + Math.random() * 1000);
      // try again unless last attempt
    }
  }

  return { success: false, error: lastErr ? lastErr.message : 'unknown' };
}

const app = express();
app.use(express.json({ limit: '5mb' }));

// simple token auth (optional). Set AUTH_TOKEN env var to require a token in header 'authorization: Bearer <token>'
app.use((req, res, next) => {
  const token = process.env.AUTH_TOKEN;
  if (!token) return next();
  const header = req.get('authorization') || '';
  if (header === `Bearer ${token}`) return next();
  return res.status(401).json({ error: 'unauthorized' });
});

app.post(['/html', '/screenshot'], async (req, res) => {
  const body = req.body || {};
  const url = body.url || body.target || req.query.url;
  if (!url) return res.status(400).json({ success: false, error: 'Missing url in body' });

  // allow client to request headful mode: { headless: false }
  const headless = body.headless !== undefined ? !!body.headless : undefined;
  const waitForSelector = body.waitForSelector || undefined;
  const takeScreenshot = req.path === '/screenshot' || body.screenshot !== undefined ? !!body.screenshot : (req.path === '/screenshot');
  const retries = body.retries != null ? parseInt(body.retries, 10) : undefined;

  // allow passing proxy per-request (not recommended), format: http://user:pass@host:port
  if (body.proxy) process.env.PROXY = body.proxy;

  try {
    const result = await fetchPage(url, { headless, waitForSelector, screenshot: takeScreenshot, retries });

    if (result.captcha) {
      // 409 conflict to indicate anti-bot / captcha
      return res.status(409).json({ success: false, captcha: true, error: result.error });
    }

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    // Respond: include html and maybe screenshot
    const response = {
      success: true,
      url,
      html: result.html,
    };
    if (result.screenshot) response.screenshot = result.screenshot; // base64
    if (result.userAgent) response.userAgent = result.userAgent;
    if (result.viewport) response.viewport = result.viewport;
    return res.json(response);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Puppeteer service (improved) listening on port ${PORT}`);
});
