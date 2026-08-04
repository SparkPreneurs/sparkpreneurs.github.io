const SPREADSHEET_ID = "1TQP9JF__if3wRZuM0JWpTgHkQfceY8PbFf1QMmx1Ryo";
const PROGRAM_CODE = "august_september_2026_pottery_wheel";
const PROGRAM_NAME = "Pottery Wheel";
const STRIPE_PRODUCT_NAME = "Adult Pottery Wheel - 4 Sessions";
const STRIPE_METADATA_PROGRAM = "adult_pottery_wheel";
const PROGRAM_CATEGORY = "adult_programs";
const PROGRAM_TYPE = "class";
const PROGRAM_SESSIONS = "4";
const CURRENCY = "cad";
const SCRIPT_VERSION = "2026-08-04-pottery-wheel-2";
const STRIPE_API_BASE = "https://api.stripe.com/v1";
const MAX_REQUEST_BYTES = 30000;
const DEFAULT_ENROLLMENT_NOTIFICATION_EMAILS = "sparkpreneurs.ca@gmail.com";

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
  "firstName",
  "lastName",
  "studentName",
  "parentName",
  "parentEmail",
  "phone",
  "experienceLevel",
  "message",
  "consentAccepted",
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

const PRODUCT_ROWS = [
  [PROGRAM_CODE, "POTTERY_WHEEL_MON_EVENING", "Pottery Wheel - Monday Evening Cohort", "2026-08-10", "2026-08-31", "17:30", "19:30", 25000, 0, true, ""],
  [PROGRAM_CODE, "POTTERY_WHEEL_TUE_DAYTIME", "Pottery Wheel - Tuesday Daytime Cohort", "2026-08-11", "2026-09-01", "11:00", "13:00", 25000, 0, true, ""],
  [PROGRAM_CODE, "POTTERY_WHEEL_WED_EVENING", "Pottery Wheel - Wednesday Evening Cohort", "2026-08-12", "2026-09-02", "17:30", "19:30", 25000, 0, true, ""],
  [PROGRAM_CODE, "POTTERY_WHEEL_SAT_AFTERNOON", "Pottery Wheel - Saturday Afternoon Cohort", "2026-08-15", "2026-09-05", "13:00", "15:00", 25000, 0, true, ""]
];

const COHORT_METADATA = {
  POTTERY_WHEEL_MON_EVENING: { id: "pottery-wheel-mon-evening", day: "Monday", time: "17:30-19:30", startDate: "2026-08-10" },
  POTTERY_WHEEL_TUE_DAYTIME: { id: "pottery-wheel-tue-daytime", day: "Tuesday", time: "11:00-13:00", startDate: "2026-08-11" },
  POTTERY_WHEEL_WED_EVENING: { id: "pottery-wheel-wed-evening", day: "Wednesday", time: "17:30-19:30", startDate: "2026-08-12" },
  POTTERY_WHEEL_SAT_AFTERNOON: { id: "pottery-wheel-sat-afternoon", day: "Saturday", time: "13:00-15:00", startDate: "2026-08-15" }
};

function doGet() {
  return jsonResponse_({
    success: true,
    message: "Pottery Wheel registration endpoint is running.",
    version: SCRIPT_VERSION,
    programCode: PROGRAM_CODE,
    stripeMode: getStripeModeForHealth_()
  });
}

function doPost(e) {
  try {
    const data = parseRequest_(e);
    const action = String(data.action || "");

    if (action === "ping") {
      return jsonResponse_({
        success: true,
        version: SCRIPT_VERSION,
        programCode: PROGRAM_CODE,
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
    products.getRange(2, 1, PRODUCT_ROWS.length, PRODUCT_HEADERS.length).setValues(PRODUCT_ROWS);
  }

  [products, attempts, registrations].forEach(function(sheet) {
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, sheet.getLastColumn());
  });

  return "Pottery Wheel workbook is ready for version " + SCRIPT_VERSION + ".";
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
  const selectedItemCodes = normalizeSelectedItemCodes_(data.selectedItemCodes);
  const displayedAmountCents = normalizeCents_(data.displayedAmountCents, "displayedAmountCents", true);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const pricing = calculateTrustedPricing_(requireSheet_(ss, PRODUCTS_SHEET_NAME), selectedItemCodes);

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
    checkoutSession = stripeRequest_("post", "/checkout/sessions", buildStripeCheckoutPayload_(registration, pricing, orderId, urls), stripeConfig);
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

function buildStripeCheckoutPayload_(registration, pricing, orderId, urls) {
  const cohort = getCohortMetadata_(pricing.selectedItems[0]);
  const selectedItemCodes = pricing.selectedItems.map(function(item) {
    return item.itemCode;
  }).join(",");

  return {
    mode: "payment",
    success_url: urls.successUrl,
    cancel_url: urls.cancelUrl,
    customer_email: registration.parentEmail,
    client_reference_id: orderId,
    billing_address_collection: "auto",
    "phone_number_collection[enabled]": "true",
    "line_items[0][price_data][currency]": CURRENCY,
    "line_items[0][price_data][product_data][name]": STRIPE_PRODUCT_NAME,
    "line_items[0][price_data][product_data][description]": pricing.selectedItems.map(function(item) {
      return item.itemName;
    }).join(", "),
    "line_items[0][price_data][unit_amount]": String(pricing.totalCents),
    "line_items[0][quantity]": "1",
    "metadata[orderId]": orderId,
    "metadata[program]": STRIPE_METADATA_PROGRAM,
    "metadata[programCode]": PROGRAM_CODE,
    "metadata[category]": PROGRAM_CATEGORY,
    "metadata[program_type]": PROGRAM_TYPE,
    "metadata[sessions]": PROGRAM_SESSIONS,
    "metadata[cohort_id]": cohort.id,
    "metadata[cohort_day]": cohort.day,
    "metadata[cohort_time]": cohort.time,
    "metadata[start_date]": cohort.startDate,
    "metadata[registration_reference]": orderId,
    "metadata[selectedItemCodes]": selectedItemCodes,
    "metadata[expectedAmountCents]": String(pricing.totalCents),
    "payment_intent_data[metadata][orderId]": orderId,
    "payment_intent_data[metadata][program]": STRIPE_METADATA_PROGRAM,
    "payment_intent_data[metadata][programCode]": PROGRAM_CODE,
    "payment_intent_data[metadata][cohort_id]": cohort.id,
    "payment_intent_data[metadata][registration_reference]": orderId
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

    if (activeItems[itemCode]) {
      throw new Error("Duplicate active Products row for " + itemCode + ".");
    }

    activeItems[itemCode] = {
      itemCode: itemCode,
      itemName: requireProductText_(row[indexes.itemName], "item name for " + itemCode, 160),
      startDate: normalizeProductDate_(row[indexes.startDate], itemCode),
      endDate: normalizeProductDate_(row[indexes.endDate], itemCode),
      startTime: normalizeTime_(row[indexes.startTime], "start time for " + itemCode),
      endTime: normalizeTime_(row[indexes.endTime], "end time for " + itemCode),
      priceCents: normalizeCents_(row[indexes.priceCents], "priceCents for " + itemCode, false),
      taxRatePercent: readTaxRatePercent_(row[indexes.taxRatePercent], itemCode),
      capacity: readCapacity_(row[indexes.capacity], itemCode)
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

function getCohortMetadata_(item) {
  const cohort = COHORT_METADATA[item.itemCode];

  if (!cohort || cohort.startDate !== item.startDate || cohort.time !== item.startTime + "-" + item.endTime) {
    throw new Error("The Products row does not match the Pottery Wheel cohort configuration.");
  }

  return cohort;
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
  const selectedItemCodes = String(attempt.selectedItemCodes || "").replace(/,\s*/g, ",");
  const itemCode = selectedItemCodes;
  const cohort = getCohortMetadata_({
    itemCode: itemCode,
    startDate: String(metadata.start_date || ""),
    startTime: String(metadata.cohort_time || "").split("-")[0],
    endTime: String(metadata.cohort_time || "").split("-")[1]
  });

  if (session.payment_status !== "paid") {
    throw new Error("Stripe did not report a paid Checkout Session.");
  }

  if (Number(session.amount_total) !== expectedAmountCents) {
    throw new Error("Stripe amount does not match the trusted registration amount.");
  }

  if (String(session.currency || "").toLowerCase() !== CURRENCY) {
    throw new Error("Stripe currency does not match the expected currency.");
  }

  if (String(metadata.program || "") !== STRIPE_METADATA_PROGRAM || String(metadata.programCode || "") !== PROGRAM_CODE || String(metadata.orderId || "") !== String(attempt.orderId)) {
    throw new Error("Stripe Checkout metadata does not match this registration.");
  }

  if (String(metadata.registration_reference || "") !== String(attempt.orderId) || String(metadata.selectedItemCodes || "") !== selectedItemCodes || Number(metadata.expectedAmountCents) !== expectedAmountCents) {
    throw new Error("Stripe Checkout items do not match this registration.");
  }

  if (String(metadata.cohort_id || "") !== cohort.id || String(metadata.cohort_day || "") !== cohort.day || String(metadata.cohort_time || "") !== cohort.time || String(metadata.start_date || "") !== cohort.startDate) {
    throw new Error("Stripe Checkout cohort metadata does not match this registration.");
  }

  if (String(session.client_reference_id || "") !== String(attempt.orderId)) {
    throw new Error("Stripe Checkout reference does not match this registration.");
  }

  sanitizeSessionId_(session.id, activeMode);
}

function normalizeRegistration_(data) {
  const firstName = requireText_(data.firstName, "first name", 60);
  const lastName = requireText_(data.lastName, "last name", 60);
  const experienceLevel = String(data.experienceLevel || "").trim().toLowerCase();

  if (["beginner", "some-experience", "experienced"].indexOf(experienceLevel) === -1) {
    throw clientError_("Choose a valid experience level.");
  }

  if (!isTruthy_(data.consent)) {
    throw clientError_("You must accept the registration and privacy terms before payment.");
  }

  const studentName = firstName + " " + lastName;

  return {
    firstName: firstName,
    lastName: lastName,
    studentName: studentName,
    parentName: studentName,
    parentEmail: sanitizeEmail_(data.email, "email"),
    phone: requireText_(data.phone, "phone", 40),
    experienceLevel: experienceLevel,
    message: safeText_(data.message, 1000),
    consentAccepted: true,
    waiverChildFullName: "",
    childDateOfBirth: "",
    waiverParentGuardianFullName: "",
    waiverParentPhone: "",
    waiverParentEmail: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelationship: "",
    medicalInformation: "",
    medicalInformationConfirmed: false,
    waiverAcknowledged: false,
    photoConsent: "",
    authorizedPickup1Name: "",
    authorizedPickup1Phone: "",
    authorizedPickup2Name: "",
    authorizedPickup2Phone: "",
    authorizedPickup3Name: "",
    authorizedPickup3Phone: "",
    waiverConfirmationName: "",
    electronicSignature: "",
    waiverSignedDate: "",
    waiverVersion: "",
    waiverAccepted: false
  };
}

function normalizeSelectedItemCodes_(value) {
  if (!Array.isArray(value) || value.length !== 1) {
    throw clientError_("Choose one four-session Pottery Wheel cohort before payment.");
  }

  const code = String(value[0] || "").trim().toUpperCase();

  if (!/^[A-Z0-9_-]{1,64}$/.test(code)) {
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
  const text = String(value || "").trim();
  let url;

  try {
    url = new URL(text);
  } catch (err) {
    throw clientError_("Invalid payment return address.");
  }

  if (url.protocol !== "https:" || ["sparkpreneurs.ca", "www.sparkpreneurs.ca"].indexOf(url.hostname) === -1 || ["/pottery-wheel", "/pottery-wheel/"].indexOf(url.pathname) === -1 || url.username || url.password || url.port) {
    throw clientError_("Invalid payment return address.");
  }

  if (kind === "success" && url.searchParams.get("session_id") !== "{CHECKOUT_SESSION_ID}") {
    throw clientError_("Invalid payment return address.");
  }

  return url.toString();
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
    throw clientError_("This registration is not for Pottery Wheel.");
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

function requireProductText_(value, fieldName, maxLength) {
  const text = safeText_(value, maxLength);

  if (!text) {
    throw new Error("Missing " + fieldName + ".");
  }

  return text;
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

function normalizeProductDate_(value, itemCode) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  const date = safeText_(value, 10);
  const parsed = new Date(date + "T00:00:00Z");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Invalid date for " + itemCode + ".");
  }

  return date;
}

function normalizeTime_(value, fieldName) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "HH:mm");
  }

  const time = safeText_(value, 5);

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("Invalid " + fieldName + ".");
  }

  return time;
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
  console.log("Pottery Wheel request failed: " + String(err && err.message ? err.message : err));
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
    console.log("Pottery Wheel enrollment email failed: " + String(error && error.message ? error.message : error));
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
