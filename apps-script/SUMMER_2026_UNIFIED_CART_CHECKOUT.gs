const SPREADSHEET_ID = "1p7PlK3wy4JEiJJSq6cL8cXmYk6JhN5jFk1xd21IhiyA";
const PROGRAM_CODE = "summer_2026_unified_cart_checkout";
const PROGRAM_NAME = "Summer 2026 - Unified Cart Checkout";
const SCRIPT_VERSION = "2026-08-15-3";
const CURRENCY = "cad";
const STRIPE_API_BASE = "https://api.stripe.com/v1";
const MAX_REQUEST_BYTES = 50000;
const DEFAULT_ENROLLMENT_NOTIFICATION_EMAILS = "sparkpreneurs.ca@gmail.com";

const PRODUCTS_SHEET_NAME = "Products";
const ATTEMPTS_SHEET_NAME = "Checkout Attempts";
const REGISTRATIONS_SHEET_NAME = "Registrations";

const PROGRAMS = {
  summer2026_4_10_sessions: {
    name: "Summer Camp",
    spreadsheetId: "1xCdl23sViHWcP9Zq6Zu_cpHxpZTinyy11R1qZZOCobo"
  },
  after_school_program: {
    name: "After School",
    spreadsheetId: "1ptQXLvpebEHRiENXX-Sr5c7WE4r5MURd2MIMc95jBpk"
  },
  adult_hand_building_pottery: {
    name: "Hand-Building Pottery",
    spreadsheetId: "13EdVfWfHS3rBctFPeHo8lDwBnL67ZbkaBuJh2T1JVXM"
  }
};

const CLOSED_SUMMER_ITEM_CODES = {
  W5AM: true,
  W5PM: true,
  W6AM: true,
  W6PM: true
};

const PRODUCT_HEADERS = [
  "programCode", "itemCode", "itemName", "startDate", "endDate",
  "startTime", "endTime", "priceCents", "taxRatePercent", "active", "capacity"
];

const ATTEMPT_HEADERS = [
  "createdAt", "updatedAt", "programCode", "orderId", "stripeSessionId",
  "stripeMode", "status", "selectedItemCodes", "selectedItemNames",
  "subtotalCents", "taxCents", "expectedAmountCents", "studentName",
  "parentName", "parentEmail", "phone", "selectedItemsJson",
  "registrationPayloadJson", "lastError"
];

const REGISTRATION_HEADERS = ATTEMPT_HEADERS.concat([
  "paidAt", "stripePaymentIntentId", "stripePaymentStatus", "registrationStatus"
]);

const DEFAULT_PRODUCTS = [
  product_("summer2026_4_10_sessions", "W5AM", "Week 5 Morning: Fashion Week", "2026-08-04", "2026-08-07", "10 AM", "12 PM", 8400),
  product_("summer2026_4_10_sessions", "W5PM", "Week 5 Afternoon: Fashion Week", "2026-08-04", "2026-08-07", "1 PM", "3 PM", 8400),
  product_("summer2026_4_10_sessions", "W6AM", "Week 6 Morning: Young Chef Creations 2", "2026-08-10", "2026-08-14", "10 AM", "12 PM", 10500),
  product_("summer2026_4_10_sessions", "W6PM", "Week 6 Afternoon: Young Chef Creations 2", "2026-08-10", "2026-08-14", "1 PM", "3 PM", 10500),
  product_("summer2026_4_10_sessions", "W7AM", "Week 7 Morning: 3D Storybook Makers", "2026-08-17", "2026-08-21", "10 AM", "12 PM", 10500),
  product_("summer2026_4_10_sessions", "W7PM", "Week 7 Afternoon: 3D Storybook Makers", "2026-08-17", "2026-08-21", "1 PM", "3 PM", 10500),
  product_("summer2026_4_10_sessions", "W8AM", "Week 8 Morning: Dream House Designers", "2026-08-24", "2026-08-28", "10 AM", "12 PM", 10500),
  product_("summer2026_4_10_sessions", "W8PM", "Week 8 Afternoon: Dream House Designers", "2026-08-24", "2026-08-28", "1 PM", "3 PM", 10500),
  product_("after_school_program", "AFTER3", "After School Program: 3 days/week", "", "", "3 PM", "5 PM", 7200),
  product_("after_school_program", "AFTER4", "After School Program: 4 days/week", "", "", "3 PM", "5 PM", 8800),
  product_("after_school_program", "AFTER5", "After School Program: 5 days/week", "", "", "3 PM", "5 PM", 10000),
  product_("adult_hand_building_pottery", "HB4SUN", "Hand-Building Pottery: 4 Sunday Sessions", "", "", "10:30 AM", "12:30 PM", 24000)
];

function product_(programCode, itemCode, itemName, startDate, endDate, startTime, endTime, priceCents) {
  return {
    programCode: programCode,
    itemCode: itemCode,
    itemName: itemName,
    startDate: startDate,
    endDate: endDate,
    startTime: startTime,
    endTime: endTime,
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
    programs: Object.keys(PROGRAMS),
    stripeMode: getStripeMode_()
  });
}

function doPost(event) {
  try {
    const data = parseRequest_(event);
    const action = String(data.action || "").trim();

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
    console.error("Unified checkout error: " + String(error && error.message || error));
    return jsonResponse_({
      success: false,
      error: error && error.isPublic ? error.message : "The registration service could not complete this request."
    });
  }
}

function setupPeriodWorkbook() {
  const spreadsheet = getSpreadsheet_();
  const products = ensureSheet_(spreadsheet, PRODUCTS_SHEET_NAME, PRODUCT_HEADERS);
  ensureSheet_(spreadsheet, ATTEMPTS_SHEET_NAME, ATTEMPT_HEADERS);
  ensureSheet_(spreadsheet, REGISTRATIONS_SHEET_NAME, REGISTRATION_HEADERS);
  seedProductsAdditively_(products);

  Object.keys(PROGRAMS).forEach(function(programCode) {
    ensureDestinationRegistrationSheet_(programCode);
  });

  return "Unified cart workbook is ready with " + DEFAULT_PRODUCTS.length + " trusted products for version " + SCRIPT_VERSION + ".";
}

function authorizeRequiredServices() {
  setupPeriodWorkbook();
  Object.keys(PROGRAMS).forEach(function(programCode) {
    SpreadsheetApp.openById(PROGRAMS[programCode].spreadsheetId).getName();
  });

  const config = getStripeConfig_();
  const response = UrlFetchApp.fetch(STRIPE_API_BASE + "/checkout/sessions?limit=1", {
    method: "get",
    headers: { Authorization: "Bearer " + config.key },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error("Stripe authorization failed. Check the active Stripe mode and private Script Property.");
  }

  return "All three program spreadsheets and " + config.mode + " Stripe access are authorized for version " + SCRIPT_VERSION + ".";
}

function createCheckoutSession_(data) {
  assertProgramCode_(data.programCode);
  const selected = normalizeSelectedItems_(data.items || data.selectedItems);
  const registrations = normalizeRegistrations_(data.registrations, selected);
  const pricing = calculateTrustedPricing_(selected);
  const displayedAmountCents = normalizeCents_(data.displayedAmountCents, "displayedAmountCents");

  if (displayedAmountCents !== pricing.totalCents) {
    return { success: false, error: "Amount mismatch", expectedAmountCents: pricing.totalCents };
  }

  const urls = validateReturnUrls_(data.successUrl, data.cancelUrl);
  const stripeConfig = getStripeConfig_();
  const orderId = "CART-" + Utilities.formatDate(new Date(), "America/Toronto", "yyyyMMdd-HHmmss") + "-" + Utilities.getUuid().slice(0, 8);
  const now = new Date().toISOString();
  const primaryRegistration = registrations[pricing.items[0].programCode];
  const attempt = {
    createdAt: now,
    updatedAt: now,
    programCode: PROGRAM_CODE,
    orderId: orderId,
    stripeSessionId: "",
    stripeMode: stripeConfig.mode,
    status: "CREATING_CHECKOUT",
    selectedItemCodes: pricing.items.map(itemKey_).join(","),
    selectedItemNames: pricing.items.map(function(item) { return item.itemName; }).join(" | "),
    subtotalCents: pricing.subtotalCents,
    taxCents: pricing.taxCents,
    expectedAmountCents: pricing.totalCents,
    studentName: primaryRegistration.studentName,
    parentName: primaryRegistration.parentName,
    parentEmail: primaryRegistration.parentEmail,
    phone: primaryRegistration.phone,
    selectedItemsJson: safeJson_(pricing.items),
    registrationPayloadJson: safeJson_(registrations),
    lastError: ""
  };

  withLock_(function() {
    upsertByKey_(requireSheet_(getSpreadsheet_(), ATTEMPTS_SHEET_NAME), "orderId", orderId, attempt);
  });

  try {
    const session = createStripeSession_(attempt, pricing, urls, stripeConfig);
    attempt.stripeSessionId = sanitizeSessionId_(session.id, stripeConfig.mode);
    attempt.status = "CHECKOUT_CREATED";
    attempt.updatedAt = new Date().toISOString();
    withLock_(function() {
      upsertByKey_(requireSheet_(getSpreadsheet_(), ATTEMPTS_SHEET_NAME), "orderId", orderId, attempt);
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
      upsertByKey_(requireSheet_(getSpreadsheet_(), ATTEMPTS_SHEET_NAME), "orderId", orderId, attempt);
    });
    throw error;
  }
}

function verifyCheckoutSession_(data) {
  const config = getStripeConfig_();
  const sessionId = sanitizeSessionId_(data.stripeSessionId || data.sessionId, config.mode);
  const session = stripeRequest_("get", "/checkout/sessions/" + encodeURIComponent(sessionId), null, config);

  if (session.payment_status !== "paid") {
    return { success: true, paid: false, paymentStatus: session.payment_status || "unpaid" };
  }

  return withLock_(function() {
    const central = getSpreadsheet_();
    const attempts = requireSheet_(central, ATTEMPTS_SHEET_NAME);
    const registrationsSheet = requireSheet_(central, REGISTRATIONS_SHEET_NAME);
    const attempt = readByKey_(attempts, "stripeSessionId", sessionId);
    if (!attempt) {
      throw new Error("A matching checkout attempt was not found.");
    }

    verifyPaidSession_(session, attempt, config.mode);
    const existing = readByKey_(registrationsSheet, "stripeSessionId", sessionId);
    if (existing && String(existing.registrationStatus) === "PAID_VERIFIED") {
      return { success: true, paid: true, paymentStatus: "paid", alreadyRecorded: true };
    }

    const items = normalizeStoredPaidItems_(parseStoredJson_(attempt.selectedItemsJson, "selected items"));
    const registrationPayload = parseStoredJson_(attempt.registrationPayloadJson, "registration details");
    const paidAt = new Date().toISOString();
    writeDestinationRegistrations_(session, attempt, items, registrationPayload, paidAt);

    const paidRegistration = Object.assign({}, attempt, {
      updatedAt: paidAt,
      status: "PAID_VERIFIED",
      paidAt: paidAt,
      stripePaymentIntentId: safeText_(session.payment_intent || "", 120),
      stripePaymentStatus: "paid",
      registrationStatus: "PAID_VERIFIED",
      lastError: ""
    });
    upsertByKey_(registrationsSheet, "stripeSessionId", sessionId, paidRegistration);
    upsertByKey_(attempts, "stripeSessionId", sessionId, {
      updatedAt: paidAt,
      status: "PAID_VERIFIED",
      lastError: ""
    });

    return { success: true, paid: true, paymentStatus: "paid", alreadyRecorded: false };
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
    "metadata[expectedAmountCents]": String(pricing.totalCents),
    "metadata[cartFingerprint]": cartFingerprint_(attempt.selectedItemCodes),
    "payment_intent_data[metadata][programCode]": PROGRAM_CODE,
    "payment_intent_data[metadata][orderId]": attempt.orderId
  };

  pricing.items.forEach(function(item, index) {
    params["line_items[" + index + "][quantity]"] = "1";
    params["line_items[" + index + "][price_data][currency]"] = CURRENCY;
    params["line_items[" + index + "][price_data][unit_amount]"] = String(item.totalCents);
    params["line_items[" + index + "][price_data][product_data][name]"] = PROGRAMS[item.programCode].name + ": " + item.itemName;
    params["line_items[" + index + "][price_data][product_data][metadata][programCode]"] = item.programCode;
    params["line_items[" + index + "][price_data][product_data][metadata][itemCode]"] = item.itemCode;
  });

  const session = stripeRequest_("post", "/checkout/sessions", params, config);
  if (!session || !session.id || !session.url || !/^https:\/\/checkout\.stripe\.com\//.test(session.url)) {
    throw new Error("Stripe did not return a usable Checkout Session.");
  }
  return session;
}

function calculateTrustedPricing_(selected) {
  const activeProducts = readActiveProducts_();
  const seen = {};
  const items = selected.map(function(selection) {
    const key = itemKey_(selection);
    if (seen[key]) throw clientError_("Duplicate cart item.");
    seen[key] = true;
    const product = activeProducts[key];
    if (!product) throw clientError_("A selected item is no longer available.");
    if (product.capacity !== null && countDestinationRegistrations_(product.programCode, product.itemCode) >= product.capacity) {
      throw clientError_(product.itemName + " is fully booked.");
    }
    const subtotalCents = product.priceCents;
    const taxCents = Math.round(subtotalCents * product.taxRatePercent / 100);
    return Object.assign({}, product, { subtotalCents: subtotalCents, taxCents: taxCents, totalCents: subtotalCents + taxCents });
  });

  const afterSchoolCount = items.filter(function(item) { return item.programCode === "after_school_program"; }).length;
  if (afterSchoolCount > 1) throw clientError_("Choose only one After School weekly option.");

  return {
    items: items,
    subtotalCents: items.reduce(function(total, item) { return total + item.subtotalCents; }, 0),
    taxCents: items.reduce(function(total, item) { return total + item.taxCents; }, 0),
    totalCents: items.reduce(function(total, item) { return total + item.totalCents; }, 0)
  };
}

function readActiveProducts_() {
  const rows = readRecords_(requireSheet_(getSpreadsheet_(), PRODUCTS_SHEET_NAME));
  const products = {};
  rows.forEach(function(row) {
    const programCode = safeText_(row.programCode, 80);
    const itemCode = safeText_(row.itemCode, 40).toUpperCase();
    if (!PROGRAMS[programCode] || !itemCode || CLOSED_SUMMER_ITEM_CODES[itemCode] || !isTruthy_(row.active)) return;
    const capacityText = String(row.capacity === undefined ? "" : row.capacity).trim();
    const capacity = capacityText === "" ? null : normalizeNonNegativeInteger_(row.capacity, "capacity");
    products[itemKey_({ programCode: programCode, itemCode: itemCode })] = {
      programCode: programCode,
      itemCode: itemCode,
      itemName: safeText_(row.itemName, 180),
      priceCents: normalizeCents_(row.priceCents, "priceCents"),
      taxRatePercent: normalizeTaxRate_(row.taxRatePercent),
      capacity: capacity
    };
  });
  return products;
}

function normalizeSelectedItems_(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw clientError_("Choose between 1 and 20 cart items.");
  }
  return value.map(function(item) {
    if (!item || typeof item !== "object") throw clientError_("Cart item is not valid.");
    const programCode = safeText_(item.programCode, 80);
    const itemCode = safeText_(item.itemCode || item.code, 40).toUpperCase();
    if (!PROGRAMS[programCode] || !/^[A-Z0-9_-]+$/.test(itemCode)) throw clientError_("Cart item is not valid.");
    return { programCode: programCode, itemCode: itemCode };
  });
}

function normalizeRegistrations_(value, selected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw clientError_("Registration details are required for each selected program.");
  }
  const neededPrograms = {};
  selected.forEach(function(item) { neededPrograms[item.programCode] = true; });
  const result = {};
  Object.keys(neededPrograms).forEach(function(programCode) {
    const registration = value[programCode];
    if (!registration || typeof registration !== "object") throw clientError_("Registration details are missing for " + PROGRAMS[programCode].name + ".");
    result[programCode] = {
      studentName: requireText_(registration.studentName, "participant name for " + PROGRAMS[programCode].name, 100),
      parentName: requireText_(registration.parentName, "contact name for " + PROGRAMS[programCode].name, 100),
      parentEmail: sanitizeEmail_(registration.parentEmail),
      phone: requireText_(registration.phone, "phone for " + PROGRAMS[programCode].name, 40)
    };
  });
  return result;
}

function writeDestinationRegistrations_(session, attempt, items, registrations, paidAt) {
  Object.keys(registrations).forEach(function(programCode) {
    const programItems = items.filter(function(item) { return item.programCode === programCode; });
    if (!programItems.length) return;
    const trusted = {
      items: programItems,
      subtotalCents: programItems.reduce(function(total, item) { return total + item.subtotalCents; }, 0),
      taxCents: programItems.reduce(function(total, item) { return total + item.taxCents; }, 0),
      totalCents: programItems.reduce(function(total, item) { return total + item.totalCents; }, 0)
    };
    const contact = registrations[programCode];
    const record = Object.assign({}, contact, {
      createdAt: attempt.createdAt,
      updatedAt: paidAt,
      programCode: programCode,
      orderId: attempt.orderId,
      stripeSessionId: session.id,
      stripeMode: attempt.stripeMode,
      status: "PAID_VERIFIED",
      selectedItemCodes: trusted.items.map(function(item) { return item.itemCode; }).join(","),
      selectedItemNames: trusted.items.map(function(item) { return item.itemName; }).join(" | "),
      subtotalCents: trusted.subtotalCents,
      taxCents: trusted.taxCents,
      expectedAmountCents: trusted.totalCents,
      selectedItemsJson: safeJson_(programItems),
      registrationPayloadJson: "",
      lastError: "",
      paidAt: paidAt,
      stripePaymentIntentId: safeText_(session.payment_intent || "", 120),
      stripePaymentStatus: "paid",
      registrationStatus: "PAID_VERIFIED"
    });
    const destinationSheet = ensureDestinationRegistrationSheet_(programCode);
    const existing = readByKey_(destinationSheet, "stripeSessionId", session.id);
    upsertByKey_(destinationSheet, "stripeSessionId", session.id, record);
    if (!existing) {
      sendEnrollmentNotificationSafely_(programCode, record, paidAt);
    }
  });
}

function verifyPaidSession_(session, attempt, mode) {
  const metadata = session.metadata || {};
  sanitizeSessionId_(session.id, mode);
  if (session.payment_status !== "paid") throw new Error("Stripe did not report a paid session.");
  if (String(session.currency || "").toLowerCase() !== CURRENCY) throw new Error("Stripe currency does not match.");
  if (Number(session.amount_total) !== Number(attempt.expectedAmountCents)) throw new Error("Stripe amount does not match.");
  if (String(session.client_reference_id || "") !== String(attempt.orderId)) throw new Error("Stripe order reference does not match.");
  if (String(metadata.programCode || "") !== PROGRAM_CODE || String(metadata.orderId || "") !== String(attempt.orderId)) throw new Error("Stripe metadata does not match.");
  if (Number(metadata.expectedAmountCents) !== Number(attempt.expectedAmountCents)) throw new Error("Stripe trusted total does not match.");
  if (String(metadata.cartFingerprint || "") !== cartFingerprint_(attempt.selectedItemCodes)) throw new Error("Stripe cart items do not match.");
}

function normalizeStoredPaidItems_(items) {
  if (!Array.isArray(items) || !items.length || items.length > 20) throw new Error("Stored paid items are not valid.");
  return items.map(function(item) {
    const programCode = String(item.programCode || "").trim();
    const itemCode = String(item.itemCode || "").trim().toUpperCase();
    if (!PROGRAMS[programCode] || !/^[A-Z0-9_-]+$/.test(itemCode)) throw new Error("Stored paid item is not valid.");
    const subtotalCents = normalizeCents_(item.subtotalCents, "stored subtotal");
    const taxCents = normalizeCents_(item.taxCents, "stored tax");
    const totalCents = normalizeCents_(item.totalCents, "stored total");
    if (subtotalCents + taxCents !== totalCents) throw new Error("Stored paid item total is not valid.");
    return {
      programCode: programCode,
      itemCode: itemCode,
      itemName: safeText_(item.itemName, 180),
      subtotalCents: subtotalCents,
      taxCents: taxCents,
      totalCents: totalCents
    };
  });
}

function cartFingerprint_(itemKeys) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(itemKeys || ""), Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "");
}

function validateReturnUrls_(successValue, cancelValue) {
  return { successUrl: validateReturnUrl_(successValue), cancelUrl: validateReturnUrl_(cancelValue) };
}

function validateReturnUrl_(value) {
  const url = requireText_(value, "return URL", 500);
  const match = url.match(/^https:\/\/([^\/?#]+)(\/[^?#]*)?/i);
  if (!match) throw clientError_("Checkout return URL is not allowed.");
  const host = match[1].toLowerCase();
  if (host !== "sparkpreneurs.ca" && host !== "www.sparkpreneurs.ca") throw clientError_("Checkout return URL is not allowed.");
  return url;
}

function addSessionPlaceholder_(url) {
  if (url.indexOf("{CHECKOUT_SESSION_ID}") !== -1) return url;
  return url + (url.indexOf("?") === -1 ? "?" : "&") + "session_id={CHECKOUT_SESSION_ID}";
}

function seedProductsAdditively_(sheet) {
  const existing = {};
  readRecords_(sheet).forEach(function(row) {
    if (row.programCode && row.itemCode) existing[itemKey_(row)] = true;
  });
  DEFAULT_PRODUCTS.forEach(function(product) {
    if (!existing[itemKey_(product)]) appendRecord_(sheet, product);
  });
}

function ensureDestinationRegistrationSheet_(programCode) {
  const destination = PROGRAMS[programCode];
  if (!destination) throw new Error("Unknown registration destination.");
  const spreadsheet = SpreadsheetApp.openById(destination.spreadsheetId);
  return ensureSheet_(spreadsheet, REGISTRATIONS_SHEET_NAME, REGISTRATION_HEADERS);
}

function countDestinationRegistrations_(programCode, itemCode) {
  const sheet = ensureDestinationRegistrationSheet_(programCode);
  return readRecords_(sheet).filter(function(row) {
    if (String(row.registrationStatus || "") !== "PAID_VERIFIED" && String(row.status || "") !== "PAID_VERIFIED") return false;
    return String(row.selectedItemCodes || "").split(",").map(function(code) { return code.trim(); }).indexOf(itemCode) !== -1;
  }).length;
}

function ensureSheet_(spreadsheet, name, requiredHeaders) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  let headers = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(String) : [];
  const hasContent = headers.some(function(header) { return header.trim() !== ""; });
  if (!hasContent) headers = [];
  requiredHeaders.forEach(function(header) {
    if (headers.indexOf(header) === -1) headers.push(header);
  });
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function requireSheet_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error(name + " sheet is missing. Run setupPeriodWorkbook first.");
  return sheet;
}

function readRecords_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(value) { return String(value).trim(); });
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function(row) {
    const record = {};
    headers.forEach(function(header, index) { if (header) record[header] = row[index]; });
    return record;
  });
}

function appendRecord_(sheet, record) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(value) { return String(value).trim(); });
  sheet.appendRow(headers.map(function(header) { return neutralizeFormula_(record[header]); }));
}

function upsertByKey_(sheet, keyName, keyValue, record) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(value) { return String(value).trim(); });
  const keyIndex = headers.indexOf(keyName);
  if (keyIndex === -1) throw new Error("Required key column is missing.");
  let rowNumber = 0;
  if (sheet.getLastRow() > 1) {
    const values = sheet.getRange(2, keyIndex + 1, sheet.getLastRow() - 1, 1).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0]) === String(keyValue)) { rowNumber = i + 2; break; }
    }
  }
  if (!rowNumber) {
    appendRecord_(sheet, Object.assign({}, record, { [keyName]: keyValue }));
    return;
  }
  const row = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  headers.forEach(function(header, index) {
    if (Object.prototype.hasOwnProperty.call(record, header)) row[index] = neutralizeFormula_(record[header]);
  });
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([row]);
}

function readByKey_(sheet, keyName, keyValue) {
  const records = readRecords_(sheet);
  for (let i = records.length - 1; i >= 0; i--) {
    if (String(records[i][keyName] || "") === String(keyValue)) return records[i];
  }
  return null;
}

function stripeRequest_(method, path, params, config) {
  const query = formEncode_(params || {});
  const url = STRIPE_API_BASE + path + (method === "get" && query ? "?" + query : "");
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
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw clientError_(parsed && parsed.error && parsed.error.message ? parsed.error.message : "Stripe request failed.");
  }
  return parsed;
}

function getStripeConfig_() {
  const mode = getStripeMode_();
  const keyName = mode === "live" ? "STRIPE_SECRET_KEY_LIVE" : "STRIPE_SECRET_KEY_TEST";
  const key = String(PropertiesService.getScriptProperties().getProperty(keyName) || "").trim();
  if (!key || key.indexOf(mode === "live" ? "sk_live_" : "sk_test_") !== 0) throw clientError_("Stripe is not configured for " + mode + " mode.");
  return { mode: mode, key: key };
}

function getStripeMode_() {
  const mode = String(PropertiesService.getScriptProperties().getProperty("STRIPE_MODE") || "test").trim().toLowerCase();
  return mode === "live" ? "live" : "test";
}

function parseRequest_(event) {
  const body = event && event.postData && event.postData.contents ? event.postData.contents : "";
  if (!body) throw clientError_("Request body is required.");
  if (body.length > MAX_REQUEST_BYTES) throw clientError_("Request is too large.");
  try { return JSON.parse(body); } catch (error) { throw clientError_("Request body is not valid JSON."); }
}

function assertProgramCode_(value) {
  if (String(value || "").trim() !== PROGRAM_CODE) throw clientError_("Program code does not match this checkout.");
}

function itemKey_(item) {
  return String(item.programCode || "").trim() + ":" + String(item.itemCode || "").trim().toUpperCase();
}

function normalizeCents_(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100000000) throw clientError_(label + " is not valid.");
  return number;
}

function normalizeNonNegativeInteger_(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(label + " must be a non-negative integer.");
  return number;
}

function normalizeTaxRate_(value) {
  const number = Number(value || 0);
  if (!isFinite(number) || number < 0 || number > 100) throw new Error("Tax rate is not valid.");
  return number;
}

function requireText_(value, label, maxLength) {
  const text = safeText_(value, maxLength);
  if (!text) throw clientError_("Please enter " + label + ".");
  return text;
}

function safeText_(value, maxLength) {
  const text = String(value === undefined || value === null ? "" : value).trim().replace(/\s+/g, " ");
  if (text.length > maxLength) throw clientError_("Entered information is too long.");
  return neutralizeFormula_(text);
}

function sanitizeEmail_(value) {
  const email = requireText_(value, "contact email", 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw clientError_("Please enter a valid contact email.");
  return email;
}

function sanitizeSessionId_(value, mode) {
  const id = safeText_(value, 120);
  const expected = mode === "live" ? /^cs_live_[A-Za-z0-9_]+$/ : /^cs_test_[A-Za-z0-9_]+$/;
  if (!expected.test(id)) throw clientError_("Checkout session is not valid.");
  return id;
}

function safeJson_(value) {
  const json = JSON.stringify(value);
  if (json.length > 20000) throw clientError_("Registration information is too large.");
  return neutralizeFormula_(json);
}

function parseStoredJson_(value, label) {
  try { return JSON.parse(String(value || "").replace(/^'/, "")); } catch (error) { throw new Error("Stored " + label + " could not be read."); }
}

function neutralizeFormula_(value) {
  if (typeof value !== "string") return value === undefined ? "" : value;
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function formEncode_(params) {
  return Object.keys(params).map(function(key) { return encodeURIComponent(key) + "=" + encodeURIComponent(String(params[key])); }).join("&");
}

function isTruthy_(value) {
  if (value === true) return true;
  const text = String(value || "").trim().toLowerCase();
  return text === "true" || text === "yes" || text === "1";
}

function withLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return callback(); } finally { lock.releaseLock(); }
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function clientError_(message) {
  const error = new Error(message);
  error.isPublic = true;
  return error;
}

function sendEnrollmentNotificationSafely_(programCode, registration, paidAt) {
  try {
    sendEnrollmentNotification_({
      programName: PROGRAMS[programCode] ? PROGRAMS[programCode].name : programCode,
      participantName: registration.studentName,
      contactName: registration.parentName,
      contactEmail: registration.parentEmail,
      phone: registration.phone,
      selectedItemNames: registration.selectedItemNames,
      amountCents: registration.expectedAmountCents,
      paidAt: paidAt,
      orderId: registration.orderId,
      stripeSessionId: registration.stripeSessionId
    });
  } catch (error) {
    console.error("Unified cart enrollment email failed for " + programCode + ": " + String(error && error.message ? error.message : error));
  }
}

function sendEnrollmentNotification_(details) {
  const recipients = getEnrollmentNotificationRecipients_();
  if (!recipients) return;

  const body = [
    "A new paid registration was received.",
    "",
    "Program: " + String(details.programName || ""),
    "Participant: " + String(details.participantName || ""),
    "Contact: " + String(details.contactName || ""),
    "Email: " + String(details.contactEmail || ""),
    "Phone: " + String(details.phone || ""),
    "Selection: " + String(details.selectedItemNames || ""),
    "Amount paid: " + formatMoneyCents_(details.amountCents),
    "Paid at: " + String(details.paidAt || ""),
    "Order ID: " + String(details.orderId || ""),
    "Stripe session ID: " + String(details.stripeSessionId || "")
  ].join("\n");

  const message = {
    to: recipients,
    subject: "New paid registration: " + String(details.programName || "SparkPreneurs"),
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
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
