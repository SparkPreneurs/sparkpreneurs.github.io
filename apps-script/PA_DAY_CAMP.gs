const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty("PA_DAY_SPREADSHEET_ID");
const PROGRAM_CODE = "pa_day_camp";
const PROGRAM_NAME = "PA Day Camp";
const CURRENCY = "cad";
const SCRIPT_VERSION = "2026-11-10-pa-day-4";
const STRIPE_API_BASE = "https://api.stripe.com/v1";
const MAX_REQUEST_BYTES = 30000;
const DEFAULT_ENROLLMENT_NOTIFICATION_EMAILS = "sparkpreneurs.ca@gmail.com";

const PRODUCTS_SHEET_NAME = "Products";
const ATTEMPTS_SHEET_NAME = "Checkout Attempts";
const REGISTRATIONS_SHEET_NAME = "Registrations";
const PLACES_REMAINING_HEADER = "Places remaining";

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
  "createdAt", "updatedAt", "programCode", "orderId", "stripeSessionId", "stripeMode", "status",
  "selectedItemCodes", "selectedItemNames", "subtotalCents", "taxCents", "expectedAmountCents",
  "studentName", "studentAge", "school", "parentName", "parentEmail", "phone",
  "discountCode", "discountCents", "lastError"
];

const REGISTRATION_HEADERS = ATTEMPT_HEADERS.concat([
  "paidAt",
  "stripePaymentIntentId",
  "stripePaymentStatus",
  "registrationStatus"
]);

function doGet() {
  return jsonResponse_({
    success: true,
    message: "PA Day Camp registration endpoint is running.",
    version: SCRIPT_VERSION,
    programCode: PROGRAM_CODE,
    programs: [PROGRAM_CODE],
    bookingVersion: 1, discountsSupported: discountServiceConfigured_(), stripeMode: getStripeModeForHealth_()
  });
}

function doPost(e) {
  try {
    const data = parseRequest_(e);
    const action = data.action || "";

    if (action === "ping") {
      return jsonResponse_({
        success: true,
        version: SCRIPT_VERSION,
        programCode: PROGRAM_CODE,
        programs: [PROGRAM_CODE],
        bookingVersion: 1, discountsSupported: discountServiceConfigured_(), stripeMode: getStripeModeForHealth_()
      });
    }

    if (action === "quoteCheckout") {
      return jsonResponse_(quoteCheckout_(data));
    }

    if (action === "getAvailability") {
      assertProgramCode_(data.programCode);
      return jsonResponse_(getAvailability_());
    }

    if (action === "createCheckoutSession") {
      return jsonResponse_(createCheckoutSession_(data));
    }

    if (action === "verifyCheckoutSession") {
      return jsonResponse_(verifyCheckoutSession_(data.stripeSessionId));
    }

    throw clientError_("Unknown request action.");
  } catch (err) {
    logError_(err);
    return jsonResponse_({
      success: false,
      error: err && err.isPublic ? err.message : "The registration service could not complete this request."
    });
  }
}

function setupPeriodWorkbook() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const products = getOrCreateSheet_(ss, PRODUCTS_SHEET_NAME);
  const attempts = getOrCreateSheet_(ss, ATTEMPTS_SHEET_NAME);
  const registrations = getOrCreateSheet_(ss, REGISTRATIONS_SHEET_NAME);

  ensureSheetHeaders_(products, PRODUCT_HEADERS);
  ensureSheetHeaders_(attempts, ATTEMPT_HEADERS);
  ensureSheetHeaders_(registrations, REGISTRATION_HEADERS);

  seedMissingProducts_(products);
  updatePlacesRemainingColumn_(products);

  [products, attempts, registrations].forEach(function(sheet) {
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, sheet.getLastColumn());
  });

  return "PA Day Camp workbook is ready for version " + SCRIPT_VERSION + ".";
}

// Run once when upgrading an existing workbook. Existing products and bookings are preserved.
function addPlacesRemainingColumn() {
  return withScriptLock_(function() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const products = requireSheet_(ss, PRODUCTS_SHEET_NAME);
    assertRequiredHeaders_(requireSheet_(ss, ATTEMPTS_SHEET_NAME), ATTEMPT_HEADERS);
    updatePlacesRemainingColumn_(products);
    return "Places remaining is now visible in Products and updates automatically.";
  });
}

function updatePlacesRemainingColumn_(products) {
  assertRequiredHeaders_(products, PRODUCT_HEADERS);
  const column = PRODUCT_HEADERS.length + 1;
  products.getRange(1, column).setValue(PLACES_REMAINING_HEADER);
  products.getRange(1, column).setNote("Calculated automatically: total capacity minus paid bookings and pending checkout holds for this date, shared across both pickup options. Do not edit this column.");
  const count = products.getLastRow() - 1;
  if (count > 0) {
    const formulas = [];
    for (let row = 2; row <= count + 1; row++) formulas.push([placesRemainingFormula_(row)]);
    products.getRange(2, column, count, 1).setFormulas(formulas).setNumberFormat("0");
  }
  products.autoResizeColumn(column);
}

function placesRemainingFormula_(row) {
  // H = purchased item codes, G = checkout status. One attempt counts once per date.
  // Keep the exclusions identical to countReservedForDay_: uncertain checkouts retain their hold.
  return '=IF($A' + row + '<>"pa_day_camp","",IF($K' + row + '="","",MAX(0,$K' + row +
    '-COUNTIFS(\'Checkout Attempts\'!$H$2:$H,"*"&LEFT($B' + row + ',12)&"*",' +
    '\'Checkout Attempts\'!$G$2:$G,"<>EXPIRED",\'Checkout Attempts\'!$G$2:$G,"<>CHECKOUT_FAILED"))))';
}

function seedMissingProducts_(products) {
  const rawTax = PropertiesService.getScriptProperties().getProperty("PA_DAY_TAX_RATE_PERCENT");
  if (rawTax === null || String(rawTax).trim() === "") throw new Error("Set confirmed PA_DAY_TAX_RATE_PERCENT before setup (0 is allowed).");
  const tax = readTaxRatePercent_(rawTax, "PA Day Camp");
  const values = products.getDataRange().getValues();
  const existing = values.slice(1).map(function(row) { return String(row[1]); });
  ["2026-11-20", "2027-01-15", "2027-02-12", "2027-06-04", "2027-06-30"].forEach(function(date) {
    ["STANDARD", "EXTENDED"].forEach(function(option) {
      const code = "PA_" + date.replace(/-/g, "") + "_" + option;
      if (existing.indexOf(code) !== -1) return;
      products.appendRow([PROGRAM_CODE, code, date + " / " + (option === "STANDARD" ? "8 AM–3 PM" : "8 AM–5 PM"),
        date, date, "08:00", option === "STANDARD" ? "15:00" : "17:00", option === "STANDARD" ? 8500 : 10500,
        tax, false, 0]);
    });
  });
}


function authorizeRequiredServices() {
  const products = requireSheet_(SpreadsheetApp.openById(SPREADSHEET_ID), PRODUCTS_SHEET_NAME);
  assertRequiredHeaders_(products, PRODUCT_HEADERS);

  const config = getStripeConfig_();
  const response = UrlFetchApp.fetch(STRIPE_API_BASE + "/checkout/sessions?limit=1", {
    method: "get",
    headers: { Authorization: "Bearer " + config.secretKey },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error("Stripe authorization failed. Check the active Stripe mode and its private Script Property.");
  }

  return "Spreadsheet and " + config.mode + " Stripe access are authorized for version " + SCRIPT_VERSION + ".";
}

function createCheckoutSession_(data) {
  return withScriptLock_(function() { return createCheckoutSessionLocked_(data); });
}

function createCheckoutSessionLocked_(data) {
  assertProgramCode_(data.programCode);

  const registration = normalizeRegistration_(data);
  const selectedItemCodes = normalizeSelectedItemCodes_(data.selectedItemCodes || data.selectedWeeks);
  const displayedAmountCents = normalizeCents_(data.displayedAmountCents, "displayedAmountCents", true);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const products = requireSheet_(ss, PRODUCTS_SHEET_NAME);
  const pricing = calculateTrustedPricing_(products, selectedItemCodes);
  discountApplyPricing_(data, pricing, pricing.selectedItems[0].taxRatePercent);

  if (displayedAmountCents !== pricing.totalCents) {
    return {
      success: false,
      error: "Amount mismatch",
      expectedAmountCents: pricing.totalCents
    };
  }

  const urls = validateReturnUrls_(data.successUrl, data.cancelUrl);
  const stripeConfig = getStripeConfig_();
  const orderId = Utilities.getUuid();
  const now = new Date().toISOString();
  const attempt = buildAttemptRecord_(registration, pricing, orderId, stripeConfig.mode, now);

  upsertByColumn_(requireSheet_(ss, ATTEMPTS_SHEET_NAME), ATTEMPT_HEADERS, "orderId", orderId, attempt);

  let checkoutSession;

  try {
    discountReservePricing_(pricing, orderId);
  } catch (err) {
    // No Stripe session was requested, so this attempt must not keep a camp place.
    attempt.status = "CHECKOUT_FAILED";
    attempt.updatedAt = new Date().toISOString();
    attempt.lastError = "The discount could not be reserved.";
    upsertByColumn_(requireSheet_(ss, ATTEMPTS_SHEET_NAME), ATTEMPT_HEADERS, "orderId", orderId, attempt);
    throw err;
  }

  try {
    checkoutSession = stripeRequest_("post", "/checkout/sessions", {
      mode: "payment",
      "payment_method_types[0]": "card",
      expires_at: String(Math.floor(Date.now() / 1000) + 1800),
      success_url: urls.successUrl,
      cancel_url: urls.cancelUrl,
      customer_email: registration.parentEmail,
      client_reference_id: orderId,
      billing_address_collection: "auto",
      "phone_number_collection[enabled]": "true",
      "line_items[0][price_data][currency]": CURRENCY,
      "line_items[0][price_data][product_data][name]": PROGRAM_NAME,
      "line_items[0][price_data][product_data][description]": pricing.selectedItems.map(function(item) {
        return item.itemName;
      }).join(", "),
      "line_items[0][price_data][unit_amount]": String(pricing.totalCents),
      "line_items[0][quantity]": "1",
      "metadata[orderId]": orderId,
      "metadata[programCode]": PROGRAM_CODE,
      "metadata[selectedItemCodes]": pricing.selectedItems.map(function(item) {
        return item.itemCode;
      }).join(","),
      "metadata[expectedAmountCents]": String(pricing.totalCents),
      "payment_intent_data[metadata][orderId]": orderId,
      "payment_intent_data[metadata][programCode]": PROGRAM_CODE
    }, stripeConfig);
  } catch (err) {
    // Retain the seat if Stripe might have created a session despite a network failure.
    attempt.status = "CHECKOUT_UNKNOWN";
    attempt.updatedAt = new Date().toISOString();
    attempt.lastError = "Stripe Checkout could not be created.";
    upsertByColumn_(requireSheet_(ss, ATTEMPTS_SHEET_NAME), ATTEMPT_HEADERS, "orderId", orderId, attempt);
    throw err;
  }

  if (!checkoutSession || !checkoutSession.id || !checkoutSession.url) {
    throw new Error("Stripe did not return a usable Checkout Session.");
  }

  attempt.stripeSessionId = sanitizeSessionId_(checkoutSession.id, stripeConfig.mode);
  attempt.status = "CHECKOUT_CREATED";
  attempt.updatedAt = new Date().toISOString();
  upsertByColumn_(requireSheet_(ss, ATTEMPTS_SHEET_NAME), ATTEMPT_HEADERS, "orderId", orderId, attempt);

  discountAttachSession_(pricing, orderId, checkoutSession);

  return {
    success: true,
    checkoutUrl: checkoutSession.url,
    stripeSessionId: checkoutSession.id,
    expectedAmountCents: pricing.totalCents
  };
}

function verifyCheckoutSession_(stripeSessionId) {
  const stripeConfig = getStripeConfig_();
  const sessionId = sanitizeSessionId_(stripeSessionId, stripeConfig.mode);
  const session = stripeRequest_("get", "/checkout/sessions/" + encodeURIComponent(sessionId), null, stripeConfig);

  if (session.payment_status !== "paid") {
    return {
      success: false,
      error: "Payment is not complete yet.",
      paymentStatus: session.payment_status || ""
    };
  }

  const result = withScriptLock_(function() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const attempts = requireSheet_(ss, ATTEMPTS_SHEET_NAME);
    const registrations = requireSheet_(ss, REGISTRATIONS_SHEET_NAME);
    const attempt = readRecordByColumn_(attempts, ATTEMPT_HEADERS, "stripeSessionId", sessionId);

    if (!attempt) {
      throw new Error("A matching checkout record was not found.");
    }

    verifyPaidSession_(session, attempt, stripeConfig.mode);
    discountConfirmSession_(session.id);

    const existing = readRecordByColumn_(registrations, REGISTRATION_HEADERS, "stripeSessionId", sessionId);

    if (existing) {
      attempt.updatedAt = new Date().toISOString();
      attempt.status = "PAID_VERIFIED";
      attempt.lastError = "";
      upsertByColumn_(attempts, ATTEMPT_HEADERS, "stripeSessionId", sessionId, attempt);
      return { alreadyRecorded: true };
    }

    const paidAt = new Date().toISOString();
    const registration = Object.assign({}, attempt, {
      updatedAt: paidAt,
      paidAt: paidAt,
      stripePaymentIntentId: safeText_(session.payment_intent || "", 120),
      stripePaymentStatus: "paid",
      registrationStatus: "PAID_VERIFIED",
      status: "PAID_VERIFIED",
      lastError: ""
    });

      upsertByColumn_(registrations, REGISTRATION_HEADERS, "stripeSessionId", sessionId, registration);
      attempt.updatedAt = paidAt;
      attempt.status = "PAID_VERIFIED";
      attempt.lastError = "";
      upsertByColumn_(attempts, ATTEMPT_HEADERS, "stripeSessionId", sessionId, attempt);
      sendEnrollmentNotificationSafely_(registration, PROGRAM_NAME, paidAt);

      return { alreadyRecorded: false };
    });

  return {
    success: true,
    message: result.alreadyRecorded
      ? "Payment was already verified. Your registration is on file."
      : "Payment verified. Your registration has been received.",
    paymentStatus: "paid"
  };
}

function getActiveItems_(productsSheet) {
  assertRequiredHeaders_(productsSheet, PRODUCT_HEADERS);
  const values = productsSheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error("The Products tab has no active product rows.");
  }

  const headers = values[0].map(function(value) {
    return String(value).trim();
  });
  const indexes = headerIndexes_(headers);
  const activeItems = {};

  values.slice(1).forEach(function(row) {
    const programCode = String(row[indexes.programCode] || "").trim();
    const itemCode = String(row[indexes.itemCode] || "").trim().toUpperCase();

    if (programCode !== PROGRAM_CODE || !itemCode || !isTruthy_(row[indexes.active])) {
      return;
    }

    const capacity = readCapacity_(row[indexes.capacity], itemCode);
    const priceCents = normalizeCents_(row[indexes.priceCents], "priceCents for " + itemCode, false);
    const taxRatePercent = readTaxRatePercent_(row[indexes.taxRatePercent], itemCode);

    activeItems[itemCode] = {
      itemCode: itemCode,
      itemName: safeText_(row[indexes.itemName], 160),
      priceCents: priceCents,
      taxRatePercent: taxRatePercent,
      capacity: capacity
    };
  });

  const capacities = {};
  Object.keys(activeItems).forEach(function(code) {
    const item = activeItems[code], date = code.slice(0, 12);
    if (!/^PA_\d{8}_(STANDARD|EXTENDED)$/.test(code) || item.capacity === null) throw new Error("Configure PA day product codes and shared date capacity.");
    if (capacities[date] !== undefined && capacities[date] !== item.capacity) throw new Error("Both pickup options must use the same date capacity.");
    capacities[date] = item.capacity;
  });
  return activeItems;
}

// Read trusted capacity and checkout records; never trust the editable display formula.
function getAvailability_() {
  const products = requireSheet_(SpreadsheetApp.openById(SPREADSHEET_ID), PRODUCTS_SHEET_NAME);
  const items = getActiveItems_(products);
  const today = Utilities.formatDate(new Date(), "America/Toronto", "yyyy-MM-dd").replace(/-/g, "");
  const reserved = reservedPlacesByDate_();
  return { success: true, items: Object.keys(items).filter(function(code) {
    return code.slice(3, 11) > today;
  }).map(function(code) {
    return { itemCode: code, placesRemaining: Math.max(0, items[code].capacity - (reserved[code.slice(0, 12)] || 0)) };
  }) };
}

function calculateTrustedPricing_(productsSheet, selectedItemCodes) {
  const activeItems = getActiveItems_(productsSheet);
  const selectedItems = selectedItemCodes.map(function(itemCode) {
    const item = activeItems[itemCode];

    if (!item) {
      throw clientError_("This PA day is not currently available.");
    }

    if (item.capacity !== null && countReservedForDay_(itemCode) >= item.capacity) {
      throw clientError_("This PA day is fully booked.");
    }

    return item;
  });
  if (selectedItems.some(function(item) { return item.taxRatePercent !== selectedItems[0].taxRatePercent; })) throw new Error("PA day tax rates must agree.");
  const subtotalCents = selectedItems.reduce(function(total, item) {
    return total + item.priceCents;
  }, 0);
  const taxCents = selectedItems.reduce(function(total, item) {
    return total + Math.round(item.priceCents * (item.taxRatePercent / 100));
  }, 0);

  return {
    selectedItems: selectedItems,
    subtotalCents: subtotalCents,
    taxCents: taxCents,
    totalCents: subtotalCents + taxCents
  };
}

function buildAttemptRecord_(registration, pricing, orderId, stripeMode, createdAt) {
  return Object.assign({}, registration, {
    createdAt: createdAt,
    updatedAt: createdAt,
    programCode: PROGRAM_CODE,
    orderId: orderId,
    stripeSessionId: "",
    stripeMode: stripeMode,
    status: "CREATING_CHECKOUT",
    selectedItemCodes: pricing.selectedItems.map(function(item) {
      return item.itemCode;
    }).join(", "),
    selectedItemNames: pricing.selectedItems.map(function(item) {
      return item.itemName;
    }).join(", "),
    subtotalCents: pricing.subtotalCents,
    taxCents: pricing.taxCents,
    expectedAmountCents: pricing.totalCents,
    discountCode: pricing.discountCode || "", discountCents: pricing.discountCents || 0,
    lastError: ""
  });
}

function verifyPaidSession_(session, attempt, activeMode) {
  const metadata = session.metadata || {};
  if (session.mode !== "payment" || session.livemode !== (activeMode === "live")) throw new Error("Unexpected Stripe session mode.");
  const expectedAmountCents = normalizeCents_(attempt.expectedAmountCents, "expectedAmountCents", true);

  if (session.payment_status !== "paid") {
    throw new Error("Stripe did not report a paid Checkout Session.");
  }

  if (Number(session.amount_total) !== expectedAmountCents) {
    throw new Error("Stripe amount does not match the trusted registration amount.");
  }

  if (String(session.currency || "").toLowerCase() !== CURRENCY) {
    throw new Error("Stripe currency does not match the expected currency.");
  }

  if (String(metadata.programCode || "") !== PROGRAM_CODE || String(metadata.orderId || "") !== String(attempt.orderId)) {
    throw new Error("Stripe Checkout metadata does not match this registration.");
  }

  if (Number(metadata.expectedAmountCents) !== expectedAmountCents || String(metadata.selectedItemCodes || "") !== String(attempt.selectedItemCodes).replace(/,\s*/g, ",")) {
    throw new Error("Stripe Checkout items do not match this registration.");
  }

  if (String(session.client_reference_id || "") !== String(attempt.orderId)) {
    throw new Error("Stripe Checkout reference does not match this registration.");
  }

  sanitizeSessionId_(session.id, activeMode);
}

function normalizeRegistration_(data) {
  const age = Number(data.studentAge);
  if (!Number.isInteger(age) || age < 1 || age > 99) throw clientError_("Enter a valid child age.");
  return {
    studentName: requireText_(data.studentName, "child name", 100), studentAge: age,
    school: requireText_(data.school, "school", 150),
    parentName: requireText_(data.parentName, "parent name", 100),
    parentEmail: sanitizeEmail_(data.parentEmail, "parent email"), phone: requireText_(data.phone, "phone", 40)
  };
}


function normalizeSelectedItemCodes_(value) {
  if (!Array.isArray(value) || !value.length || value.length > 5) throw clientError_("Choose one to five PA days.");
  const dates = {};
  const today = Utilities.formatDate(new Date(), "America/Toronto", "yyyy-MM-dd").replace(/-/g, "");
  return value.map(function(raw) {
    const code = String(raw || "").trim().toUpperCase();
    const match = /^PA_(\d{8})_(STANDARD|EXTENDED)$/.exec(code);
    if (!match || match[1] <= today || dates[match[1]]) throw clientError_("Choose one pickup time per future PA day.");
    dates[match[1]] = true;
    return code;
  });
}


function validateReturnUrls_(successValue, cancelValue) {
  return {
    successUrl: validateReturnUrl_(successValue, "success"),
    cancelUrl: validateReturnUrl_(cancelValue, "cancel")
  };
}

function validateReturnUrl_(value, kind) {
  const url = String(value || "").trim();

  const production = /^https:\/\/(?:www\.)?sparkpreneurs\.ca\/camps\/pa-day-camp\/?(?:\?[^#]*)?(?:#[\s\S]*)?$/.test(url);
  const localTest = getStripeConfig_().mode === "test" && /^http:\/\/localhost:4321\/camps\/pa-day-camp\/?(?:\?[^#]*)?(?:#[\s\S]*)?$/.test(url);
  if (!production && !localTest) {
    throw clientError_("Invalid payment return address.");
  }

  const queryStart = url.indexOf("?");
  const fragmentStart = url.indexOf("#");
  const query = queryStart === -1
    ? ""
    : url.slice(queryStart + 1, fragmentStart === -1 ? url.length : fragmentStart);

  if (kind === "success" && !/(?:^|&)session_id=\{CHECKOUT_SESSION_ID\}(?:&|$)/.test(query)) {
    throw clientError_("Invalid payment return address.");
  }

  return url;
}

function parseRequest_(e) {
  if (!e || !e.postData || typeof e.postData.contents !== "string") {
    throw clientError_("Missing request data.");
  }

  const requestBytes = Utilities.newBlob(e.postData.contents).getBytes().length;

  if (requestBytes === 0 || requestBytes > MAX_REQUEST_BYTES) {
    throw clientError_("Invalid request size.");
  }

  try {
    const data = JSON.parse(e.postData.contents);

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("not an object");
    }

    return data;
  } catch (err) {
    throw clientError_("Invalid request data.");
  }
}

function assertProgramCode_(value) {
  if (String(value || "").trim() !== PROGRAM_CODE) {
    throw clientError_("This registration is not for PA Day Camp.");
  }
}

function getStripeConfig_() {
  const mode = String(PropertiesService.getScriptProperties().getProperty("STRIPE_MODE") || "").trim().toLowerCase();

  if (mode !== "test" && mode !== "live") {
    throw new Error("Set STRIPE_MODE to test or live in Script Properties.");
  }

  const propertyName = mode === "test" ? "STRIPE_SECRET_KEY_TEST" : "STRIPE_SECRET_KEY_LIVE";
  const secretKey = String(PropertiesService.getScriptProperties().getProperty(propertyName) || "").trim();
  const expectedPrefix = mode === "test" ? "sk_test_" : "sk_live_";

  if (!secretKey || secretKey.indexOf(expectedPrefix) !== 0) {
    throw new Error("Set the correct private Stripe key for " + mode + " mode in Script Properties.");
  }

  return { mode: mode, secretKey: secretKey };
}

function getStripeModeForHealth_() {
  const mode = String(PropertiesService.getScriptProperties().getProperty("STRIPE_MODE") || "").trim().toLowerCase();
  return mode === "test" || mode === "live" ? mode : "not-configured";
}

function stripeRequest_(method, path, payload, stripeConfig) {
  const options = {
    method: method,
    headers: { Authorization: "Bearer " + stripeConfig.secretKey },
    muteHttpExceptions: true
  };

  if (payload) {
    options.headers["Idempotency-Key"] = payload.client_reference_id;
    options.payload = payload;
  }

  const response = UrlFetchApp.fetch(STRIPE_API_BASE + path, options);
  const statusCode = response.getResponseCode();
  const body = response.getContentText();
  let parsed;

  try {
    parsed = JSON.parse(body);
  } catch (err) {
    throw new Error("Stripe returned an unreadable response.");
  }

  if (statusCode < 200 || statusCode >= 300) {
    console.log("Stripe request failed with status " + statusCode + ".");
    throw new Error("Stripe could not complete this request.");
  }

  return parsed;
}

function sanitizeSessionId_(value, expectedMode) {
  const sessionId = String(value || "").trim();
  const match = sessionId.match(/^cs_(test|live)_[A-Za-z0-9]+$/);

  if (!match || match[1] !== expectedMode) {
    throw clientError_("Invalid Stripe session ID.");
  }

  return sessionId;
}

function upsertByColumn_(sheet, headers, keyName, keyValue, rowData) {
  assertRequiredHeaders_(sheet, headers);
  const keyColumn = headers.indexOf(keyName) + 1;
  const row = headers.map(function(header) {
    return safeSheetValue_(rowData[header] !== undefined ? rowData[header] : "");
  });
  const existingRow = findRowByColumnValue_(sheet, keyColumn, keyValue);

  if (existingRow) {
    sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function readRecordByColumn_(sheet, headers, keyName, keyValue) {
  assertRequiredHeaders_(sheet, headers);
  const keyColumn = headers.indexOf(keyName) + 1;
  const rowNumber = findRowByColumnValue_(sheet, keyColumn, keyValue);

  if (!rowNumber) {
    return null;
  }

  const values = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const record = {};

  headers.forEach(function(header, index) {
    record[header] = values[index];
  });

  return record;
}

function findRowByColumnValue_(sheet, column, value) {
  if (sheet.getLastRow() < 2) {
    return 0;
  }

  const values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues();

  for (let index = 0; index < values.length; index++) {
    if (String(values[index][0]) === String(value)) {
      return index + 2;
    }
  }

  return 0;
}

function countReservedForDay_(itemCode) {
  return reservedPlacesByDate_()[itemCode.slice(0, 12)] || 0;
}

function reservedPlacesByDate_() {
  const sheet = requireSheet_(SpreadsheetApp.openById(SPREADSHEET_ID), ATTEMPTS_SHEET_NAME);
  assertRequiredHeaders_(sheet, ATTEMPT_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const indexes = headerIndexes_(rows[0]);
  const reserved = {};
  rows.slice(1).forEach(function(row) {
    if (["CHECKOUT_FAILED", "EXPIRED"].indexOf(String(row[indexes.status])) !== -1) return;
    const dates = {};
    String(row[indexes.selectedItemCodes]).split(/,\s*/).forEach(function(code) { if (code) dates[code.slice(0, 12)] = true; });
    Object.keys(dates).forEach(function(date) { reserved[date] = (reserved[date] || 0) + 1; });
  });
  return reserved;
}


function getOrCreateSheet_(ss, name) {
  const existing = ss.getSheetByName(name);

  if (existing) {
    return existing;
  }

  const sheets = ss.getSheets();

  if (sheets.length === 1 && sheets[0].getName() === "Sheet1" && sheets[0].getLastRow() === 0) {
    sheets[0].setName(name);
    return sheets[0];
  }

  return ss.insertSheet(name);
}

function requireSheet_(ss, name) {
  const sheet = ss.getSheetByName(name);

  if (!sheet) {
    throw new Error("Missing required spreadsheet tab: " + name + ". Run setupPeriodWorkbook first.");
  }

  return sheet;
}

function ensureSheetHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }

  assertRequiredHeaders_(sheet, headers);
}

function assertRequiredHeaders_(sheet, headers) {
  const currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0].map(function(value) {
    return String(value).trim();
  });
  // Products may have the one calculated display column; backend pricing uses the original columns.
  const hasPlacesRemaining = headers === PRODUCT_HEADERS && currentHeaders.length === headers.length + 1 && currentHeaders[headers.length] === PLACES_REMAINING_HEADER;
  if ((!hasPlacesRemaining && currentHeaders.length !== headers.length) || headers.some(function(header, index) { return currentHeaders[index] !== header; })) {
    throw new Error(sheet.getName() + " has unexpected columns. Use a dedicated PA Day workbook; do not reorder headers.");
  }
}

function headerIndexes_(headers) {
  const indexes = {};

  headers.forEach(function(header, index) {
    indexes[header] = index;
  });

  return indexes;
}

function withScriptLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function normalizeOptionalPickup_(nameValue, phoneValue, number) {
  const name = safeText_(nameValue, 100);
  const phone = safeText_(phoneValue, 40);

  if ((name && !phone) || (!name && phone)) {
    throw clientError_("Authorized person " + number + " needs both a name and phone number.");
  }

  return { name: name, phone: phone };
}

function requireText_(value, fieldName, maxLength) {
  const text = safeText_(value, maxLength);

  if (!text) {
    throw clientError_("Missing " + fieldName + ".");
  }

  return text;
}

function safeText_(value, maxLength) {
  return String(value === undefined || value === null ? "" : value).trim().slice(0, maxLength);
}

function safeSheetValue_(value) {
  if (typeof value === "string" && /^[=+\-@]/.test(value)) {
    return "'" + value;
  }

  return value;
}

function sanitizeEmail_(value, fieldName) {
  const email = requireText_(value, fieldName, 120).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw clientError_("Invalid " + fieldName + ".");
  }

  return email;
}

function requireDate_(value, fieldName) {
  const date = requireText_(value, fieldName, 10);
  const parsed = new Date(date + "T00:00:00Z");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw clientError_("Invalid " + fieldName + ".");
  }

  return date;
}

function normalizeCents_(value, fieldName, allowZero) {
  const cents = Number(value);

  if (!Number.isSafeInteger(cents) || cents < 0 || (!allowZero && cents === 0)) {
    throw clientError_("Invalid " + fieldName + ".");
  }

  return cents;
}

function readTaxRatePercent_(value, itemCode) {
  if (value === null || value === undefined || String(value).trim() === "") throw new Error("Missing confirmed tax rate for " + itemCode + ".");
  const rate = Number(value);

  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new Error("Invalid tax rate for " + itemCode + ".");
  }

  return rate;
}

function readCapacity_(value, itemCode) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const capacity = Number(value);

  if (!Number.isFinite(capacity) || Math.round(capacity) !== capacity || capacity < 0) {
    throw new Error("Invalid capacity for " + itemCode + ".");
  }

  return capacity;
}

function isTruthy_(value) {
  const text = String(value).trim().toUpperCase();
  return value === true || text === "TRUE" || text === "YES" || text === "1";
}

function clientError_(message) {
  const error = new Error(message);
  error.isPublic = true;
  return error;
}

function logError_(err) {
  console.log("PA Day Camp request failed: " + String(err && err.message ? err.message : err));
}

function sendEnrollmentNotificationSafely_(registration, programName, paidAt) {
  try {
    sendEnrollmentNotification_({
      programName: programName,
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
    console.log("PA Day Camp enrollment email failed: " + String(error && error.message ? error.message : error));
  }
}

function sendEnrollmentNotification_(details) {
  const recipients = getEnrollmentNotificationRecipients_();
  if (!recipients) return;

  const lines = [
    "A new paid registration was received.",
    "",
    "Program: " + String(details.programName || PROGRAM_NAME),
    "Participant: " + String(details.participantName || ""),
    "Contact: " + String(details.contactName || ""),
    "Email: " + String(details.contactEmail || ""),
    "Phone: " + String(details.phone || ""),
    "Selection: " + String(details.selectedItemNames || ""),
    "Amount paid: " + formatMoneyCents_(details.amountCents),
    "Paid at: " + String(details.paidAt || ""),
    "Order ID: " + String(details.orderId || ""),
    "Stripe session ID: " + String(details.stripeSessionId || "")
  ];

  const message = {
    to: recipients,
    subject: "New paid registration: " + String(details.programName || PROGRAM_NAME),
    body: lines.join("\n")
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

function jsonResponse_(object) {
  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

function quoteCheckout_(data) {
  assertProgramCode_(data.programCode);
  const products = requireSheet_(SpreadsheetApp.openById(SPREADSHEET_ID), PRODUCTS_SHEET_NAME);
  const pricing = calculateTrustedPricing_(products, normalizeSelectedItemCodes_(data.selectedItemCodes));
  return discountPricingResponse_(discountApplyPricing_(data, pricing, pricing.selectedItems[0].taxRatePercent));
}

// BEGIN SHARED DISCOUNT CLIENT
// Embedded unchanged at the end of each standalone registration backend.
// Only server-side Script Properties contain the shared service credentials.
function discountServiceConfigured_() {
  const properties = PropertiesService.getScriptProperties();
  return Boolean(properties.getProperty("DISCOUNT_SERVICE_URL") && properties.getProperty("DISCOUNT_SERVICE_KEY"));
}

function discountMode_() {
  const mode = String(PropertiesService.getScriptProperties().getProperty("STRIPE_MODE") || "").trim().toLowerCase();
  if (mode !== "test" && mode !== "live") throw new Error("Invalid Stripe mode.");
  return mode;
}

function discountServiceRequest_(action, data) {
  const properties = PropertiesService.getScriptProperties();
  const url = properties.getProperty("DISCOUNT_SERVICE_URL");
  const key = properties.getProperty("DISCOUNT_SERVICE_KEY");
  if (!url || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url) || !key) throw clientError_("Discounts are temporarily unavailable. Please try again later.");
  const response = UrlFetchApp.fetch(url, { method: "post", contentType: "text/plain;charset=utf-8", muteHttpExceptions: true,
    payload: JSON.stringify(Object.assign({}, data, { action: action, programCode: PROGRAM_CODE, stripeMode: discountMode_(), serviceKey: key })) });
  const result = JSON.parse(response.getContentText());
  if (response.getResponseCode() !== 200 || !result || result.success !== true) throw clientError_(result.error || "The discount could not be checked.");
  return result;
}

function discountApplyPricing_(data, pricing, taxRatePercent) {
  pricing.discountCode = String(data.discountCode || "").trim().toUpperCase();
  pricing.discountCents = 0;
  if (!pricing.discountCode) return pricing;
  if (!/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(pricing.discountCode)) throw clientError_("Enter a valid discount code.");
  const email = String(data.parentEmail || data.email || "").trim().toLowerCase();
  const quote = discountServiceRequest_("quote", { discountCode: pricing.discountCode, email: email });
  if (!Number.isSafeInteger(quote.discountCents) || quote.discountCents <= 0 || !Number.isFinite(taxRatePercent) || taxRatePercent < 0 || taxRatePercent > 100) throw new Error("Invalid discount quote.");
  if (quote.discountCents >= pricing.subtotalCents) throw clientError_("This discount cannot be used with this registration.");
  pricing.discountCents = quote.discountCents;
  pricing.taxCents = Math.round((pricing.subtotalCents - quote.discountCents) * taxRatePercent / 100);
  pricing.totalCents = pricing.subtotalCents - quote.discountCents + pricing.taxCents;
  pricing.expectedAmountCents = pricing.totalCents;
  pricing.discountEmail = email;
  if (pricing.items && pricing.items.length === 1) {
    pricing.items[0].taxCents = pricing.taxCents;
    pricing.items[0].totalCents = pricing.totalCents;
  }
  return pricing;
}

function discountPricingResponse_(pricing) {
  return { success: true, discountCode: pricing.discountCode || "", discountCents: pricing.discountCents || 0,
    subtotalCents: pricing.subtotalCents, taxCents: pricing.taxCents,
    expectedAmountCents: pricing.expectedAmountCents === undefined ? pricing.totalCents : pricing.expectedAmountCents };
}

function discountReservePricing_(pricing, orderId) {
  if (!pricing.discountCode) return;
  const reservation = discountServiceRequest_("reserve", { discountCode: pricing.discountCode, discountCents: pricing.discountCents,
    email: pricing.discountEmail, orderId: orderId, expectedAmountCents: pricing.totalCents });
  if (!reservation.token) throw new Error("The discount reservation could not be created.");
  pricing.discountReservation = reservation.token;
}

function discountAttachSession_(pricing, orderId, session) {
  if (!pricing.discountCode) return;
  discountServiceRequest_("attach", { discountCode: pricing.discountCode, email: pricing.discountEmail,
    orderId: orderId, token: pricing.discountReservation, stripeSessionId: session.id });
}

function discountConfirmSession_(sessionId) {
  if (!discountServiceConfigured_()) return;
  try { discountServiceRequest_("confirm", { stripeSessionId: sessionId }); }
  catch (_) { console.log("Discount usage will be reconciled on the next discount request."); }
}

// Install a five-minute time trigger: fulfillment must also work without a browser return.
function reconcilePendingPayments() {
  const sheet = requireSheet_(SpreadsheetApp.openById(SPREADSHEET_ID), ATTEMPTS_SHEET_NAME);
  assertRequiredHeaders_(sheet, ATTEMPT_HEADERS);
  const rows = sheet.getDataRange().getValues(), indexes = headerIndexes_(rows[0]);
  rows.slice(1).forEach(function(row) {
    const status = String(row[indexes.status]);
    if (["PAID_VERIFIED", "EXPIRED", "CHECKOUT_FAILED"].indexOf(status) !== -1) return;
    const id = String(row[indexes.stripeSessionId] || "");
    if (!id) { console.log("Unresolved checkout order requires review: " + row[indexes.orderId]); return; }
    try {
      const config = getStripeConfig_();
      const session = stripeRequest_("get", "/checkout/sessions/" + encodeURIComponent(sanitizeSessionId_(id, config.mode)), null, config);
      if (session.payment_status === "paid") { verifyCheckoutSession_(id); return; }
      if (session.status === "expired") withScriptLock_(function() {
        const attempt = readRecordByColumn_(sheet, ATTEMPT_HEADERS, "stripeSessionId", id);
        if (attempt.status === "PAID_VERIFIED") return;
        attempt.status = "EXPIRED"; attempt.updatedAt = new Date().toISOString();
        upsertByColumn_(sheet, ATTEMPT_HEADERS, "stripeSessionId", id, attempt);
      });
    } catch (error) { console.log("Payment reconciliation failed for " + id); }
  });
}
