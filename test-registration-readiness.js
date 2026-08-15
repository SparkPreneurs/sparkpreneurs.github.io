#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let chromium;

try {
  ({ chromium } = require('playwright'));
} catch (error) {
  console.error('Playwright is not installed. Run "npm install" first.');
  process.exit(1);
}

const REPOSITORY_ROOT = __dirname;
const PAGE_TIMEOUT_MS = 15000;
const BACKEND_TIMEOUT_MS = 12000;

function printUsage() {
  console.log(`Usage:
  node test-registration-readiness.js \\
    --page=hand-building-pottery/index.html \\
    --program=adult_hand_building_pottery \\
    --shop=[data-course-registration] \\
    --add=[data-course-add] \\
    --purchase=[data-course-purchase] \\
    --mode=test \\
    --version=mocked-readiness-check

The test opens the local page, checks a mocked and the real ping response,
adds the item to the cart, and confirms the payment button becomes enabled.
It never creates a Stripe Checkout Session or writes a registration.`);
}

function parseOptions(args) {
  const options = {};
  const aliases = {
    page: 'page',
    program: 'programCode',
    shop: 'shopSelector',
    add: 'addSelector',
    purchase: 'purchaseSelector',
    mode: 'stripeMode',
    version: 'scriptVersion'
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--help' || argument === '-h') {
      printUsage();
      process.exit(0);
    }

    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    const separatorIndex = argument.indexOf('=');
    const rawName = argument.slice(
      2,
      separatorIndex === -1 ? argument.length : separatorIndex
    );
    const inlineValue = separatorIndex === -1
      ? undefined
      : argument.slice(separatorIndex + 1);
    const optionName = aliases[rawName];

    if (!optionName) {
      throw new Error(`Unknown option: --${rawName}`);
    }

    const value = inlineValue === undefined ? args[index + 1] : inlineValue;

    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${rawName}`);
    }

    if (inlineValue === undefined) {
      index += 1;
    }

    options[optionName] = value;
  }

  for (const optionName of [
    'page',
    'programCode',
    'shopSelector',
    'addSelector',
    'purchaseSelector'
  ]) {
    if (!options[optionName]) {
      throw new Error(`Missing required option: --${optionName.replace('Code', '')}`);
    }
  }

  options.stripeMode = options.stripeMode || 'test';
  options.scriptVersion = options.scriptVersion || 'mocked-readiness-check';

  if (!['test', 'live'].includes(options.stripeMode)) {
    throw new Error('--mode must be either test or live.');
  }

  const pagePath = path.resolve(REPOSITORY_ROOT, options.page);

  if (!pagePath.startsWith(`${REPOSITORY_ROOT}${path.sep}`) || !fs.existsSync(pagePath)) {
    throw new Error(`Page must be an existing file inside the repository: ${options.page}`);
  }

  return {
    ...options,
    pagePath,
    pageLabel: path.relative(REPOSITORY_ROOT, pagePath)
  };
}

function parseRequestBody(request) {
  const body = request.postData();

  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    return null;
  }
}

async function runReadinessCheck(browser, options, viewport, useMockBackend) {
  const page = await browser.newPage({ viewport });
  const appScriptRequests = [];
  const pageErrors = [];
  let mockedPingCount = 0;

  page.on('request', (request) => {
    if (request.url().includes('/exec')) {
      appScriptRequests.push({
        method: request.method(),
        url: request.url(),
        body: parseRequestBody(request)
      });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  if (useMockBackend) {
    await page.route('**/exec', async (route) => {
      const request = route.request();
      const body = parseRequestBody(request);
      const isHealthRequest = request.method() === 'GET' || body?.action === 'ping';

      if (!isHealthRequest) {
        await route.abort('blockedbyclient');
        return;
      }

      mockedPingCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          success: true,
          programCode: options.programCode,
          programs: [options.programCode],
          minimumWeeks: 4,
          version: options.scriptVersion,
          stripeMode: options.stripeMode
        })
      });
    });
  }

  try {
    await page.goto(pathToFileURL(options.pagePath).href, {
      waitUntil: 'domcontentloaded',
      timeout: PAGE_TIMEOUT_MS
    });

    const endpoint = await page.locator(options.shopSelector).getAttribute('data-apps-script-url');

    if (!endpoint) {
      throw new Error(`The shop selector does not contain data-apps-script-url: ${options.shopSelector}`);
    }

    await page.locator(options.addSelector).first().click({ timeout: PAGE_TIMEOUT_MS });
    await page.waitForFunction(
      (purchaseSelector) => {
        const purchaseButton = document.querySelector(purchaseSelector);
        return Boolean(purchaseButton && !purchaseButton.disabled);
      },
      options.purchaseSelector,
      { timeout: BACKEND_TIMEOUT_MS }
    );

    const purchaseEnabled = !(await page.locator(options.purchaseSelector).isDisabled());
    const status = await page.locator('[role="status"]').first().textContent();
    const dimensions = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth
    }));
    const readinessRequests = appScriptRequests.filter((request) => {
      return request.method === 'GET' || request.body?.action === 'ping';
    });

    if (!purchaseEnabled || readinessRequests.length === 0) {
      throw new Error('The checkout readiness ping did not enable the purchase button.');
    }

    if (useMockBackend && mockedPingCount !== 1) {
      throw new Error(`Expected one mocked ping request but received ${mockedPingCount}.`);
    }

    if (dimensions.documentWidth > dimensions.viewportWidth) {
      throw new Error(`Horizontal overflow detected at ${dimensions.viewportWidth}px.`);
    }

    return {
      endpoint,
      purchaseEnabled,
      status: status || '',
      dimensions,
      readinessRequestCount: readinessRequests.length,
      nonFatalPageErrors: pageErrors
    };
  } finally {
    await page.close();
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const browser = await chromium.launch({ headless: true, timeout: PAGE_TIMEOUT_MS });

  try {
    const mocked = await runReadinessCheck(browser, options, { width: 1440, height: 1000 }, true);
    const desktop = await runReadinessCheck(browser, options, { width: 1440, height: 1000 }, false);
    const phone = await runReadinessCheck(browser, options, { width: 390, height: 844 }, false);

    console.log(JSON.stringify({
      success: true,
      page: options.pageLabel,
      programCode: options.programCode,
      mocked,
      desktop,
      phone
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`Checkout readiness test failed: ${error.message}`);
  process.exitCode = 1;
});
