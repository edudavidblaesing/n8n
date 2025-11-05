// server.js - Enhanced with Proxy Rotation
const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

// ============ PROXY POOL ============
const PROXY_LIST = [
  '36.91.220.132:8080',
  '3.26.50.148:8080',
  '103.81.194.120:8080',
  '77.105.137.42:8080',
  '170.78.5.214:8080',
  '49.156.44.117:8080',
  '38.156.72.10:8080',
  '102.23.239.2:8080',
  '190.97.254.180:8080',
  '181.78.202.29:8080',
  '103.25.111.246:8080',
  '103.125.18.69:8080',
  '109.111.166.40:8080',
  '188.132.222.2:8080',
  '170.0.11.11:8080',
  '202.5.62.55:8080',
  '187.49.176.141:8080',
  '61.91.202.211:8080',
  '36.110.143.55:8080',
  '183.88.213.178:8080',
  '49.156.38.226:8080',
  '103.184.67.117:8080',
  '149.40.26.240:8080'
];

let currentProxyIndex = 0;

function getNextProxy() {
  const proxy = PROXY_LIST[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % PROXY_LIST.length;
  return `http://${proxy}`;
}

// ============ CAPTCHA STORAGE ============
const captchaStore = new Map();

setInterval(() => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  for (const [key, value] of captchaStore.entries()) {
    if (now - value.timestamp > day) {
      captchaStore.delete(key);
    }
  }
}, 60 * 60 * 1000);

// ============ CONFIG ============
const DEFAULT_TIMEOUT = 45000;
const DEFAULT_RETRIES = 2;
const DEFAULT_VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 }
];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

const DEFAULT_UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
];

const createLaunchOptions = (headless = true, useProxy = true) => {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled'
  ];
  
  if (useProxy) {
    const proxy = getNextProxy();
    args.push(`--proxy-server=${proxy}`);
    console.log(`[Proxy] Using: ${proxy}`);
  }

  return {
    headless: headless ? 'new' : false,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    args,
    defaultViewport: null,
    ignoreHTTPSErrors: true,
    timeout: DEFAULT_TIMEOUT
  };
};

async function handleCaptchaIfNeeded(page) {
  const html = await page.content();
  if (/captcha|cloudflare|challenge-platform/i.test(html)) {
    return { found: true, reason: 'captcha-detected' };
  }
  return { found: false };
}

async function fetchPage(url, options = {}) {
  const retries = options.retries != null ? options.retries : DEFAULT_RETRIES;
  const headless = options.headless != null ? options.headless : true;
  const executionId = options.executionId || null;
  const useProxy = options.useProxy !== false;

  let lastErr = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    let browser;
    try {
      const launchOptions = createLaunchOptions(headless, useProxy);
      browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();

      const ua = pick(DEFAULT_UAS);
      await page.setUserAgent(ua);
      await page.setViewport(pick(DEFAULT_VIEWPORTS));

      await delay(300 + Math.random() * 700);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: DEFAULT_TIMEOUT });

      const captchaCheck = await handleCaptchaIfNeeded(page);
      if (captchaCheck.found) {
        const captchaHtml = await page.content();
        await browser.close();

        if (executionId) {
          captchaStore.set(executionId, {
            html: captchaHtml,
            url: url,
            timestamp: Date.now()
          });
          console.log(`[Captcha] Stored for execution ${executionId}`);
        }

        return {
          success: false,
          captcha: true,
          captchaHtml: captchaHtml,
          error: 'CAPTCHA detected'
        };
      }

      const html = await page.content();
      await browser.close();
      return { success: true, html };
    } catch (err) {
      lastErr = err;
      try { if (browser) await browser.close(); } catch (e) {}
      await delay(500 + Math.random() * 1000);
    }
  }

  return { success: false, error: lastErr ? lastErr.message : 'unknown' };
}

// ============ EXPRESS APP ============
const app = express();
app.use(express.json({ limit: '10mb' }));

app.post(['/html', '/screenshot'], async (req, res) => {
  const body = req.body || {};
  const url = body.url || req.query.url;
  if (!url) return res.status(400).json({ success: false, error: 'Missing url' });

  const executionId = body.executionId || body.execution_id || null;
  const useProxy = body.useProxy !== false;

  try {
    const result = await fetchPage(url, { executionId, useProxy });

    if (result.captcha) {
      return res.status(409).json({
        success: false,
        captcha: true,
        error: result.error,
        captchaHtml: result.captchaHtml,
        executionId: executionId
      });
    }

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    return res.json({ success: true, url, html: result.html });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/store-captcha', (req, res) => {
  const { executionId, html, url } = req.body;
  if (!executionId || !html) {
    return res.status(400).json({ success: false, error: 'Missing executionId or html' });
  }

  captchaStore.set(executionId, { html, url: url || 'unknown', timestamp: Date.now() });
  console.log(`[Store] Captcha stored for execution ${executionId}`);
  res.json({ success: true, executionId });
});

app.get('/captcha/:executionId', (req, res) => {
  const executionId = req.params.executionId;
  const data = captchaStore.get(executionId);

  if (!data) {
    return res.status(404).send('<html><body><h1>Not Found</h1></body></html>');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(data.html);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', captchas: captchaStore.size, proxies: PROXY_LIST.length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Puppeteer service on port ${PORT}`);
  console.log(`📡 Proxies: ${PROXY_LIST.length}`);
});
