const SPREADSHEET_ID = "1p3fnyQ_srxmjI6_yLR9uuboibxZ_UVruw2us9PaiUOc";
const PROGRAM_CODE = "august_september_2026_zumba";
const PROGRAM_NAME = "August-September 2026 - Zumba";
const SCRIPT_VERSION = "2026-08-06-1";
const CURRENCY = "cad";
const STRIPE_API_BASE = "https://api.stripe.com/v1";
const MAX_REQUEST_BYTES = 30000;
const DEFAULT_ENROLLMENT_NOTIFICATION_EMAILS = "sparkpreneurs.ca@gmail.com";

const PRODUCTS_SHEET_NAME = "Products";
const ATTEMPTS_SHEET_NAME = "Checkout Attempts";
const REGISTRATIONS_SHEET_NAME = "Registrations";

const PRODUCT_HEADERS = [
  "programCode", "itemCode", "itemName", "startDate", "endDate",
  "startTime", "endTime", "priceCents", "taxRatePercent", "active", "capacity"
];

const ATTEMPT_HEADERS = [
  "createdAt", "updatedAt", "programCode", "orderId", "stripeSessionId",
  "stripeMode", "status", "selectedItemCodes", "selectedItemNames",
  "subtotalCents", "taxCents", "expectedAmountCents", "studentName",
  "parentName", "parentEmail", "phone", "scheduleChoice", "lastError"
];

const REGISTRATION_HEADERS = ATTEMPT_HEADERS.concat([
  "paidAt", "stripePaymentIntentId", "stripePaymentStatus", "registrationStatus"
]);

const CLASS_TIMES = {
  AUG19_WED_1200: "Wednesday, August 19, 12:00 PM-1:00 PM",
  AUG20_THU_1730: "Thursday, August 20, 5:30 PM-6:30 PM",
  AUG21_FRI_1200: "Friday, August 21, 12:00 PM-1:00 PM",
  AUG22_SAT_1100: "Saturday, August 22, 11:00 AM-12:00 PM",
  AUG25_TUE_1730: "Tuesday, August 25, 5:30 PM-6:30 PM",
  AUG26_WED_1200: "Wednesday, August 26, 12:00 PM-1:00 PM",
  AUG27_THU_1730: "Thursday, August 27, 5:30 PM-6:30 PM",
  AUG28_FRI_1200: "Friday, August 28, 12:00 PM-1:00 PM",
  AUG29_SAT_1100: "Saturday, August 29, 11:00 AM-12:00 PM",
  SEP01_TUE_1730: "Tuesday, September 1, 5:30 PM-6:30 PM",
  SEP02_WED_1200: "Wednesday, September 2, 12:00 PM-1:00 PM",
  SEP03_THU_1730: "Thursday, September 3, 5:30 PM-6:30 PM",
  SEP04_FRI_1200: "Friday, September 4, 12:00 PM-1:00 PM",
  SEP05_SAT_1100: "Saturday, September 5, 11:00 AM-12:00 PM",
  SEP08_TUE_1730: "Tuesday, September 8, 5:30 PM-6:30 PM",
  SEP09_WED_1200: "Wednesday, September 9, 12:00 PM-1:00 PM",
  SEP10_THU_1730: "Thursday, September 10, 5:30 PM-6:30 PM",
  SEP11_FRI_1200: "Friday, September 11, 12:00 PM-1:00 PM",
  SEP12_SAT_1100: "Saturday, September 12, 11:00 AM-12:00 PM",
  SEP15_TUE_1730: "Tuesday, September 15, 5:30 PM-6:30 PM",
  SEP16_WED_1200: "Wednesday, September 16, 12:00 PM-1:00 PM",
  SEP17_THU_1730: "Thursday, September 17, 5:30 PM-6:30 PM",
  SEP18_FRI_1200: "Friday, September 18, 12:00 PM-1:00 PM",
  SEP19_SAT_1100: "Saturday, September 19, 11:00 AM-12:00 PM"
};

const SESSION_COUNTS = {
  ZUMBA_SINGLE: 1,
  ZUMBA_4: 4,
  ZUMBA_8: 8
};

const DEFAULT_PRODUCTS = [
  product_("ZUMBA_SINGLE", "Zumba Single Session", 3500),
  product_("ZUMBA_4", "Zumba Summer Promotion - 4 Sessions", 12000),
  product_("ZUMBA_8", "Zumba Summer Promotion - 8 Sessions", 19000)
];

function product_(itemCode, itemName, priceCents) {
  return {
    programCode: PROGRAM_CODE,
    itemCode: itemCode,
    itemName: itemName,
    startDate: "2026-08-19",
    endDate: "2026-09-19",
    startTime: "",
    endTime: "",
    priceCents: priceCents,
    taxRatePercent: 13,
    active: true,
    capacity: ""
  };
}

function doGet() {
  return jsonResponse_({
    success: true,
    version: SCRIPT_VERSION,
    programCode: PROGRAM_CODE,
    programName: PROGRAM_NAME,
    stripeMode: getStripeMode_()
  });
}

function doPost(event) {
  try {
    const data = parseRequest_(event);
    const action = String(data.action || "").trim();
    assertProgramCode_(data.programCode);

    if (action === "ping") {
      return doGet();
    }
    if (action === "createCheckoutSession") {
      return jsonResponse_(createCheckoutSession_(data));
    }
    if (action === "verifyCheckoutSession") {
      return jsonResponse_(verifyCheckoutSession_(data));
    }
    throw clientError_("Unknown request action.");
  } catch (error) {
    console.error("Zumba registration error: " + String(error && error.message || error));
    return jsonResponse_({
      success: false,
      error: error && error.isPublic
        ? error.message
        : "The registration service could not complete this request."
    });
  }
}

function setupPeriodWorkbook() {
  const spreadsheet = getSpreadsheet_();
  const products = ensureSheet_(spreadsheet, PRODUCTS_SHEET_NAME, PRODUCT_HEADERS);
  ensureSheet_(spreadsheet, ATTEMPTS_SHEET_NAME, ATTEMPT_HEADERS);
  ensureSheet_(spreadsheet, REGISTRATIONS_SHEET_NAME, REGISTRATION_HEADERS);
  seedProductsAdditively_(products);

  return "Zumba workbook is ready with " + DEFAULT_PRODUCTS.length +
    " trusted products for version " + SCRIPT_VERSION + ".";
}

function applySummerPromotionCatalogUpdate() {
  const spreadsheet = getSpreadsheet_();
  const products = ensureSheet_(
    spreadsheet, PRODUCTS_SHEET_NAME, PRODUCT_HEADERS);

  DEFAULT_PRODUCTS.forEach(function(product) {
    upsertByKey_(products, "itemCode", product.itemCode, product);
  });

  if (readByKey_(products, "itemCode", "ZUMBA_7")) {
    upsertByKey_(products, "itemCode", "ZUMBA_7", {
      programCode: PROGRAM_CODE,
      active: false
    });
  }

  return "Summer promotion catalog updated for August 19-September 19: " +
    "$35 single, $120 for 4 sessions, $190 for 8 sessions, and the " +
    "7-session pass is inactive.";
}

function authorizeRequiredServices() {
  setupPeriodWorkbook();
  const config = getStripeConfig_();
  const response = UrlFetchApp.fetch(STRIPE_API_BASE + "/checkout/sessions?limit=1", {
    method: "get",
    headers: { Authorization: "Bearer " + config.key },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error("Stripe authorization failed. Check the active mode and private Script Property.");
  }

  return "Zumba spreadsheet and " + config.mode +
    " Stripe access are authorized for version " + SCRIPT_VERSION + ".";
}

function createCheckoutSession_(data) {
  assertProgramCode_(data.programCode);
  const registration = normalizeRegistration_(data);
  const itemCode = normalizeSingleItemCode_(data.selectedItemCodes || data.items || data.itemCode);
  const pricing = calculateTrustedPricing_(itemCode);
  const selectedClassTimes = normalizeSelectedClassTimes_(
    data.selectedClassTimes, pricing.item.itemCode);
  const displayedAmountCents = normalizeCents_(data.displayedAmountCents, "displayedAmountCents");

  if (displayedAmountCents !== pricing.totalCents) {
    return {
      success: false,
      error: "Amount mismatch",
      expectedAmountCents: pricing.totalCents
    };
  }

  const urls = validateReturnUrls_(data.successUrl, data.cancelUrl);
  const stripeConfig = getStripeConfig_();
  const orderId = "ZUMBA-" +
    Utilities.formatDate(new Date(), "America/Toronto", "yyyyMMdd-HHmmss") +
    "-" + Utilities.getUuid().slice(0, 8);
  const now = new Date().toISOString();
  const attempt = {
    createdAt: now,
    updatedAt: now,
    programCode: PROGRAM_CODE,
    orderId: orderId,
    stripeSessionId: "",
    stripeMode: stripeConfig.mode,
    status: "CREATING_CHECKOUT",
    selectedItemCodes: pricing.item.itemCode,
    selectedItemNames: pricing.item.itemName,
    subtotalCents: pricing.subtotalCents,
    taxCents: pricing.taxCents,
    expectedAmountCents: pricing.totalCents,
    studentName: registration.studentName,
    parentName: registration.parentName,
    parentEmail: registration.parentEmail,
    phone: registration.phone,
    scheduleChoice: selectedClassTimes.map(function(code) {
      return CLASS_TIMES[code];
    }).join(" | "),
    lastError: ""
  };

  withLock_(function() {
    upsertByKey_(requireSheet_(getSpreadsheet_(), ATTEMPTS_SHEET_NAME),
      "orderId", orderId, attempt);
  });

  try {
    const session = createStripeSession_(attempt, pricing, urls, stripeConfig);
    attempt.stripeSessionId = sanitizeSessionId_(session.id, stripeConfig.mode);
    attempt.status = "CHECKOUT_CREATED";
    attempt.updatedAt = new Date().toISOString();
    withLock_(function() {
      upsertByKey_(requireSheet_(getSpreadsheet_(), ATTEMPTS_SHEET_NAME),
        "orderId", orderId, attempt);
    });

    return {
      success: true,
      checkoutUrl: session.url,
      stripeSessionId: session.id,
      expectedAmountCents: pricing.totalCents
    };
  } catch (error) {
    attempt.status = "CHECKOUT_FAILED";
    attempt.updatedAt = new Date().toISOString();
    attempt.lastError = "Stripe Checkout could not be created.";
    withLock_(function() {
      upsertByKey_(requireSheet_(getSpreadsheet_(), ATTEMPTS_SHEET_NAME),
        "orderId", orderId, attempt);
    });
    throw error;
  }
}

function verifyCheckoutSession_(data) {
  const config = getStripeConfig_();
  const sessionId = sanitizeSessionId_(
    data.stripeSessionId || data.sessionId, config.mode);
  const session = stripeRequest_("get",
    "/checkout/sessions/" + encodeURIComponent(sessionId), null, config);

  if (session.payment_status !== "paid") {
    return {
      success: true,
      paid: false,
      paymentStatus: session.payment_status || "unpaid"
    };
  }

  return withLock_(function() {
    const spreadsheet = getSpreadsheet_();
    const attempts = requireSheet_(spreadsheet, ATTEMPTS_SHEET_NAME);
    const registrations = requireSheet_(spreadsheet, REGISTRATIONS_SHEET_NAME);
    const attempt = readByKey_(attempts, "stripeSessionId", sessionId);

    if (!attempt) {
      throw new Error("A matching checkout attempt was not found.");
    }

    verifyPaidSession_(session, attempt, config.mode);
    const existing = readByKey_(registrations, "stripeSessionId", sessionId);

    if (existing && String(existing.registrationStatus) === "PAID_VERIFIED") {
      return {
        success: true,
        paid: true,
        paymentStatus: "paid",
        alreadyRecorded: true
      };
    }

    const paidAt = new Date().toISOString();
    const registration = Object.assign({}, attempt, {
      updatedAt: paidAt,
      status: "PAID_VERIFIED",
      paidAt: paidAt,
      stripePaymentIntentId: safeText_(session.payment_intent || "", 120),
      stripePaymentStatus: "paid",
      registrationStatus: "PAID_VERIFIED",
      lastError: ""
    });
    upsertByKey_(registrations, "stripeSessionId", sessionId, registration);
    upsertByKey_(attempts, "stripeSessionId", sessionId, {
      updatedAt: paidAt,
      status: "PAID_VERIFIED",
      lastError: ""
    });
    sendEnrollmentNotificationSafely_(registration, paidAt);

    return {
      success: true,
      paid: true,
      paymentStatus: "paid",
      alreadyRecorded: false
    };
  });
}

function createStripeSession_(attempt, pricing, urls, config) {
  const params = {
    mode: "payment",
    success_url: addSessionPlaceholder_(urls.successUrl),
    cancel_url: urls.cancelUrl,
    customer_email: attempt.parentEmail,
    client_reference_id: attempt.orderId,
    "metadata[programCode]": PROGRAM_CODE,
    "metadata[orderId]": attempt.orderId,
    "metadata[itemCode]": pricing.item.itemCode,
    "metadata[expectedAmountCents]": String(pricing.totalCents),
    "payment_intent_data[metadata][programCode]": PROGRAM_CODE,
    "payment_intent_data[metadata][orderId]": attempt.orderId,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": CURRENCY,
    "line_items[0][price_data][unit_amount]": String(pricing.totalCents),
    "line_items[0][price_data][product_data][name]": pricing.item.itemName,
    "line_items[0][price_data][product_data][metadata][programCode]": PROGRAM_CODE,
    "line_items[0][price_data][product_data][metadata][itemCode]": pricing.item.itemCode
  };

  const session = stripeRequest_("post", "/checkout/sessions", params, config);
  if (!session || !session.id || !session.url ||
      !/^https:\/\/checkout\.stripe\.com\//.test(session.url)) {
    throw new Error("Stripe did not return a usable Checkout Session.");
  }
  return session;
}

function calculateTrustedPricing_(itemCode) {
  const products = readActiveProducts_();
  const item = products[itemCode];
  if (!item) {
    throw clientError_("The selected Zumba option is no longer available.");
  }
  if (item.capacity !== null &&
      countPaidRegistrationsForItem_(itemCode) >= item.capacity) {
    throw clientError_("The selected Zumba option is fully booked.");
  }

  const taxCents = Math.round(item.priceCents * item.taxRatePercent / 100);
  return {
    item: item,
    subtotalCents: item.priceCents,
    taxCents: taxCents,
    totalCents: item.priceCents + taxCents
  };
}

function readActiveProducts_() {
  const rows = readRecords_(requireSheet_(getSpreadsheet_(), PRODUCTS_SHEET_NAME));
  const products = {};
  rows.forEach(function(row) {
    const itemCode = String(row.itemCode || "").trim().toUpperCase();
    if (String(row.programCode || "").trim() !== PROGRAM_CODE ||
        !itemCode || !isTruthy_(row.active)) {
      return;
    }
    const capacityText = String(
      row.capacity === undefined ? "" : row.capacity).trim();
    products[itemCode] = {
      itemCode: itemCode,
      itemName: safeText_(row.itemName, 180),
      priceCents: normalizeCents_(row.priceCents,
        "priceCents for " + itemCode),
      taxRatePercent: normalizeTaxRate_(row.taxRatePercent),
      capacity: capacityText === ""
        ? null
        : normalizeNonNegativeInteger_(row.capacity, "capacity")
    };
  });
  return products;
}

function normalizeRegistration_(data) {
  return {
    studentName: requireText_(data.studentName, "participant name", 100),
    parentName: requireText_(data.parentName, "contact name", 100),
    parentEmail: sanitizeEmail_(data.parentEmail),
    phone: requireText_(data.phone, "phone", 40)
  };
}

function normalizeSingleItemCode_(value) {
  let codes = [];
  if (Array.isArray(value)) {
    codes = value.map(function(item) {
      return typeof item === "object" && item !== null
        ? String(item.itemCode || item.code || "").trim().toUpperCase()
        : String(item || "").trim().toUpperCase();
    }).filter(Boolean);
  } else if (typeof value === "string") {
    codes = value.split(",").map(function(item) {
      return item.trim().toUpperCase();
    }).filter(Boolean);
  }

  if (codes.length !== 1 || !/^[A-Z0-9_-]+$/.test(codes[0])) {
    throw clientError_("Please choose one Zumba registration option.");
  }
  return codes[0];
}

function normalizeSelectedClassTimes_(value, itemCode) {
  const expectedCount = SESSION_COUNTS[itemCode];
  if (!expectedCount) {
    throw clientError_("The selected Zumba option is no longer available.");
  }
  if (!Array.isArray(value) || value.length !== expectedCount) {
    throw clientError_(
      "Choose exactly " + expectedCount + " class time" +
      (expectedCount === 1 ? "." : "s."));
  }

  const classTimes = value.map(function(item) {
    return String(item || "").trim().toUpperCase();
  });
  const unique = {};
  classTimes.forEach(function(code) {
    if (!/^[A-Z0-9_]+$/.test(code) || !CLASS_TIMES[code] ||
        !isAvailableClassTime_(code)) {
      throw clientError_("One or more selected class times are not available.");
    }
    if (unique[code]) {
      throw clientError_("Choose each class time only once.");
    }
    unique[code] = true;
  });
  return classTimes;
}

function isAvailableClassTime_(code) {
  return Boolean(CLASS_TIMES[String(code || "").trim().toUpperCase()]);
}

function verifyPaidSession_(session, attempt, mode) {
  const metadata = session.metadata || {};
  sanitizeSessionId_(session.id, mode);
  if (session.payment_status !== "paid") {
    throw new Error("Stripe did not report a paid session.");
  }
  if (String(session.currency || "").toLowerCase() !== CURRENCY) {
    throw new Error("Stripe currency does not match.");
  }
  if (Number(session.amount_total) !== Number(attempt.expectedAmountCents)) {
    throw new Error("Stripe amount does not match.");
  }
  if (String(session.client_reference_id || "") !== String(attempt.orderId)) {
    throw new Error("Stripe order reference does not match.");
  }
  if (String(metadata.programCode || "") !== PROGRAM_CODE ||
      String(metadata.orderId || "") !== String(attempt.orderId) ||
      String(metadata.itemCode || "") !== String(attempt.selectedItemCodes) ||
      Number(metadata.expectedAmountCents) !== Number(attempt.expectedAmountCents)) {
    throw new Error("Stripe metadata does not match this registration.");
  }
}

function validateReturnUrls_(successValue, cancelValue) {
  return {
    successUrl: validateReturnUrl_(successValue),
    cancelUrl: validateReturnUrl_(cancelValue)
  };
}

function validateReturnUrl_(value) {
  const url = requireText_(value, "return URL", 500);
  const match = url.match(/^https:\/\/([^\/?#]+)(\/[^?#]*)?/i);
  if (!match) {
    throw clientError_("Checkout return URL is not allowed.");
  }
  const host = match[1].toLowerCase();
  const path = match[2] || "/";
  const allowedHost = host === "sparkpreneurs.ca" ||
    host === "www.sparkpreneurs.ca";
  const allowedPath = path === "/zumba/" ||
    path === "/zumba/index.html" ||
    path === "/";
  if (!allowedHost || !allowedPath) {
    throw clientError_("Checkout return URL is not allowed.");
  }
  return url;
}

function addSessionPlaceholder_(url) {
  if (url.indexOf("{CHECKOUT_SESSION_ID}") !== -1) {
    return url;
  }
  return url + (url.indexOf("?") === -1 ? "?" : "&") +
    "session_id={CHECKOUT_SESSION_ID}";
}

function seedProductsAdditively_(sheet) {
  const existing = {};
  readRecords_(sheet).forEach(function(row) {
    if (row.programCode === PROGRAM_CODE && row.itemCode) {
      existing[String(row.itemCode).trim().toUpperCase()] = true;
    }
  });
  DEFAULT_PRODUCTS.forEach(function(product) {
    if (!existing[product.itemCode]) {
      appendRecord_(sheet, product);
    }
  });
}

function countPaidRegistrationsForItem_(itemCode) {
  return readRecords_(
    requireSheet_(getSpreadsheet_(), REGISTRATIONS_SHEET_NAME))
    .filter(function(row) {
      const paid = String(row.registrationStatus || "") === "PAID_VERIFIED" ||
        String(row.status || "") === "PAID_VERIFIED";
      return paid && String(row.selectedItemCodes || "")
        .split(",").map(function(code) {
          return code.trim();
        }).indexOf(itemCode) !== -1;
    }).length;
}

function ensureSheet_(spreadsheet, name, requiredHeaders) {
  const sheet = spreadsheet.getSheetByName(name) ||
    spreadsheet.insertSheet(name);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  let headers = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
      .map(function(value) { return String(value).trim(); })
    : [];
  if (!headers.some(function(header) { return header !== ""; })) {
    headers = [];
  }
  requiredHeaders.forEach(function(header) {
    if (headers.indexOf(header) === -1) {
      headers.push(header);
    }
  });
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function requireSheet_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    throw new Error(name + " sheet is missing. Run setupPeriodWorkbook first.");
  }
  return sheet;
}

function readRecords_(sheet) {
  if (sheet.getLastRow() < 2) {
    return [];
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0].map(function(value) {
      return String(value).trim();
    });
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length)
    .getValues().map(function(row) {
      const record = {};
      headers.forEach(function(header, index) {
        if (header) {
          record[header] = row[index];
        }
      });
      return record;
    });
}

function appendRecord_(sheet, record) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0].map(function(value) {
      return String(value).trim();
    });
  sheet.appendRow(headers.map(function(header) {
    return neutralizeFormula_(record[header]);
  }));
}

function upsertByKey_(sheet, keyName, keyValue, record) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0].map(function(value) {
      return String(value).trim();
    });
  const keyIndex = headers.indexOf(keyName);
  if (keyIndex === -1) {
    throw new Error("Required key column is missing.");
  }

  let rowNumber = 0;
  if (sheet.getLastRow() > 1) {
    const values = sheet.getRange(
      2, keyIndex + 1, sheet.getLastRow() - 1, 1).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0]) === String(keyValue)) {
        rowNumber = i + 2;
        break;
      }
    }
  }

  if (!rowNumber) {
    const newRecord = Object.assign({}, record);
    newRecord[keyName] = keyValue;
    appendRecord_(sheet, newRecord);
    return;
  }

  const row = sheet.getRange(rowNumber, 1, 1, headers.length)
    .getValues()[0];
  headers.forEach(function(header, index) {
    if (Object.prototype.hasOwnProperty.call(record, header)) {
      row[index] = neutralizeFormula_(record[header]);
    }
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
}

function readByKey_(sheet, keyName, keyValue) {
  const records = readRecords_(sheet);
  for (let i = records.length - 1; i >= 0; i--) {
    if (String(records[i][keyName] || "") === String(keyValue)) {
      return records[i];
    }
  }
  return null;
}

function stripeRequest_(method, path, params, config) {
  const query = formEncode_(params || {});
  const url = STRIPE_API_BASE + path +
    (method === "get" && query ? "?" + query : "");
  const options = {
    method: method,
    headers: { Authorization: "Bearer " + config.key },
    muteHttpExceptions: true
  };
  if (method === "post") {
    options.payload = query;
    options.contentType = "application/x-www-form-urlencoded";
  }
  const response = UrlFetchApp.fetch(url, options);
  const parsed = JSON.parse(response.getContentText() || "{}");
  if (response.getResponseCode() < 200 ||
      response.getResponseCode() >= 300) {
    throw clientError_(parsed && parsed.error && parsed.error.message
      ? parsed.error.message
      : "Stripe request failed.");
  }
  return parsed;
}

function getStripeConfig_() {
  const mode = getStripeMode_();
  const keyName = mode === "live"
    ? "STRIPE_SECRET_KEY_LIVE"
    : "STRIPE_SECRET_KEY_TEST";
  const key = String(
    PropertiesService.getScriptProperties().getProperty(keyName) || "")
    .trim();
  const expectedPrefix = mode === "live" ? "sk_live_" : "sk_test_";
  if (!key || key.indexOf(expectedPrefix) !== 0) {
    throw clientError_("Stripe is not configured for " + mode + " mode.");
  }
  return { mode: mode, key: key };
}

function getStripeMode_() {
  const mode = String(PropertiesService.getScriptProperties()
    .getProperty("STRIPE_MODE") || "test").trim().toLowerCase();
  return mode === "live" ? "live" : "test";
}

function parseRequest_(event) {
  const body = event && event.postData && event.postData.contents
    ? event.postData.contents
    : "";
  if (!body) {
    throw clientError_("Request body is required.");
  }
  if (body.length > MAX_REQUEST_BYTES) {
    throw clientError_("Request is too large.");
  }
  try {
    return JSON.parse(body);
  } catch (error) {
    throw clientError_("Request body is not valid JSON.");
  }
}

function assertProgramCode_(value) {
  if (String(value || "").trim() !== PROGRAM_CODE) {
    throw clientError_("Program code does not match this checkout.");
  }
}

function normalizeCents_(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 ||
      number > 100000000) {
    throw clientError_(label + " is not valid.");
  }
  return number;
}

function normalizeNonNegativeInteger_(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(label + " must be a non-negative integer.");
  }
  return number;
}

function normalizeTaxRate_(value) {
  const number = Number(value || 0);
  if (!isFinite(number) || number < 0 || number > 100) {
    throw new Error("Tax rate is not valid.");
  }
  return number;
}

function requireText_(value, label, maxLength) {
  const text = safeText_(value, maxLength);
  if (!text) {
    throw clientError_("Please enter " + label + ".");
  }
  return text;
}

function safeText_(value, maxLength) {
  const text = String(
    value === undefined || value === null ? "" : value)
    .trim().replace(/\s+/g, " ");
  if (text.length > maxLength) {
    throw clientError_("Entered information is too long.");
  }
  return neutralizeFormula_(text);
}

function sanitizeEmail_(value) {
  const email = requireText_(value, "contact email", 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw clientError_("Please enter a valid contact email.");
  }
  return email;
}

function sanitizeSessionId_(value, mode) {
  const id = safeText_(value, 120);
  const expected = mode === "live"
    ? /^cs_live_[A-Za-z0-9_]+$/
    : /^cs_test_[A-Za-z0-9_]+$/;
  if (!expected.test(id)) {
    throw clientError_("Checkout session is not valid.");
  }
  return id;
}

function neutralizeFormula_(value) {
  if (typeof value !== "string") {
    return value === undefined ? "" : value;
  }
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function formEncode_(params) {
  return Object.keys(params).map(function(key) {
    return encodeURIComponent(key) + "=" +
      encodeURIComponent(String(params[key]));
  }).join("&");
}

function isTruthy_(value) {
  if (value === true) {
    return true;
  }
  const text = String(value || "").trim().toLowerCase();
  return text === "true" || text === "yes" || text === "1";
}

function withLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function clientError_(message) {
  const error = new Error(message);
  error.isPublic = true;
  return error;
}

function sendEnrollmentNotificationSafely_(registration, paidAt) {
  try {
    sendEnrollmentNotification_({
      programName: PROGRAM_NAME,
      participantName: registration.studentName,
      contactName: registration.parentName,
      contactEmail: registration.parentEmail,
      phone: registration.phone,
      selectedItemNames: registration.selectedItemNames,
      scheduleChoice: registration.scheduleChoice,
      amountCents: registration.expectedAmountCents,
      paidAt: paidAt,
      orderId: registration.orderId,
      stripeSessionId: registration.stripeSessionId
    });
  } catch (error) {
    console.log("Zumba enrollment email failed: " + String(error && error.message ? error.message : error));
  }
}

function sendEnrollmentNotification_(details) {
  const recipients = getEnrollmentNotificationRecipients_();
  if (!recipients) return;

  const body = [
    "A new paid registration was received.",
    "",
    "Program: " + String(details.programName || PROGRAM_NAME),
    "Participant: " + String(details.participantName || ""),
    "Contact: " + String(details.contactName || ""),
    "Email: " + String(details.contactEmail || ""),
    "Phone: " + String(details.phone || ""),
    "Selection: " + String(details.selectedItemNames || ""),
    "Class times: " + String(details.scheduleChoice || ""),
    "Amount paid: " + formatMoneyCents_(details.amountCents),
    "Paid at: " + String(details.paidAt || ""),
    "Order ID: " + String(details.orderId || ""),
    "Stripe session ID: " + String(details.stripeSessionId || "")
  ].join("\n");

  const message = {
    to: recipients,
    subject: "New paid registration: " + String(details.programName || PROGRAM_NAME),
    body: body
  };

  if (String(details.contactEmail || "").trim()) {
    message.replyTo = String(details.contactEmail).trim();
  }

  MailApp.sendEmail(message);
}

function getEnrollmentNotificationRecipients_() {
  return String(
    PropertiesService.getScriptProperties().getProperty("ENROLLMENT_NOTIFICATION_EMAILS") ||
    DEFAULT_ENROLLMENT_NOTIFICATION_EMAILS
  ).trim();
}

function formatMoneyCents_(value) {
  return "CAD $" + (Number(value || 0) / 100).toFixed(2);
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
