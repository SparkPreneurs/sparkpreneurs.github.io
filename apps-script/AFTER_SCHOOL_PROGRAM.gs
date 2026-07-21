const SPREADSHEET_ID = "1ptQXLvpebEHRiENXX-Sr5c7WE4r5MURd2MIMc95jBpk";
const PROGRAM_CODE = "after_school_program";
const PROGRAM_NAME = "After School Program";
const CURRENCY = "cad";
const SCRIPT_VERSION = "2026-07-21-1";
const STRIPE_API_BASE = "https://api.stripe.com/v1";
const MAX_REQUEST_BYTES = 30000;

const PRODUCTS_SHEET_NAME = "Products";
const ATTEMPTS_SHEET_NAME = "Checkout Attempts";
const REGISTRATIONS_SHEET_NAME = "Registrations";

const PRODUCT_HEADERS = [
  "programCode",
  "itemCode",
  "itemName",
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "priceCents",
  "taxRatePercent",
  "active",
  "capacity"
];

const ATTEMPT_HEADERS = [
  "createdAt",
  "updatedAt",
  "programCode",
  "orderId",
  "stripeSessionId",
  "stripeMode",
  "status",
  "selectedItemCodes",
  "selectedItemNames",
  "subtotalCents",
  "taxCents",
  "expectedAmountCents",
  "studentName",
  "parentName",
  "parentEmail",
  "phone",
  "lastError"
];

const REGISTRATION_HEADERS = ATTEMPT_HEADERS.concat([
  "paidAt",
  "stripePaymentIntentId",
  "stripePaymentStatus",
  "registrationStatus"
]);

const DEFAULT_PRODUCTS = [
  {
    programCode: PROGRAM_CODE,
    itemCode: "AFTER3",
    itemName: "After School Program: 3 days/week",
    startDate: "",
    endDate: "",
    startTime: "3 PM",
    endTime: "5 PM",
    priceCents: 7200,
    taxRatePercent: 0,
    active: true,
    capacity: ""
  },
  {
    programCode: PROGRAM_CODE,
    itemCode: "AFTER4",
    itemName: "After School Program: 4 days/week",
    startDate: "",
    endDate: "",
    startTime: "3 PM",
    endTime: "5 PM",
    priceCents: 8800,
    taxRatePercent: 0,
    active: true,
    capacity: ""
  },
  {
    programCode: PROGRAM_CODE,
    itemCode: "AFTER5",
    itemName: "After School Program: 5 days/week",
    startDate: "",
    endDate: "",
    startTime: "3 PM",
    endTime: "5 PM",
    priceCents: 10000,
    taxRatePercent: 0,
    active: true,
    capacity: ""
  }
];

function doGet() {
  return jsonResponse_({
    success: true,
    message: "After School Program registration endpoint is running.",
    programCode: PROGRAM_CODE,
    programName: PROGRAM_NAME,
    version: SCRIPT_VERSION,
    stripeMode: getStripeMode_()
  });
}

function doPost(event) {
  try {
    const body = getRequestBody_(event);
    const data = JSON.parse(body || "{}");
    const action = String(data.action || "").trim();

    if (action === "createCheckoutSession") {
      return jsonResponse_(createCheckoutSession_(data));
    }

    if (action === "verifyCheckoutSession") {
      return jsonResponse_(verifyCheckoutSession_(data));
    }

    throw clientError_("Unknown request action.");
  } catch (error) {
    return jsonResponse_({
      success: false,
      error: publicErrorMessage_(error)
    });
  }
}

function setupPeriodWorkbook() {
  const spreadsheet = getSpreadsheet_();
  ensureSheet_(spreadsheet, PRODUCTS_SHEET_NAME, PRODUCT_HEADERS);
  ensureSheet_(spreadsheet, ATTEMPTS_SHEET_NAME, ATTEMPT_HEADERS);
  ensureSheet_(spreadsheet, REGISTRATIONS_SHEET_NAME, REGISTRATION_HEADERS);
  seedDefaultProducts_(spreadsheet.getSheetByName(PRODUCTS_SHEET_NAME));

  return {
    success: true,
    message: "After School Program workbook is ready.",
    spreadsheetId: SPREADSHEET_ID,
    productCount: DEFAULT_PRODUCTS.length
  };
}

function authorizeRequiredServices() {
  const spreadsheet = getSpreadsheet_();
  setupPeriodWorkbook();
  const config = getStripeConfig_();

  return {
    success: true,
    message: "Authorization check completed.",
    spreadsheetName: spreadsheet.getName(),
    stripeMode: config.mode,
    stripeKeyPrefix: config.key.slice(0, 7)
  };
}

function createCheckoutSession_(data) {
  const registration = normalizeRegistration_(data);
  const selectedItemCodes = normalizeSelectedItemCodes_(data.selectedItemCodes || data.items || data.itemCode);
  const pricing = calculateTrustedPricing_(selectedItemCodes);
  const displayedAmountCents = toOptionalInteger_(data.displayedAmountCents);

  if (displayedAmountCents !== null && displayedAmountCents !== pricing.expectedAmountCents) {
    throw clientError_("The checkout total changed. Please refresh the page and try again.");
  }

  const urls = validateReturnUrls_(data.successUrl, data.cancelUrl);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  let orderId = "";
  try {
    orderId = createOrderId_();
    appendAttempt_(Object.assign({}, registration, {
      createdAt: nowIso_(),
      updatedAt: nowIso_(),
      orderId: orderId,
      stripeSessionId: "",
      stripeMode: getStripeMode_(),
      status: "CREATING_CHECKOUT",
      selectedItemCodes: pricing.itemCodes.join(","),
      selectedItemNames: pricing.itemNames.join(" | "),
      subtotalCents: pricing.subtotalCents,
      taxCents: pricing.taxCents,
      expectedAmountCents: pricing.expectedAmountCents,
      lastError: ""
    }));
  } finally {
    lock.releaseLock();
  }

  try {
    const session = createStripeCheckoutSession_(orderId, pricing, registration, urls);
    updateAttemptByOrderId_(orderId, {
      updatedAt: nowIso_(),
      stripeSessionId: session.id || "",
      status: "CHECKOUT_CREATED",
      lastError: ""
    });

    return {
      success: true,
      checkoutUrl: session.url,
      stripeSessionId: session.id,
      orderId: orderId,
      expectedAmountCents: pricing.expectedAmountCents
    };
  } catch (error) {
    updateAttemptByOrderId_(orderId, {
      updatedAt: nowIso_(),
      status: "CHECKOUT_ERROR",
      lastError: publicErrorMessage_(error)
    });
    throw error;
  }
}

function verifyCheckoutSession_(data) {
  const sessionId = requireText_(data.sessionId, "checkout session", 120);
  const session = stripeGet_("checkout/sessions/" + encodeURIComponent(sessionId), {
    "expand[]": "payment_intent"
  });

  if (!session || session.object !== "checkout.session") {
    throw clientError_("Checkout session could not be found.");
  }

  if (session.payment_status !== "paid") {
    return {
      success: true,
      paid: false,
      status: session.payment_status || "unpaid"
    };
  }

  const attempt = getAttemptBySessionId_(sessionId);
  if (!attempt) {
    throw clientError_("Registration record could not be found for this checkout.");
  }

  const expectedAmountCents = toInteger_(attempt.expectedAmountCents);
  if (toInteger_(session.amount_total) !== expectedAmountCents || String(session.currency || "").toLowerCase() !== CURRENCY) {
    throw clientError_("Paid amount does not match the registration total.");
  }

  const paymentIntent = typeof session.payment_intent === "object" && session.payment_intent
    ? session.payment_intent
    : {};

  const paidAt = nowIso_();
  const registration = Object.assign({}, attempt, {
    updatedAt: paidAt,
    status: "PAID",
    paidAt: paidAt,
    stripePaymentIntentId: paymentIntent.id || String(session.payment_intent || ""),
    stripePaymentStatus: paymentIntent.status || session.payment_status || "",
    registrationStatus: "Registered",
    lastError: ""
  });

  upsertRegistrationBySessionId_(registration);
  updateAttemptByOrderId_(attempt.orderId, {
    updatedAt: paidAt,
    status: "PAID",
    lastError: ""
  });

  return {
    success: true,
    paid: true,
    orderId: attempt.orderId,
    programName: PROGRAM_NAME,
    selectedItemNames: attempt.selectedItemNames,
    amountPaidCents: expectedAmountCents
  };
}

function createStripeCheckoutSession_(orderId, pricing, registration, urls) {
  const params = {
    mode: "payment",
    success_url: urls.successUrl + (urls.successUrl.indexOf("?") === -1 ? "?" : "&") + "session_id={CHECKOUT_SESSION_ID}",
    cancel_url: urls.cancelUrl,
    customer_email: registration.parentEmail,
    client_reference_id: orderId,
    "metadata[programCode]": PROGRAM_CODE,
    "metadata[programName]": PROGRAM_NAME,
    "metadata[orderId]": orderId,
    "metadata[selectedItemCodes]": pricing.itemCodes.join(","),
    "metadata[studentName]": registration.studentName,
    "payment_intent_data[metadata][programCode]": PROGRAM_CODE,
    "payment_intent_data[metadata][orderId]": orderId
  };

  pricing.items.forEach(function(item, index) {
    params["line_items[" + index + "][quantity]"] = "1";
    params["line_items[" + index + "][price_data][currency]"] = CURRENCY;
    params["line_items[" + index + "][price_data][unit_amount]"] = String(item.totalCents);
    params["line_items[" + index + "][price_data][product_data][name]"] = item.itemName;
    params["line_items[" + index + "][price_data][product_data][metadata][programCode]"] = PROGRAM_CODE;
    params["line_items[" + index + "][price_data][product_data][metadata][itemCode]"] = item.itemCode;
  });

  return stripePost_("checkout/sessions", params);
}

function calculateTrustedPricing_(selectedItemCodes) {
  if (selectedItemCodes.length !== 1) {
    throw clientError_("Please choose one After School option before checkout.");
  }

  const products = getActiveProducts_();
  const selected = selectedItemCodes.map(function(code) {
    const product = products[code];
    if (!product) {
      throw clientError_("Selected option is no longer available.");
    }
    const subtotalCents = toInteger_(product.priceCents);
    const taxRate = Number(product.taxRatePercent || 0);
    const taxCents = Math.round(subtotalCents * taxRate / 100);

    return {
      itemCode: product.itemCode,
      itemName: product.itemName,
      subtotalCents: subtotalCents,
      taxCents: taxCents,
      totalCents: subtotalCents + taxCents
    };
  });

  return {
    items: selected,
    itemCodes: selected.map(function(item) { return item.itemCode; }),
    itemNames: selected.map(function(item) { return item.itemName; }),
    subtotalCents: selected.reduce(function(total, item) { return total + item.subtotalCents; }, 0),
    taxCents: selected.reduce(function(total, item) { return total + item.taxCents; }, 0),
    expectedAmountCents: selected.reduce(function(total, item) { return total + item.totalCents; }, 0)
  };
}

function getActiveProducts_() {
  const sheet = getSpreadsheet_().getSheetByName(PRODUCTS_SHEET_NAME);
  if (!sheet) {
    throw clientError_("Products sheet is missing. Please run setupPeriodWorkbook first.");
  }

  const rows = readRows_(sheet, PRODUCT_HEADERS);
  const products = {};
  rows.forEach(function(row) {
    if (row.programCode === PROGRAM_CODE && isTruthy_(row.active)) {
      products[String(row.itemCode).trim()] = row;
    }
  });

  return products;
}

function normalizeRegistration_(data) {
  return {
    studentName: requireText_(data.studentName, "student name", 100),
    parentName: requireText_(data.parentName, "parent name", 100),
    parentEmail: sanitizeEmail_(data.parentEmail, "parent email"),
    phone: requireText_(data.phone, "phone", 40)
  };
}

function normalizeSelectedItemCodes_(value) {
  if (Array.isArray(value)) {
    return value.map(function(item) {
      return typeof item === "object" && item !== null ? String(item.itemCode || item.code || "").trim() : String(item).trim();
    }).filter(Boolean);
  }

  if (typeof value === "string") {
    return value.split(",").map(function(item) {
      return item.trim();
    }).filter(Boolean);
  }

  return [];
}

function validateReturnUrls_(successValue, cancelValue) {
  return {
    successUrl: validateReturnUrl_(successValue, "success"),
    cancelUrl: validateReturnUrl_(cancelValue, "cancel")
  };
}

function validateReturnUrl_(value, kind) {
  const url = requireText_(value, kind + " URL", 500);
  const match = url.match(/^https:\/\/([^\/?#]+)(\/[^?#]*)?/i);
  if (!match) {
    throw clientError_("Checkout return URL is not allowed.");
  }

  const host = match[1].toLowerCase();
  const path = match[2] || "/";
  const allowedHost = host === "sparkpreneurs.ca" || host === "www.sparkpreneurs.ca";
  const allowedPath = path === "/after-school/" || path === "/after-school/index.html";
  if (!allowedHost || !allowedPath) {
    throw clientError_("Checkout return URL is not allowed.");
  }

  return url;
}

function seedDefaultProducts_(sheet) {
  const existingCodes = {};
  readRows_(sheet, PRODUCT_HEADERS).forEach(function(row) {
    if (row.programCode === PROGRAM_CODE && row.itemCode) {
      existingCodes[String(row.itemCode).trim()] = true;
    }
  });

  DEFAULT_PRODUCTS.forEach(function(product) {
    if (!existingCodes[product.itemCode]) {
      appendByHeaders_(sheet, PRODUCT_HEADERS, product);
    }
  });
}

function ensureSheet_(spreadsheet, sheetName, headers) {
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  const width = headers.length;
  const currentHeaders = sheet.getRange(1, 1, 1, width).getValues()[0];
  const missingHeaders = headers.some(function(header, index) {
    return String(currentHeaders[index] || "").trim() !== header;
  });

  if (missingHeaders) {
    sheet.getRange(1, 1, 1, width).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function appendAttempt_(attempt) {
  appendByHeaders_(getSpreadsheet_().getSheetByName(ATTEMPTS_SHEET_NAME), ATTEMPT_HEADERS, attempt);
}

function getAttemptBySessionId_(sessionId) {
  const sheet = getSpreadsheet_().getSheetByName(ATTEMPTS_SHEET_NAME);
  const rows = readRows_(sheet, ATTEMPT_HEADERS);
  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].stripeSessionId || "") === sessionId) {
      return rows[i];
    }
  }
  return null;
}

function updateAttemptByOrderId_(orderId, updates) {
  updateRowByKey_(getSpreadsheet_().getSheetByName(ATTEMPTS_SHEET_NAME), ATTEMPT_HEADERS, "orderId", orderId, updates);
}

function upsertRegistrationBySessionId_(registration) {
  const sheet = getSpreadsheet_().getSheetByName(REGISTRATIONS_SHEET_NAME);
  const updated = updateRowByKey_(sheet, REGISTRATION_HEADERS, "stripeSessionId", registration.stripeSessionId, registration);
  if (!updated) {
    appendByHeaders_(sheet, REGISTRATION_HEADERS, registration);
  }
}

function updateRowByKey_(sheet, headers, keyName, keyValue, updates) {
  const headerMap = headerMap_(headers);
  const keyColumn = headerMap[keyName] + 1;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return false;
  }

  const values = sheet.getRange(2, keyColumn, lastRow - 1, 1).getValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0] || "") === String(keyValue)) {
      const rowNumber = i + 2;
      headers.forEach(function(header, index) {
        if (Object.prototype.hasOwnProperty.call(updates, header)) {
          sheet.getRange(rowNumber, index + 1).setValue(updates[header]);
        }
      });
      return true;
    }
  }

  return false;
}

function appendByHeaders_(sheet, headers, data) {
  const values = headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(data, header) ? data[header] : "";
  });
  sheet.appendRow(values);
}

function readRows_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function(row) {
    const item = {};
    headers.forEach(function(header, index) {
      item[header] = row[index];
    });
    return item;
  });
}

function headerMap_(headers) {
  const map = {};
  headers.forEach(function(header, index) {
    map[header] = index;
  });
  return map;
}

function stripePost_(path, params) {
  return stripeRequest_(path, "post", params);
}

function stripeGet_(path, params) {
  return stripeRequest_(path, "get", params || {});
}

function stripeRequest_(path, method, params) {
  const config = getStripeConfig_();
  const query = formEncode_(params || {});
  const url = STRIPE_API_BASE + "/" + path + (method === "get" && query ? "?" + query : "");
  const options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      Authorization: "Bearer " + config.key
    }
  };

  if (method === "post") {
    options.payload = query;
    options.contentType = "application/x-www-form-urlencoded";
  }

  const response = UrlFetchApp.fetch(url, options);
  const text = response.getContentText();
  const parsed = text ? JSON.parse(text) : {};
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    const message = parsed && parsed.error && parsed.error.message ? parsed.error.message : "Stripe request failed.";
    throw clientError_(message);
  }

  return parsed;
}

function getStripeConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const mode = getStripeMode_();
  const keyName = mode === "live" ? "STRIPE_SECRET_KEY_LIVE" : "STRIPE_SECRET_KEY_TEST";
  const key = String(properties.getProperty(keyName) || "").trim();

  if (!key) {
    throw clientError_("Stripe is not configured yet.");
  }

  if (mode === "live" && key.indexOf("sk_live_") !== 0) {
    throw clientError_("Live Stripe key is not valid.");
  }

  if (mode === "test" && key.indexOf("sk_test_") !== 0) {
    throw clientError_("Test Stripe key is not valid.");
  }

  return {
    mode: mode,
    key: key
  };
}

function getStripeMode_() {
  const mode = String(PropertiesService.getScriptProperties().getProperty("STRIPE_MODE") || "test").trim().toLowerCase();
  return mode === "live" ? "live" : "test";
}

function formEncode_(params) {
  return Object.keys(params).map(function(key) {
    return encodeURIComponent(key) + "=" + encodeURIComponent(String(params[key]));
  }).join("&");
}

function getRequestBody_(event) {
  const contents = event && event.postData && event.postData.contents ? event.postData.contents : "";
  if (contents.length > MAX_REQUEST_BYTES) {
    throw clientError_("Request is too large.");
  }
  return contents;
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function createOrderId_() {
  return "ASP-" + Utilities.formatDate(new Date(), "America/Toronto", "yyyyMMdd-HHmmss") + "-" + Utilities.getUuid().slice(0, 8);
}

function requireText_(value, label, maxLength) {
  const text = String(value || "").trim().replace(/\s+/g, " ");
  if (!text) {
    throw clientError_("Please enter " + label + ".");
  }
  if (text.length > maxLength) {
    throw clientError_(label + " is too long.");
  }
  return text;
}

function sanitizeEmail_(value, label) {
  const email = requireText_(value, label, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw clientError_("Please enter a valid " + label + ".");
  }
  return email;
}

function toInteger_(value) {
  const number = Number(value);
  if (!isFinite(number)) {
    return 0;
  }
  return Math.round(number);
}

function toOptionalInteger_(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return toInteger_(value);
}

function isTruthy_(value) {
  if (value === true) {
    return true;
  }
  const text = String(value || "").trim().toLowerCase();
  return text === "true" || text === "yes" || text === "1";
}

function nowIso_() {
  return new Date().toISOString();
}

function clientError_(message) {
  const error = new Error(message);
  error.isPublic = true;
  return error;
}

function publicErrorMessage_(error) {
  if (error && error.isPublic) {
    return error.message;
  }
  return "Something went wrong. Please try again or contact SparkPreneurs.";
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
