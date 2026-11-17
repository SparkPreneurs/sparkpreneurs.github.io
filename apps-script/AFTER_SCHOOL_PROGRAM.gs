const PROGRAM_CODE = "after_school_program";
const PROGRAM_NAME = "After School Program";
const MINIMUM_WEEKS = 4;
const MAXIMUM_WEEKS = 12;
const MAXIMUM_CHILDREN = 30;
const CURRENCY = "cad";
const SCRIPT_VERSION = "2026-11-16-after-school-4";
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

const LEGACY_ATTEMPT_HEADERS = [
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

const BOOKING_HEADERS = ["startDate", "endDate", "weekCount", "paidWeekStarts", "monthsCovered"];
const CHECKOUT_HEADERS = ["discountCode", "discountCents", "checkoutVersion"];
const ATTEMPT_HEADERS = LEGACY_ATTEMPT_HEADERS.concat(BOOKING_HEADERS, CHECKOUT_HEADERS);
const REGISTRATION_HEADERS = LEGACY_ATTEMPT_HEADERS.concat([
  "paidAt",
  "stripePaymentIntentId",
  "stripePaymentStatus",
  "registrationStatus"
]).concat(BOOKING_HEADERS, CHECKOUT_HEADERS);

const DEFAULT_PRODUCTS = [
  {
    programCode: PROGRAM_CODE,
    itemCode: "AFTER3",
    itemName: "After School Program: 3 days/week",
    startDate: "",
    endDate: "",
    startTime: "3 PM",
    endTime: "5 PM",
    priceCents: 8400,
    taxRatePercent: 13,
    active: true,
    capacity: MAXIMUM_CHILDREN
  },
  {
    programCode: PROGRAM_CODE,
    itemCode: "AFTER4",
    itemName: "After School Program: 4 days/week",
    startDate: "",
    endDate: "",
    startTime: "3 PM",
    endTime: "5 PM",
    priceCents: 10400,
    taxRatePercent: 13,
    active: true,
    capacity: MAXIMUM_CHILDREN
  },
  {
    programCode: PROGRAM_CODE,
    itemCode: "AFTER5",
    itemName: "After School Program: 5 days/week",
    startDate: "",
    endDate: "",
    startTime: "3 PM",
    endTime: "5 PM",
    priceCents: 12000,
    taxRatePercent: 13,
    active: true,
    capacity: MAXIMUM_CHILDREN
  }
];

function doGet() { return jsonResponse_(health_()); }


function doPost(event) {
  try {
    const data = JSON.parse(getRequestBody_(event));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw clientError_("Invalid request data.");
    if (data.action === "ping") return jsonResponse_(health_());
    requireProgramCode_(data.programCode);
    if (data.action === "getBookingCalendar") return jsonResponse_(getPublicBookingCalendar_());
    if (data.action === "quoteCheckout") return jsonResponse_(quoteCheckout_(data));
    if (data.action === "createCheckoutSession") return jsonResponse_(createCheckoutSession_(data));
    if (data.action === "verifyCheckoutSession") return jsonResponse_(verifyCheckoutSession_(data));
    throw clientError_("Unknown request action.");
  } catch (error) {
    console.log("After School request failed: " + String(error && error.message || error));
    return jsonResponse_({ success: false, error: publicErrorMessage_(error) });
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
    spreadsheetId: PropertiesService.getScriptProperties().getProperty("AFTER_SCHOOL_SPREADSHEET_ID"),
    productCount: DEFAULT_PRODUCTS.length
  };
}

function authorizeRequiredServices() {
  const spreadsheet = getSpreadsheet_();
  [ [PRODUCTS_SHEET_NAME, PRODUCT_HEADERS], [ATTEMPTS_SHEET_NAME, ATTEMPT_HEADERS], [REGISTRATIONS_SHEET_NAME, REGISTRATION_HEADERS] ].forEach(function(pair) {
    assertSheetHeaders_(spreadsheet.getSheetByName(pair[0]), pair[1]);
  });
  getPublicBookingCalendar_();
  const config = getStripeConfig_();
  stripeGet_("checkout/sessions", { limit: 1 });
  MailApp.getRemainingDailyQuota();
  return { success: true, message: "Calendar, workbook, mail permissions and Stripe access are authorized.", stripeMode: config.mode };
}


function createCheckoutSession_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return createCheckoutSessionLocked_(data); }
  finally { lock.releaseLock(); }
}


function createCheckoutSessionLocked_(data) {
  requireProgramCode_(data.programCode);
  const booking = normalizeBooking_(data);
  const registration = Object.assign(normalizeRegistration_(data), booking, { programCode: PROGRAM_CODE });
  const codes = normalizeSelectedItemCodes_(data.selectedItemCodes);
  const pricing = calculateTrustedPricing_(codes, booking);
  discountApplyPricing_(data, pricing, pricing.items[0].taxRatePercent);
  if (!Number.isSafeInteger(data.displayedAmountCents) || data.displayedAmountCents !== pricing.expectedAmountCents) {
    throw clientError_("The total changed. Review your total again before payment.");
  }
  const urls = validateReturnUrls_(data.successUrl, data.cancelUrl);
  const config = getStripeConfig_();
  const orderId = createOrderId_();
  appendAttempt_(Object.assign({}, registration, {
    createdAt: nowIso_(), updatedAt: nowIso_(), orderId: orderId, stripeSessionId: "",
    stripeMode: config.mode, status: "CREATING_CHECKOUT", checkoutVersion: 1,
    selectedItemCodes: pricing.itemCodes.join(","), selectedItemNames: pricing.itemNames.join(" | "),
    subtotalCents: pricing.subtotalCents, taxCents: pricing.taxCents, expectedAmountCents: pricing.expectedAmountCents,
    discountCode: pricing.discountCode || "", discountCents: pricing.discountCents || 0, lastError: ""
  }));
  try { discountReservePricing_(pricing, orderId); }
  catch (error) {
    updateAttemptByOrderId_(orderId, { status: "CHECKOUT_FAILED", updatedAt: nowIso_(), lastError: "Discount reservation failed before requesting Stripe." });
    throw error;
  }
  let session;
  try { session = createStripeCheckoutSession_(orderId, pricing, registration, urls); }
  catch (error) {
    updateAttemptByOrderId_(orderId, { status: "CHECKOUT_UNKNOWN", updatedAt: nowIso_(), lastError: "Stripe outcome requires review before releasing the reserved weeks." });
    throw error;
  }
  if (!session || !session.url || !/^https:\/\/checkout\.stripe\.com\//.test(String(session.url))) throw new Error("Stripe returned no usable checkout link.");
  const sessionId = sanitizeSessionId_(session.id);
  updateAttemptByOrderId_(orderId, { stripeSessionId: sessionId, status: "CHECKOUT_CREATED", updatedAt: nowIso_(), lastError: "" });
  discountAttachSession_(pricing, orderId, session);
  return { success: true, checkoutUrl: session.url, stripeSessionId: sessionId, expectedAmountCents: pricing.expectedAmountCents };
}

function verifyCheckoutSession_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return verifyCheckoutSessionLocked_(data); }
  finally { lock.releaseLock(); }
}

function verifyCheckoutSessionLocked_(data) {
  const sessionId = sanitizeSessionId_(data.sessionId || data.stripeSessionId);
  const session = stripeGet_("checkout/sessions/" + encodeURIComponent(sessionId), { "expand[]": "payment_intent" });
  const attempt = getAttemptBySessionId_(sessionId);
  if (!attempt) throw clientError_("Registration record could not be found for this checkout.");
  verifySessionIdentity_(session, attempt, sessionId);
  if (session.payment_status !== "paid") {
    if (session.status === "expired" && attempt.status !== "PAID") updateAttemptByOrderId_(attempt.orderId, { status: "EXPIRED", updatedAt: nowIso_() });
    return { success: true, paid: false, paymentStatus: session.payment_status || "unpaid" };
  }
  discountConfirmSession_(sessionId);
  const existing = readRows_(getSpreadsheet_().getSheetByName(REGISTRATIONS_SHEET_NAME), REGISTRATION_HEADERS).some(function(row) {
    return String(row.stripeSessionId) === sessionId;
  });
  if (!existing) {
    const paidAt = nowIso_();
    const intent = session.payment_intent;
    const registration = Object.assign({}, attempt, { updatedAt: paidAt, status: "PAID", paidAt: paidAt,
      stripePaymentIntentId: typeof intent === "object" && intent ? intent.id : String(intent || ""),
      stripePaymentStatus: "paid", registrationStatus: "Registered", lastError: "" });
    upsertRegistrationBySessionId_(registration);
    updateAttemptByOrderId_(attempt.orderId, { updatedAt: paidAt, status: "PAID", lastError: "" });
    sendEnrollmentNotificationSafely_(registration, paidAt);
  } else updateAttemptByOrderId_(attempt.orderId, { updatedAt: nowIso_(), status: "PAID", lastError: "" });
  return { success: true, paid: true, paymentStatus: "paid", alreadyRecorded: existing,
    message: existing ? "Payment was already verified. Your registration is on file." : "Payment verified. Your selected weeks have been recorded." };
}


function createStripeCheckoutSession_(orderId, pricing, registration, urls) {
  return stripePost_("checkout/sessions", {
    mode: "payment", "payment_method_types[0]": "card", expires_at: String(Math.floor(Date.now() / 1000) + 1800),
    success_url: urls.successUrl, cancel_url: urls.cancelUrl, customer_email: registration.parentEmail, client_reference_id: orderId,
    "metadata[programCode]": PROGRAM_CODE, "metadata[orderId]": orderId,
    "metadata[selectedItemCodes]": pricing.itemCodes.join(","), "metadata[expectedAmountCents]": String(pricing.expectedAmountCents),
    "metadata[startDate]": registration.startDate, "metadata[weekCount]": String(registration.weekCount),
    "payment_intent_data[metadata][programCode]": PROGRAM_CODE, "payment_intent_data[metadata][orderId]": orderId,
    "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": CURRENCY,
    "line_items[0][price_data][unit_amount]": String(pricing.expectedAmountCents),
    "line_items[0][price_data][product_data][name]": PROGRAM_NAME,
    "line_items[0][price_data][product_data][description]": pricing.itemNames.join(" | ")
  }, PROGRAM_CODE + ":" + orderId);
}


function calculateTrustedPricing_(selectedItemCodes, booking) {
  if (selectedItemCodes.length !== 1) throw clientError_("Choose one weekly plan.");
  const product = getActiveProducts_()[selectedItemCodes[0]];
  if (!product) throw clientError_("Selected plan is not currently available.");
  const reserved = reservedPlacesByWeek_();
  const capacity = getWeeklyCapacity_();
  booking.paidWeekStarts.split(/,\s*/).forEach(function(week) {
    if ((reserved[week] || 0) >= capacity) throw clientError_("One of your selected weeks is fully booked. Choose a different starting week or duration.");
  });
  const weeklyPriceCents = Number(product.priceCents), taxRate = Number(product.taxRatePercent);
  if (!Number.isSafeInteger(weeklyPriceCents) || weeklyPriceCents <= 0 || String(product.taxRatePercent).trim() === "" || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) throw new Error("Configure a valid weekly price and confirmed tax for " + product.itemCode + ".");
  const subtotal = weeklyPriceCents * booking.weekCount, tax = Math.round(subtotal * taxRate / 100);
  if (!Number.isSafeInteger(subtotal + tax)) throw new Error("Invalid registration total.");
  const name = product.itemName + " (" + booking.weekCount + " weeks: " + booking.startDate + " to " + booking.endDate + ")";
  return { items: [{ itemCode: product.itemCode, itemName: name, weeklyPriceCents: weeklyPriceCents, taxRatePercent: taxRate,
    subtotalCents: subtotal, taxCents: tax, totalCents: subtotal + tax }], itemCodes: selectedItemCodes, itemNames: [name],
    subtotalCents: subtotal, taxCents: tax, totalCents: subtotal + tax, expectedAmountCents: subtotal + tax };
}


function getActiveProducts_() {
  const products = {};
  readRows_(getSpreadsheet_().getSheetByName(PRODUCTS_SHEET_NAME), PRODUCT_HEADERS).forEach(function(row) {
    if (row.programCode !== PROGRAM_CODE || !isTruthy_(row.active)) return;
    const code = String(row.itemCode || "").trim();
    if (["AFTER3", "AFTER4", "AFTER5"].indexOf(code) === -1 || products[code]) throw new Error("Invalid or duplicate After School product code: " + code);
    const price = Number(row.priceCents), tax = Number(row.taxRatePercent);
    if (!Number.isSafeInteger(price) || price <= 0 || String(row.taxRatePercent).trim() === "" || !Number.isFinite(tax) || tax < 0 || tax > 100) throw new Error("Configure a valid price and confirmed tax for " + code);
    products[code] = row;
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
  if (!Array.isArray(value) || value.length !== 1 || ["AFTER3", "AFTER4", "AFTER5"].indexOf(value[0]) === -1) throw clientError_("Choose one valid weekly plan.");
  return [value[0]];
}


function validateReturnUrls_(successValue, cancelValue) {
  return {
    successUrl: validateReturnUrl_(successValue, "success"),
    cancelUrl: validateReturnUrl_(cancelValue, "cancel")
  };
}

function requireProgramCode_(value) {
  if (String(value || "").trim() !== PROGRAM_CODE) {
    throw clientError_("Registration program does not match this checkout.");
  }
}

function validateReturnUrl_(value, kind) {
  const url = requireText_(value, kind + " URL", 500);
  const production = /^https:\/\/(?:www\.)?sparkpreneurs\.ca\/after-school\/?(?:\?[^#]*)?(?:#[\s\S]*)?$/.test(url);
  const localTest = getStripeMode_() === "test" && /^http:\/\/localhost:4321\/after-school\/?(?:\?[^#]*)?(?:#[\s\S]*)?$/.test(url);
  if (!production && !localTest) throw clientError_("Checkout return URL is not allowed.");
  const query = url.split("#")[0].split("?")[1] || "";
  if (kind === "success" && !/(?:^|&)session_id=\{CHECKOUT_SESSION_ID\}(?:&|$)/.test(query)) throw clientError_("Checkout success URL must include the session placeholder.");
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
  if (sheet.getLastColumn() > width) throw new Error("Unexpected extra columns in " + sheetName + ". Preserve data and review the schema before upgrading.");
  if (sheet.getMaxColumns() < width) sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns());
  const currentHeaders = sheet.getRange(1, 1, 1, width).getValues()[0];
  const missingHeaders = headers.some(function(header, index) {
    return String(currentHeaders[index] || "").trim() !== header;
  });

  if (missingHeaders) {
    currentHeaders.forEach(function(value, index) {
      if (String(value || "").trim() && String(value).trim() !== headers[index]) {
        throw clientError_("Unexpected sheet columns. Preserve existing data and review the headers before setup.");
      }
    });
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
  assertSheetHeaders_(sheet, headers);
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
          sheet.getRange(rowNumber, index + 1).setValue(safeCell_(updates[header]));
        }
      });
      return true;
    }
  }

  return false;
}

function appendByHeaders_(sheet, headers, data) {
  assertSheetHeaders_(sheet, headers);
  const values = headers.map(function(header) {
    return Object.prototype.hasOwnProperty.call(data, header) ? safeCell_(data[header]) : "";
  });
  sheet.appendRow(values);
}

function readRows_(sheet, headers) {
  assertSheetHeaders_(sheet, headers);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function(row) {
    const item = {};
    headers.forEach(function(header, index) {
      const value = row[index];
      if ((header === "startDate" || header === "endDate") && Object.prototype.toString.call(value) === "[object Date]") {
        // ISO date strings can return as UTC-midnight Dates, even in a
        // western workbook timezone. Preserve that original ISO day.
        // Dates stored at local midnight still use the workbook timezone.
        const utcMidnight = value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0;
        item[header] = utcMidnight ? value.toISOString().slice(0, 10) : Utilities.formatDate(value, sheet.getParent().getSpreadsheetTimeZone(), "yyyy-MM-dd");
      } else item[header] = value;
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

function stripePost_(path, params, idempotencyKey) {
  return stripeRequest_(path, "post", params, idempotencyKey);
}

function stripeGet_(path, params) {
  return stripeRequest_(path, "get", params || {});
}

function stripeRequest_(path, method, params, idempotencyKey) {
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

  if (idempotencyKey) options.headers["Idempotency-Key"] = idempotencyKey;
  if (method === "post") {
    options.payload = query;
    options.contentType = "application/x-www-form-urlencoded";
  }

  const response = UrlFetchApp.fetch(url, options);
  const text = response.getContentText();
  const parsed = text ? JSON.parse(text) : {};
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    const message = parsed && parsed.error && parsed.error.message ? parsed.error.message : "Stripe request failed.";
    console.log("Stripe request failed: " + message);
    throw new Error("Stripe request failed.");
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
  const mode = String(PropertiesService.getScriptProperties().getProperty("STRIPE_MODE") || "").trim().toLowerCase();
  if (mode !== "test" && mode !== "live") throw new Error("Set STRIPE_MODE to test or live.");
  return mode;
}


function formEncode_(params) {
  return Object.keys(params).map(function(key) {
    return encodeURIComponent(key) + "=" + encodeURIComponent(String(params[key]));
  }).join("&");
}

function getRequestBody_(event) {
  const contents = event && event.postData && event.postData.contents;
  if (typeof contents !== "string" || !contents.trim()) throw clientError_("Missing request data. Run testAfterSchoolConfiguration from the editor instead of doPost.");
  if (Utilities.newBlob(contents).getBytes().length > MAX_REQUEST_BYTES) throw clientError_("Request is too large.");
  return contents;
}


function getSpreadsheet_() {
  const spreadsheetId = String(PropertiesService.getScriptProperties().getProperty("AFTER_SCHOOL_SPREADSHEET_ID") || "").trim();
  if (!spreadsheetId) throw new Error("Set AFTER_SCHOOL_SPREADSHEET_ID in Script Properties.");
  return SpreadsheetApp.openById(spreadsheetId);
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

function sendEnrollmentNotificationSafely_(registration, paidAt) {
  try {
    sendEnrollmentNotification_({
      programName: PROGRAM_NAME,
      participantName: registration.studentName,
      contactName: registration.parentName,
      contactEmail: registration.parentEmail,
      phone: registration.phone,
      selectedItemNames: registration.selectedItemNames,
      startDate: registration.startDate,
      endDate: registration.endDate,
      weekCount: registration.weekCount,
      paidWeekStarts: registration.paidWeekStarts,
      amountCents: registration.expectedAmountCents,
      paidAt: paidAt,
      orderId: registration.orderId,
      stripeSessionId: registration.stripeSessionId
    });
  } catch (error) {
    console.log("After School enrollment email failed: " + String(error && error.message ? error.message : error));
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
    "Dates: " + String(details.startDate || "") + " to " + String(details.endDate || ""),
    "Weeks: " + String(details.weekCount || ""),
    "Purchased Mondays: " + String(details.paidWeekStarts || ""),
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


function safeCell_(value) {
  return typeof value === "string" && /^[=+@-]/.test(value) ? "'" + value : value;
}

function bookingDate_(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw clientError_("Choose a valid starting Monday.");
  const date = new Date(value + "T12:00:00Z");
  if (!isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCDay() !== 1) throw clientError_("Choose a valid starting Monday.");
  return date;
}

// First Monday is always strictly after today in Toronto time.
// Optional BOOKING_LAST_WEEK: final purchasable Monday, YYYY-MM-DD.
// Optional BOOKING_CLOSED_WEEKS: JSON array of closed Mondays.
function getBookingCalendar_() {
  const props = PropertiesService.getScriptProperties();
  const today = Utilities.formatDate(new Date(), "America/Toronto", "yyyy-MM-dd");
  const first = new Date(today + "T12:00:00Z");
  first.setUTCDate(first.getUTCDate() + ((8 - first.getUTCDay()) % 7 || 7));
  const firstWeek = first.toISOString().slice(0, 10);
  const lastWeek = String(props.getProperty("BOOKING_LAST_WEEK") || "").trim();
  if (lastWeek) bookingDate_(lastWeek);
  const closedWeeks = JSON.parse(props.getProperty("BOOKING_CLOSED_WEEKS") || "[]");
  if (!Array.isArray(closedWeeks)) throw new Error("BOOKING_CLOSED_WEEKS must be a JSON array of Mondays.");
  closedWeeks.forEach(bookingDate_);
  return { firstWeek: firstWeek, lastWeek: lastWeek, closedWeeks: closedWeeks, minimumWeeks: MINIMUM_WEEKS, maximumWeeks: MAXIMUM_WEEKS };
}


function normalizeBooking_(data) {
  const calendar = getBookingCalendar_();
  const date = bookingDate_(data.startDate);
  const count = data.weekCount;
  if (typeof count !== "number" || !Number.isInteger(count) || count < MINIMUM_WEEKS || count > MAXIMUM_WEEKS) throw clientError_("Choose between 4 and 12 whole weeks.");
  const today = Utilities.formatDate(new Date(), "America/Toronto", "yyyy-MM-dd");
  if (data.startDate <= today || data.startDate < calendar.firstWeek) throw clientError_("Choose an upcoming available week.");
  const weeks = [];
  const months = {};
  for (let i = 0; i < count; i++) {
    const week = new Date(date);
    week.setUTCDate(week.getUTCDate() + i * 7);
    const iso = week.toISOString().slice(0, 10);
    if ((calendar.lastWeek && iso > calendar.lastWeek) || calendar.closedWeeks.indexOf(iso) !== -1) throw clientError_("Your selection includes an unavailable week. Choose a different consecutive block.");
    weeks.push(iso);
    // Include both months when a Monday-Friday week crosses a month boundary.
    for (let day = 0; day < 5; day++) {
      const covered = new Date(week);
      covered.setUTCDate(covered.getUTCDate() + day);
      months[covered.toISOString().slice(0, 7)] = true;
    }
  }
  const end = new Date(date);
  end.setUTCDate(end.getUTCDate() + (count - 1) * 7 + 4);
  return { startDate: data.startDate, endDate: end.toISOString().slice(0, 10), weekCount: count, paidWeekStarts: weeks.join(", "), monthsCovered: Object.keys(months).sort().join(", ") };
}

// Run on an Apps Script time trigger to record payments even if a parent
// closes the browser before returning. Verification remains idempotent.
function reconcilePendingPayments() {
  const pending = readRows_(getSpreadsheet_().getSheetByName(ATTEMPTS_SHEET_NAME), ATTEMPT_HEADERS).filter(function(attempt) {
    return attempt.programCode === PROGRAM_CODE && attempt.stripeMode === getStripeMode_() && ["PAID", "EXPIRED", "CHECKOUT_FAILED"].indexOf(String(attempt.status)) === -1;
  });
  pending.filter(function(attempt) { return !attempt.stripeSessionId; }).forEach(function(attempt) {
    console.log("Review unresolved checkout order: " + attempt.orderId);
  });
  pending.filter(function(attempt) { return Boolean(attempt.stripeSessionId); }).slice(0, 50).forEach(function(attempt) {
    try { verifyCheckoutSession_({ sessionId: String(attempt.stripeSessionId) }); }
    catch (error) { console.log("Payment reconciliation failed for order " + attempt.orderId + ": " + String(error && error.message || error)); }
  });
}


function quoteCheckout_(data) {
  requireProgramCode_(data.programCode);
  const booking = normalizeBooking_(data);
  const pricing = calculateTrustedPricing_(normalizeSelectedItemCodes_(data.selectedItemCodes), booking);
  return discountPricingResponse_(discountApplyPricing_(data, pricing, pricing.items[0].taxRatePercent));
}

function health_() {
  const mode = String(PropertiesService.getScriptProperties().getProperty("STRIPE_MODE") || "").trim().toLowerCase();
  return { success: true, programCode: PROGRAM_CODE, programName: PROGRAM_NAME, version: SCRIPT_VERSION,
    bookingVersion: 1, checkoutVersion: 1, minimumWeeks: MINIMUM_WEEKS, maximumWeeks: MAXIMUM_WEEKS,
    stripeMode: mode === "test" || mode === "live" ? mode : "not-configured", discountsSupported: discountServiceConfigured_() };
}

function getWeeklyCapacity_() {
  const raw = PropertiesService.getScriptProperties().getProperty("AFTER_SCHOOL_WEEKLY_CAPACITY");
  const capacity = raw === null || raw === undefined || String(raw).trim() === "" ? MAXIMUM_CHILDREN : Number(raw);
  if (!Number.isInteger(capacity) || capacity < 0 || capacity > MAXIMUM_CHILDREN) throw new Error("AFTER_SCHOOL_WEEKLY_CAPACITY must be a whole number from 0 to 30.");
  return capacity;
}

function reservedPlacesByWeek_() {
  const reserved = {};
  readRows_(getSpreadsheet_().getSheetByName(ATTEMPTS_SHEET_NAME), ATTEMPT_HEADERS).forEach(function(attempt) {
    if (attempt.programCode !== PROGRAM_CODE || ["EXPIRED", "CHECKOUT_FAILED"].indexOf(String(attempt.status)) !== -1) return;
    const weeks = String(attempt.paidWeekStarts || "").split(/,\s*/).filter(Boolean);
    if (!weeks.length) throw new Error("Legacy checkout " + attempt.orderId + " has no purchased weeks. Review its dates before enabling new bookings.");
    const seen = {};
    weeks.forEach(function(week) { bookingDate_(week); if (!seen[week]) { reserved[week] = (reserved[week] || 0) + 1; seen[week] = true; } });
  });
  return reserved;
}

function getPublicBookingCalendar_() {
  const calendar = getBookingCalendar_(), reserved = reservedPlacesByWeek_(), capacity = getWeeklyCapacity_();
  const products = getActiveProducts_();
  return Object.assign({ success: true }, calendar, {
    weeklyCapacity: capacity,
    unavailableWeeks: Object.keys(reserved).filter(function(week) { return reserved[week] >= capacity; }),
    products: Object.keys(products).map(function(code) {
      const product = products[code];
      return { itemCode: code, weeklyPriceCents: Number(product.priceCents), taxRatePercent: Number(product.taxRatePercent) };
    })
  });
}

function sanitizeSessionId_(value) {
  const id = String(value || "");
  const prefix = getStripeMode_() === "live" ? "cs_live_" : "cs_test_";
  if (id.length > 200 || id.indexOf(prefix) !== 0 || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) throw clientError_("Invalid checkout session for this payment mode.");
  return id;
}

function verifySessionIdentity_(session, attempt, sessionId) {
  const mode = getStripeMode_();
  const metadata = session && session.metadata || {};
  if (!session || session.object !== "checkout.session" || session.id !== sessionId || session.mode !== "payment" || session.livemode !== (mode === "live")) throw new Error("Stripe session mode or identity mismatch.");
  if (attempt.programCode !== PROGRAM_CODE || attempt.stripeMode !== mode || metadata.programCode !== PROGRAM_CODE || metadata.orderId !== attempt.orderId || session.client_reference_id !== attempt.orderId) throw new Error("Payment does not match its saved registration.");
  const amount = Number(attempt.expectedAmountCents);
  if (!Number.isSafeInteger(amount) || amount <= 0 || session.amount_total !== amount || String(session.currency).toLowerCase() !== CURRENCY) throw new Error("Payment amount or currency mismatch.");
  if (Number(attempt.checkoutVersion) === 1) {
    const expected = { expectedAmountCents: String(amount), selectedItemCodes: String(attempt.selectedItemCodes), startDate: attempt.startDate, weekCount: String(attempt.weekCount) };
    const mismatches = Object.keys(expected).filter(function(field) { return metadata[field] !== expected[field]; });
    if (mismatches.length) throw new Error("Purchased plan or weeks do not match the saved registration: " + mismatches.join(", ") + ".");
  }
}

function assertSheetHeaders_(sheet, headers) {
  if (!sheet) throw new Error("Missing workbook tab. Run setupPeriodWorkbook first.");
  if (sheet.getMaxColumns() < headers.length) throw new Error("Run setupPeriodWorkbook to extend the workbook columns.");
  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  if (current.length !== headers.length || headers.some(function(header, i) { return String(current[i] || "").trim() !== header; })) throw new Error("Unexpected columns in " + sheet.getName() + ". Run setupPeriodWorkbook to append the supported columns without reordering existing data.");
}

function testAfterSchoolConfiguration() {
  const result = getPublicBookingCalendar_();
  console.log(JSON.stringify(result));
  return result;
}

// Editor-only, read-only diagnostics. No payment or spreadsheet updates.
function diagnoseAfterSchoolPaymentDates() {
  const sheet = getSpreadsheet_().getSheetByName(ATTEMPTS_SHEET_NAME);
  const attempts = readRows_(sheet, ATTEMPT_HEADERS);
  const rawRows = attempts.length ? sheet.getRange(2, 1, attempts.length, ATTEMPT_HEADERS.length).getValues() : [];
  const dateColumn = ATTEMPT_HEADERS.indexOf("startDate");
  const pending = attempts.map(function(attempt, index) { return { attempt: attempt, index: index }; }).filter(function(entry) {
    const attempt = entry.attempt;
    return attempt.programCode === PROGRAM_CODE && attempt.stripeMode === getStripeMode_() && attempt.stripeSessionId && ["PAID", "EXPIRED", "CHECKOUT_FAILED"].indexOf(String(attempt.status)) === -1;
  }).slice(-10);
  return pending.map(function(entry) {
    const attempt = entry.attempt;
    try {
      const session = stripeGet_("checkout/sessions/" + sanitizeSessionId_(attempt.stripeSessionId));
      const raw = rawRows[entry.index][dateColumn];
      const report = {
        orderId: attempt.orderId,
        spreadsheetTimeZone: sheet.getParent().getSpreadsheetTimeZone(),
        storedStartDateType: Object.prototype.toString.call(raw),
        storedStartDateRaw: Object.prototype.toString.call(raw) === "[object Date]" ? raw.toISOString() : String(raw),
        normalizedStartDate: attempt.startDate,
        firstPurchasedWeek: String(attempt.paidWeekStarts || "").split(/,\s*/)[0],
        stripeStartDate: session.metadata && session.metadata.startDate || "",
        dateMatches: Boolean(session.metadata && session.metadata.startDate === attempt.startDate)
      };
      console.log(JSON.stringify(report));
      return report;
    } catch (error) {
      console.log("Date diagnosis failed for order " + attempt.orderId + ": " + String(error && error.message || error));
      return { orderId: attempt.orderId, diagnosticFailed: true };
    }
  });
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
