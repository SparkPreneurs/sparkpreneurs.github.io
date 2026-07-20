const SPREADSHEET_ID = "13EdVfWfHS3rBctFPeHo8lDwBnL67ZbkaBuJh2T1JVXM";
const PROGRAM_CODE = "adult_hand_building_pottery";
const PROGRAM_NAME = "Adult Hand Pottery";
const CURRENCY = "cad";
const SCRIPT_VERSION = "2026-07-20-1";
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
  "waiverChildFullName",
  "childDateOfBirth",
  "waiverParentGuardianFullName",
  "waiverParentPhone",
  "waiverParentEmail",
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactRelationship",
  "medicalInformation",
  "medicalInformationConfirmed",
  "waiverAcknowledged",
  "photoConsent",
  "authorizedPickup1Name",
  "authorizedPickup1Phone",
  "authorizedPickup2Name",
  "authorizedPickup2Phone",
  "authorizedPickup3Name",
  "authorizedPickup3Phone",
  "waiverConfirmationName",
  "electronicSignature",
  "waiverSignedDate",
  "waiverVersion",
  "waiverAccepted",
  "lastError"
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
    message: "Adult Hand Pottery registration endpoint is running.",
    version: SCRIPT_VERSION,
    programCode: PROGRAM_CODE,
    programs: [PROGRAM_CODE],
    stripeMode: getStripeModeForHealth_()
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
        stripeMode: getStripeModeForHealth_()
      });
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

  if (products.getLastRow() === 1) {
    products.getRange(2, 1, 1, PRODUCT_HEADERS.length).setValues([[
      PROGRAM_CODE,
      "HB4SUN",
      "Adult Hand Pottery: Any 4 Sunday Sessions",
      "",
      "",
      "10:30 AM",
      "12:30 PM",
      24000,
      13,
      true,
      ""
    ]]);
  }

  [products, attempts, registrations].forEach(function(sheet) {
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, sheet.getLastColumn());
  });

  return "Adult Hand Pottery workbook is ready for version " + SCRIPT_VERSION + ".";
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
  assertProgramCode_(data.programCode);

  const registration = normalizeRegistration_(data);
  const selectedItemCodes = normalizeSelectedItemCodes_(data.selectedItemCodes || data.selectedWeeks);
  const displayedAmountCents = normalizeCents_(data.displayedAmountCents, "displayedAmountCents", true);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const products = requireSheet_(ss, PRODUCTS_SHEET_NAME);
  const pricing = calculateTrustedPricing_(products, selectedItemCodes);

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

  withScriptLock_(function() {
    upsertByColumn_(requireSheet_(ss, ATTEMPTS_SHEET_NAME), ATTEMPT_HEADERS, "orderId", orderId, attempt);
  });

  let checkoutSession;

  try {
    checkoutSession = stripeRequest_("post", "/checkout/sessions", {
      mode: "payment",
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
    withScriptLock_(function() {
      attempt.status = "CHECKOUT_FAILED";
      attempt.updatedAt = new Date().toISOString();
      attempt.lastError = "Stripe Checkout could not be created.";
      upsertByColumn_(requireSheet_(ss, ATTEMPTS_SHEET_NAME), ATTEMPT_HEADERS, "orderId", orderId, attempt);
    });
    throw err;
  }

  if (!checkoutSession || !checkoutSession.id || !checkoutSession.url) {
    throw new Error("Stripe did not return a usable Checkout Session.");
  }

  withScriptLock_(function() {
    attempt.stripeSessionId = sanitizeSessionId_(checkoutSession.id, stripeConfig.mode);
    attempt.status = "CHECKOUT_CREATED";
    attempt.updatedAt = new Date().toISOString();
    upsertByColumn_(requireSheet_(ss, ATTEMPTS_SHEET_NAME), ATTEMPT_HEADERS, "orderId", orderId, attempt);
  });

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

function calculateTrustedPricing_(productsSheet, selectedItemCodes) {
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

  const selectedItems = selectedItemCodes.map(function(itemCode) {
    const item = activeItems[itemCode];

    if (!item) {
      throw clientError_("This class is not currently available.");
    }

    if (item.capacity !== null && countPaidRegistrationsForItem_(itemCode) >= item.capacity) {
      throw clientError_("This class is fully booked.");
    }

    return item;
  });
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
    lastError: ""
  });
}

function verifyPaidSession_(session, attempt, activeMode) {
  const metadata = session.metadata || {};
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
  return {
    studentName: requireText_(data.studentName, "participant name", 100),
    parentName: requireText_(data.parentName, "contact name", 100),
    parentEmail: sanitizeEmail_(data.parentEmail, "contact email"),
    phone: requireText_(data.phone, "phone", 40),
    waiverAccepted: false,
    waiverVersion: "",
    waiverSignedDate: ""
  };
}

function normalizeWaiver_(data) {
  if (!isTruthy_(data.waiverAccepted)) {
    throw clientError_("The waiver must be completed before payment.");
  }

  if (!isTruthy_(data.medicalInformationConfirmed)) {
    throw clientError_("Medical and emergency information must be confirmed.");
  }

  if (!isTruthy_(data.waiverAcknowledged)) {
    throw clientError_("The waiver must be acknowledged.");
  }

  const photoConsent = safeText_(data.photoConsent, 3).toLowerCase();

  if (photoConsent !== "yes" && photoConsent !== "no") {
    throw clientError_("Choose yes or no for photo and video consent.");
  }

  const pickup2 = normalizeOptionalPickup_(data.authorizedPickup2Name, data.authorizedPickup2Phone, 2);
  const pickup3 = normalizeOptionalPickup_(data.authorizedPickup3Name, data.authorizedPickup3Phone, 3);

  return {
    waiverChildFullName: requireText_(data.waiverChildFullName, "participant full name", 100),
    childDateOfBirth: requireDate_(data.childDateOfBirth, "date of birth"),
    waiverParentGuardianFullName: requireText_(data.waiverParentGuardianFullName, "participant or guardian full name", 100),
    waiverParentPhone: requireText_(data.waiverParentPhone, "waiver phone", 40),
    waiverParentEmail: sanitizeEmail_(data.waiverParentEmail, "waiver email"),
    emergencyContactName: requireText_(data.emergencyContactName, "emergency contact name", 100),
    emergencyContactPhone: requireText_(data.emergencyContactPhone, "emergency contact phone", 40),
    emergencyContactRelationship: requireText_(data.emergencyContactRelationship, "emergency contact relationship", 80),
    medicalInformation: requireText_(data.medicalInformation, "medical information", 2000),
    medicalInformationConfirmed: true,
    waiverAcknowledged: true,
    photoConsent: photoConsent,
    authorizedPickup1Name: requireText_(data.authorizedPickup1Name, "authorized person 1 name", 100),
    authorizedPickup1Phone: requireText_(data.authorizedPickup1Phone, "authorized person 1 phone", 40),
    authorizedPickup2Name: pickup2.name,
    authorizedPickup2Phone: pickup2.phone,
    authorizedPickup3Name: pickup3.name,
    authorizedPickup3Phone: pickup3.phone,
    waiverConfirmationName: requireText_(data.waiverConfirmationName, "waiver confirmation name", 100),
    electronicSignature: requireText_(data.electronicSignature, "electronic signature", 100),
    waiverSignedDate: requireDate_(data.waiverSignedDate, "waiver date"),
    waiverVersion: requireText_(data.waiverVersion, "waiver version", 40),
    waiverAccepted: true
  };
}

function normalizeSelectedItemCodes_(value) {
  if (!Array.isArray(value) || value.length !== 1) {
    throw clientError_("Choose the four-session pottery class before payment.");
  }

  const code = String(value[0] || "").trim().toUpperCase();

  if (!/^[A-Z0-9_-]{1,20}$/.test(code)) {
    throw clientError_("Invalid class selection.");
  }

  return [code];
}

function validateReturnUrls_(successValue, cancelValue) {
  return {
    successUrl: validateReturnUrl_(successValue, "success"),
    cancelUrl: validateReturnUrl_(cancelValue, "cancel")
  };
}

function validateReturnUrl_(value, kind) {
  const url = String(value || "").trim();

  if (!/^https:\/\/(?:www\.)?sparkpreneurs\.ca\/hand-building-pottery\/?(?:\?[^#]*)?(?:#[\s\S]*)?$/.test(url)) {
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
    throw clientError_("This registration is not for Adult Hand Pottery.");
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

function countPaidRegistrationsForItem_(itemCode) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(REGISTRATIONS_SHEET_NAME);

  if (!sheet || sheet.getLastRow() < 2) {
    return 0;
  }

  assertRequiredHeaders_(sheet, REGISTRATION_HEADERS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(value) {
    return String(value).trim();
  });
  const indexes = headerIndexes_(headers);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  return rows.filter(function(row) {
    return String(row[indexes.registrationStatus]) === "PAID_VERIFIED" && String(row[indexes.selectedItemCodes]).split(",").map(function(code) {
      return code.trim();
    }).indexOf(itemCode) !== -1;
  }).length;
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
  const missing = headers.filter(function(header) {
    return currentHeaders.indexOf(header) === -1;
  });

  if (missing.length) {
    throw new Error(sheet.getName() + " is missing required columns: " + missing.join(", ") + ".");
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

  if (!Number.isFinite(cents) || Math.round(cents) !== cents || cents < 0 || (!allowZero && cents === 0)) {
    throw clientError_("Invalid " + fieldName + ".");
  }

  return cents;
}

function readTaxRatePercent_(value, itemCode) {
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
  console.log("Adult Hand Pottery request failed: " + String(err && err.message ? err.message : err));
}

function jsonResponse_(object) {
  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}
