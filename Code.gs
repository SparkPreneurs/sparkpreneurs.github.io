const SPREADSHEET_ID = "1xCdl23sViHWcP9Zq6Zu_cpHxpZTinyy11R1qZZOCobo";
const WAIVER_LOG_SPREADSHEET_ID = "1bXmWGjhS26CksGQheqqSFOKqWblAGVCZ2MbwMMjS720";
const REGISTRATION_SHEET_NAME = "Sheet1";
const PRICING_SHEET_NAME = "Sheet2";
const WAIVER_LOG_SHEET_NAME = "Waiver Submissions";
const SUMMER_CAMP_4_TO_10_SESSIONS_PROGRAM_CODE = "summer2026_4_10_sessions";
const ADULT_HAND_BUILDING_POTTERY_PROGRAM_CODE = "adult_hand_building_pottery";
const DEFAULT_PROGRAM_CODE = "summer2026";
const DEFAULT_CURRENCY = "cad";
const DEFAULT_TAX_RATE_PERCENT = 13;
const STRIPE_API_BASE = "https://api.stripe.com/v1";
const SCRIPT_VERSION = "2026-08-04-1";
const DEFAULT_ENROLLMENT_NOTIFICATION_EMAILS = "sparkpreneurs.ca@gmail.com";

function doPost(e) {
  try {
    const data = parseRequest_(e);

    if (data.type && data.data && data.data.object) {
      return jsonResponse(handleStripeEvent_(data, e));
    }

    const action = data.action || "createCheckoutSession";

    if (action === "ping") {
      return jsonResponse({
        success: true,
        version: SCRIPT_VERSION,
        programs: ["summer2026", SUMMER_CAMP_4_TO_10_SESSIONS_PROGRAM_CODE, ADULT_HAND_BUILDING_POTTERY_PROGRAM_CODE]
      });
    }

    if (action === "createCheckoutSession") {
      return jsonResponse(createCheckoutSession_(data));
    }

    if (action === "verifyCheckoutSession") {
      return jsonResponse(verifyCheckoutSession_(data.stripeSessionId));
    }

    if (action === "saveWaiverSubmission") {
      return jsonResponse(saveWaiverSubmission_(data));
    }

    return jsonResponse({
      success: false,
      error: "Unknown action: " + action
    });
  } catch (err) {
    return jsonResponse({
      success: false,
      error: err.message
    });
  }
}

function doGet() {
  return jsonResponse({
    success: true,
    message: "SparkPreneurs registration endpoint is running.",
    version: SCRIPT_VERSION,
    programs: ["summer2026", SUMMER_CAMP_4_TO_10_SESSIONS_PROGRAM_CODE, ADULT_HAND_BUILDING_POTTERY_PROGRAM_CODE]
  });
}

function setupSheet2Summer2026() {
  setupSheet2SummerPrograms2026();
}

function setupSheet2SummerPrograms2026() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(PRICING_SHEET_NAME) || ss.insertSheet(PRICING_SHEET_NAME);
  const rows = [
    ["programCode", "weekCode", "weekName", "priceCents", "active", "minWeeks", "discountPercent", "bundlePriceCents", "taxRatePercent"],
    ["summer2026", "W1", "Week 1 (July 6-10)", 42000, true, "", "", "", 13],
    ["summer2026", "W2", "Week 2 (July 13-17)", 42000, true, "", "", "", ""],
    ["summer2026", "W3", "Week 3 (July 20-24)", 42000, true, "", "", "", ""],
    ["summer2026", "W4", "Week 4 (July 27-31)", 42000, true, "", "", "", ""],
    ["summer2026", "W5", "Week 5 (August 4-7)", 39000, true, "", "", "", ""],
    ["summer2026", "W6", "Week 6 (August 10-14)", 42000, true, "", "", "", ""],
    ["summer2026", "W7", "Week 7 (August 17-21)", 42000, true, "", "", "", ""],
    ["summer2026", "W8", "Week 8 (August 24-28)", 42000, true, "", "", "", ""],
    ["summer2026", "", "Bundle: any 4 weeks", "", "", 4, "", 120000, ""],
    ["summer2026", "", "Bundle: all 8 weeks", "", "", 8, "", 240000, ""]
  ];
  const youngerSummerWeeks = [
    ["5", "August 4-7", "Fashion Week", 10500],
    ["6", "August 10-14", "Young Chef Creations 2", 10500],
    ["7", "August 17-21", "3D Storybook Makers", 10500],
    ["8", "August 24-28", "Dream House Designers", 10500]
  ];

  youngerSummerWeeks.forEach(function(week) {
    const weekNumber = week[0];
    const date = week[1];
    const theme = week[2];
    const sessionPriceCents = week[3];

    rows.push([SUMMER_CAMP_4_TO_10_SESSIONS_PROGRAM_CODE, "W" + weekNumber + "AM", "Week " + weekNumber + " Morning: " + theme + " (" + date + ", 10 AM-12 PM)", sessionPriceCents, true, "", "", "", 13]);
    rows.push([SUMMER_CAMP_4_TO_10_SESSIONS_PROGRAM_CODE, "W" + weekNumber + "PM", "Week " + weekNumber + " Afternoon: " + theme + " (" + date + ", 1-3 PM)", sessionPriceCents, true, "", "", "", ""]);
  });

  rows.push([ADULT_HAND_BUILDING_POTTERY_PROGRAM_CODE, "HB4SUN", "Hand-Building Pottery: 4 Sunday Sessions (10:30 AM-12:30 PM)", 24000, true, "", "", "", 13]);

  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, rows[0].length);
}

function authorizeRequiredServices() {
  const secretKey = PropertiesService.getScriptProperties().getProperty("STRIPE_SECRET_KEY");

  if (!secretKey) {
    throw new Error("Set STRIPE_SECRET_KEY in Script Properties before running this.");
  }

  SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PRICING_SHEET_NAME);

  const response = UrlFetchApp.fetch(STRIPE_API_BASE + "/checkout/sessions?limit=1", {
    method: "get",
    headers: {
      Authorization: "Bearer " + secretKey
    },
    muteHttpExceptions: true
  });
  const statusCode = response.getResponseCode();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error("Stripe authorization check failed: " + response.getContentText());
  }

  return "Authorization check passed for version " + SCRIPT_VERSION;
}

function createCheckoutSession_(data) {
  const programCode = sanitizeText_(data.programCode || DEFAULT_PROGRAM_CODE, 40);
  const selectedWeeks = normalizeSelectedWeeks_(data.selectedWeeks);
  validateProgramSelections_(selectedWeeks, programCode);
  const displayedAmountCents = normalizeCents_(data.displayedAmountCents, "displayedAmountCents");
  const registration = normalizeRegistration_(data, programCode);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const pricingSheetName = getPricingSheetName_(programCode);
  const pricingSheet = ss.getSheetByName(pricingSheetName);

  if (!pricingSheet) {
    throw new Error("Missing pricing sheet: " + pricingSheetName);
  }

  const pricing = calculateExpectedPricing_(pricingSheet, selectedWeeks, programCode);

  if (pricing.totalCents !== displayedAmountCents) {
    return {
      success: false,
      error: "Amount mismatch",
      expectedAmountCents: pricing.totalCents
    };
  }

  const orderId = Utilities.getUuid();
  const successUrl = safeReturnUrl_(data.successUrl, "success");
  const cancelUrl = safeReturnUrl_(data.cancelUrl, "cancel");
  const weekList = pricing.selectedWeeks.map(function(week) {
    return week.weekName;
  }).join(", ");
  const checkoutDescription = sanitizeText_(weekList, 500);
  const productName = programCode === SUMMER_CAMP_4_TO_10_SESSIONS_PROGRAM_CODE
      ? "SparkPreneurs Summer Camp Ages 4-10 Registration"
      : (programCode === ADULT_HAND_BUILDING_POTTERY_PROGRAM_CODE
        ? "SparkPreneurs Hand-Building Pottery Registration"
        : "SparkPreneurs Summer Camp Registration");
  const checkoutSession = stripeRequest_("post", "/checkout/sessions", {
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: registration.parentEmail,
    client_reference_id: orderId,
    billing_address_collection: "auto",
    "phone_number_collection[enabled]": "true",
    "line_items[0][price_data][currency]": DEFAULT_CURRENCY,
    "line_items[0][price_data][product_data][name]": productName,
    "line_items[0][price_data][product_data][description]": checkoutDescription,
    "line_items[0][price_data][unit_amount]": String(pricing.totalCents),
    "line_items[0][quantity]": "1",
    "metadata[orderId]": orderId,
    "metadata[programCode]": programCode,
    "metadata[selectedWeeks]": selectedWeeks.join(","),
    "metadata[selectedWeekNames]": sanitizeText_(weekList, 500),
    "metadata[studentName]": registration.studentName,
    "metadata[parentName]": registration.parentName,
    "metadata[parentEmail]": registration.parentEmail,
    "metadata[phone]": registration.phone,
    "metadata[waiverAccepted]": registration.waiverAccepted ? "true" : "false",
    "metadata[waiverVersion]": registration.waiverVersion || "",
    "metadata[waiverSignedDate]": registration.waiverSignedDate || "",
    "metadata[expectedAmountCents]": String(pricing.totalCents),
    "payment_intent_data[metadata][orderId]": orderId,
    "payment_intent_data[metadata][programCode]": programCode,
    "payment_intent_data[metadata][selectedWeeks]": selectedWeeks.join(",")
  });

  savePendingRegistration_(checkoutSession.id, {
    orderId: orderId,
    stripeSessionId: checkoutSession.id,
    programCode: programCode,
    registration: registration,
    selectedWeeks: selectedWeeks,
    selectedWeekNames: weekList,
    pricing: pricing,
    createdAt: new Date().toISOString()
  });

  if (registration.waiverAccepted) {
    logWaiverSubmission_({
      submissionSource: "checkout",
      submittedAt: new Date(),
      programCode: programCode,
      orderId: orderId,
      stripeSessionId: checkoutSession.id,
      studentName: registration.studentName,
      parentName: registration.parentName,
      parentEmail: registration.parentEmail,
      phone: registration.phone,
      waiverChildFullName: registration.waiverChildFullName,
      childDateOfBirth: registration.childDateOfBirth,
      waiverParentGuardianFullName: registration.waiverParentGuardianFullName,
      waiverParentPhone: registration.waiverParentPhone,
      waiverParentEmail: registration.waiverParentEmail,
      emergencyContactName: registration.emergencyContactName,
      emergencyContactPhone: registration.emergencyContactPhone,
      emergencyContactRelationship: registration.emergencyContactRelationship,
      medicalInformation: registration.medicalInformation,
      medicalInformationConfirmed: registration.medicalInformationConfirmed,
      waiverAcknowledged: registration.waiverAcknowledged,
      photoConsent: registration.photoConsent,
      authorizedPickup1Name: registration.authorizedPickup1Name,
      authorizedPickup1Phone: registration.authorizedPickup1Phone,
      authorizedPickup2Name: registration.authorizedPickup2Name,
      authorizedPickup2Phone: registration.authorizedPickup2Phone,
      authorizedPickup3Name: registration.authorizedPickup3Name,
      authorizedPickup3Phone: registration.authorizedPickup3Phone,
      waiverConfirmationName: registration.waiverConfirmationName,
      electronicSignature: registration.electronicSignature,
      waiverSignedDate: registration.waiverSignedDate,
      waiverVersion: registration.waiverVersion,
      waiverAccepted: registration.waiverAccepted
    });
  }

  return {
    success: true,
    checkoutUrl: checkoutSession.url,
    stripeSessionId: checkoutSession.id,
    expectedAmountCents: pricing.totalCents
  };
}

function verifyCheckoutSession_(stripeSessionId) {
  const sessionId = sanitizeSessionId_(stripeSessionId);
  const session = retrieveCheckoutSession_(sessionId);

  if (session.payment_status !== "paid") {
    return {
      success: false,
      error: "Payment is not complete yet.",
      paymentStatus: session.payment_status || ""
    };
  }

  finalizePaidRegistration_(session);

  return {
    success: true,
    message: "Payment verified. Your registration has been received.",
    paymentStatus: session.payment_status
  };
}

function handleStripeEvent_(event, e) {
  const token = String((e.parameter && e.parameter.webhookToken) || "");
  const expectedToken = PropertiesService.getScriptProperties().getProperty("STRIPE_WEBHOOK_TOKEN") || "";

  if (!expectedToken || token !== expectedToken) {
    throw new Error("Webhook token is missing or invalid.");
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const eventSessionId = sanitizeSessionId_(event.data.object.id);
    const session = retrieveCheckoutSession_(eventSessionId);

    if (session.payment_status === "paid") {
      finalizePaidRegistration_(session);
    }
  }

  return { success: true };
}

function calculateExpectedPricing_(pricingSheet, selectedWeeks, programCode) {
  const values = pricingSheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error(pricingSheet.getName() + " needs a header row and at least one pricing row.");
  }

  const headers = values[0].map(function(header) {
    return String(header).trim();
  });
  const programIndex = requiredHeader_(headers, "programCode");
  const weekCodeIndex = requiredHeader_(headers, "weekCode");
  const weekNameIndex = requiredHeader_(headers, "weekName");
  const priceCentsIndex = requiredHeader_(headers, "priceCents");
  const activeIndex = requiredHeader_(headers, "active");
  const activeWeekByCode = {};

  values.slice(1).forEach(function(row) {
    const rowProgramCode = String(row[programIndex]).trim();
    const weekCode = String(row[weekCodeIndex]).trim();

    if (!weekCode || rowProgramCode !== programCode || !isTruthy_(row[activeIndex])) {
      return;
    }

    activeWeekByCode[weekCode] = {
      weekCode: weekCode,
      weekName: sanitizeText_(row[weekNameIndex], 100),
      priceCents: normalizeCents_(row[priceCentsIndex], "priceCents for " + weekCode)
    };
  });

  const selectedPricing = selectedWeeks.map(function(weekCode) {
    const week = activeWeekByCode[weekCode];

    if (!week) {
      throw new Error("Invalid or inactive week: " + weekCode);
    }

    return week;
  });
  const regularSubtotalCents = selectedPricing.reduce(function(total, week) {
    return total + week.priceCents;
  }, 0);
  const discountedSubtotalCents = calculateDiscountedSubtotal_(values, headers, selectedPricing, regularSubtotalCents, programCode);
  const discountCents = regularSubtotalCents - discountedSubtotalCents;
  const taxRatePercent = readTaxRatePercent_(values, headers);
  const taxCents = Math.round(discountedSubtotalCents * (taxRatePercent / 100));
  const totalCents = discountedSubtotalCents + taxCents;

  return {
    selectedWeeks: selectedPricing,
    regularSubtotalCents: regularSubtotalCents,
    discountedSubtotalCents: discountedSubtotalCents,
    discountCents: discountCents,
    taxRatePercent: taxRatePercent,
    taxCents: taxCents,
    totalCents: totalCents
  };
}

function getPricingSheetName_(programCode) {
  return PRICING_SHEET_NAME;
}

function calculateDiscountedSubtotal_(values, headers, selectedPricing, regularSubtotalCents, programCode) {
  const programIndex = requiredHeader_(headers, "programCode");
  const minWeeksIndex = optionalHeader_(headers, "minWeeks");
  const discountPercentIndex = optionalHeader_(headers, "discountPercent");
  const bundlePriceCentsIndex = optionalHeader_(headers, "bundlePriceCents");

  if (minWeeksIndex === -1) {
    return regularSubtotalCents;
  }

  const sortedWeeks = selectedPricing.slice().sort(function(a, b) {
    return b.priceCents - a.priceCents;
  });
  let bestSubtotalCents = regularSubtotalCents;

  values.slice(1).forEach(function(row) {
    const rowProgramCode = String(row[programIndex]).trim();
    const minWeeks = Number(row[minWeeksIndex]);

    if (rowProgramCode !== programCode || !Number.isFinite(minWeeks) || minWeeks <= 0 || sortedWeeks.length < minWeeks) {
      return;
    }

    let candidateSubtotalCents = regularSubtotalCents;

    if (bundlePriceCentsIndex !== -1 && row[bundlePriceCentsIndex] !== "") {
      const bundlePriceCents = normalizeCents_(row[bundlePriceCentsIndex], "bundlePriceCents");
      const extraWeeksTotal = sortedWeeks.slice(minWeeks).reduce(function(total, week) {
        return total + week.priceCents;
      }, 0);
      candidateSubtotalCents = bundlePriceCents + extraWeeksTotal;
    } else if (discountPercentIndex !== -1 && row[discountPercentIndex] !== "") {
      const discountPercent = Number(row[discountPercentIndex]);

      if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
        throw new Error("Invalid discountPercent for minWeeks " + minWeeks);
      }

      candidateSubtotalCents = Math.round(regularSubtotalCents * ((100 - discountPercent) / 100));
    }

    if (candidateSubtotalCents < bestSubtotalCents) {
      bestSubtotalCents = candidateSubtotalCents;
    }
  });

  return bestSubtotalCents;
}

function finalizePaidRegistration_(session) {
  const sessionId = sanitizeSessionId_(session.id);
  const pending = loadPendingRegistration_(sessionId);
  const metadata = session.metadata || {};
  const expectedAmountCents = normalizeCents_(metadata.expectedAmountCents || (pending && pending.pricing.totalCents), "expectedAmountCents");

  if (session.amount_total !== expectedAmountCents) {
    throw new Error("Stripe amount does not match the verified registration amount.");
  }

  if (String(session.currency || "").toLowerCase() !== DEFAULT_CURRENCY) {
    throw new Error("Stripe currency does not match the expected currency.");
  }

  const registration = pending ? pending.registration : {
    studentName: sanitizeText_(metadata.studentName, 100),
    parentName: sanitizeText_(metadata.parentName, 100),
    parentEmail: sanitizeEmail_(metadata.parentEmail),
    phone: sanitizeText_(metadata.phone, 40),
    waiverAccepted: isTruthy_(metadata.waiverAccepted),
    waiverVersion: sanitizeText_(metadata.waiverVersion, 30),
    waiverSignedDate: sanitizeText_(metadata.waiverSignedDate, 10)
  };
  const pricing = pending ? pending.pricing : {
    regularSubtotalCents: "",
    discountCents: "",
    taxCents: "",
    totalCents: expectedAmountCents
  };
  const selectedWeeks = pending ? pending.selectedWeeks.join(", ") : sanitizeText_(metadata.selectedWeeks, 200);
  const selectedWeekNames = pending ? pending.selectedWeekNames : sanitizeText_(metadata.selectedWeekNames, 500);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const registrationSheet = ss.getSheetByName(REGISTRATION_SHEET_NAME);
  const programCode = pending ? pending.programCode : sanitizeText_(metadata.programCode || DEFAULT_PROGRAM_CODE, 40);
  const paidAt = new Date();
  const paidAtIso = paidAt.toISOString();

  if (!registrationSheet) {
    throw new Error("Missing registration sheet: " + REGISTRATION_SHEET_NAME);
  }

  const headers = ensureRegistrationHeaders_(registrationSheet);
  const existingRow = findRowByColumnValue_(registrationSheet, headers.indexOf("stripeSessionId") + 1, sessionId);

  upsertRegistrationRow_(registrationSheet, {
    createdAt: pending ? pending.createdAt : "",
    paidAt: paidAt,
    programCode: programCode,
    studentName: registration.studentName,
    parentName: registration.parentName,
    parentEmail: registration.parentEmail,
    phone: registration.phone,
    waiverChildFullName: registration.waiverChildFullName,
    childDateOfBirth: registration.childDateOfBirth,
    waiverParentGuardianFullName: registration.waiverParentGuardianFullName,
    waiverParentPhone: registration.waiverParentPhone,
    waiverParentEmail: registration.waiverParentEmail,
    emergencyContactName: registration.emergencyContactName,
    emergencyContactPhone: registration.emergencyContactPhone,
    emergencyContactRelationship: registration.emergencyContactRelationship,
    medicalInformation: registration.medicalInformation,
    medicalInformationConfirmed: registration.medicalInformationConfirmed,
    waiverAcknowledged: registration.waiverAcknowledged,
    photoConsent: registration.photoConsent,
    authorizedPickup1Name: registration.authorizedPickup1Name,
    authorizedPickup1Phone: registration.authorizedPickup1Phone,
    authorizedPickup2Name: registration.authorizedPickup2Name,
    authorizedPickup2Phone: registration.authorizedPickup2Phone,
    authorizedPickup3Name: registration.authorizedPickup3Name,
    authorizedPickup3Phone: registration.authorizedPickup3Phone,
    waiverConfirmationName: registration.waiverConfirmationName,
    electronicSignature: registration.electronicSignature,
    waiverSignedDate: registration.waiverSignedDate,
    waiverVersion: registration.waiverVersion,
    waiverAccepted: registration.waiverAccepted,
    selectedWeeks: selectedWeeks,
    selectedWeekNames: selectedWeekNames,
    regularSubtotalCents: pricing.regularSubtotalCents,
    discountCents: pricing.discountCents,
    taxCents: pricing.taxCents,
    expectedAmountCents: expectedAmountCents,
    stripeSessionId: sessionId,
    stripePaymentIntentId: session.payment_intent || "",
    stripePaymentStatus: session.payment_status || "",
    registrationStatus: "PAID_VERIFIED",
    orderId: metadata.orderId || (pending && pending.orderId) || ""
  });

  deletePendingRegistration_(sessionId);

  if (!existingRow) {
    sendEnrollmentNotificationSafely_({
      programCode: programCode,
      participantName: registration.studentName,
      contactName: registration.parentName,
      contactEmail: registration.parentEmail,
      phone: registration.phone,
      selectedItemNames: selectedWeekNames,
      amountCents: expectedAmountCents,
      paidAt: paidAtIso,
      orderId: metadata.orderId || (pending && pending.orderId) || "",
      stripeSessionId: sessionId
    });
  }
}

function upsertRegistrationRow_(sheet, rowData) {
  const headers = ensureRegistrationHeaders_(sheet);
  const sessionIdColumn = headers.indexOf("stripeSessionId") + 1;
  const existingRow = findRowByColumnValue_(sheet, sessionIdColumn, rowData.stripeSessionId);
  const row = headers.map(function(header) {
    return rowData[header] !== undefined ? rowData[header] : "";
  });

  if (existingRow) {
    sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

function saveWaiverSubmission_(data) {
  const waiver = normalizeWaiver_(data);
  const rowData = {
    submissionSource: sanitizeText_(data.submissionSource || "manual", 40),
    submittedAt: new Date(),
    programCode: sanitizeText_(data.programCode || "", 40),
    orderId: sanitizeText_(data.orderId || "", 100),
    stripeSessionId: sanitizeText_(data.stripeSessionId || "", 100),
    studentName: sanitizeText_(data.studentName || data.waiverChildFullName || "", 100),
    parentName: sanitizeText_(data.parentName || data.waiverParentGuardianFullName || "", 100),
    parentEmail: sanitizeEmail_(data.parentEmail || data.waiverParentEmail || ""),
    phone: sanitizeText_(data.phone || data.waiverParentPhone || "", 40)
  };

  Object.keys(waiver).forEach(function(key) {
    rowData[key] = waiver[key];
  });

  logWaiverSubmission_(rowData);

  return {
    success: true,
    message: "Waiver submission saved."
  };
}

function logWaiverSubmission_(rowData) {
  const ss = SpreadsheetApp.openById(WAIVER_LOG_SPREADSHEET_ID);
  const sheet = ss.getSheetByName(WAIVER_LOG_SHEET_NAME) || ss.insertSheet(WAIVER_LOG_SHEET_NAME);
  const headers = ensureWaiverLogHeaders_(sheet);
  const row = headers.map(function(header) {
    return rowData[header] !== undefined ? rowData[header] : "";
  });

  sheet.appendRow(row);
}

function ensureWaiverLogHeaders_(sheet) {
  const requiredHeaders = [
    "submissionSource",
    "submittedAt",
    "programCode",
    "orderId",
    "stripeSessionId",
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
    "waiverAccepted"
  ];
  const currentHeaders = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), requiredHeaders.length)).getValues()[0].map(function(value) {
        return String(value).trim();
      })
    : [];
  const matches = requiredHeaders.length === currentHeaders.length && requiredHeaders.every(function(header, index) {
    return currentHeaders[index] === header;
  });

  if (!matches) {
    sheet.clearContents();
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, requiredHeaders.length);
  }

  return requiredHeaders;
}

function ensureRegistrationHeaders_(sheet) {
  const requiredHeaders = [
    "createdAt",
    "paidAt",
    "programCode",
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
    "selectedWeeks",
    "selectedWeekNames",
    "regularSubtotalCents",
    "discountCents",
    "taxCents",
    "expectedAmountCents",
    "stripeSessionId",
    "stripePaymentIntentId",
    "stripePaymentStatus",
    "registrationStatus",
    "orderId"
  ];
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  let headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(header) {
    return String(header).trim();
  });

  if (headers.length === 1 && !headers[0]) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return requiredHeaders;
  }

  requiredHeaders.forEach(function(header) {
    if (headers.indexOf(header) === -1) {
      headers.push(header);
    }
  });

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return headers;
}

function findRowByColumnValue_(sheet, column, value) {
  if (!value || sheet.getLastRow() < 2) {
    return 0;
  }

  const values = sheet.getRange(2, column, sheet.getLastRow() - 1, 1).getValues();

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][0]) === String(value)) {
      return i + 2;
    }
  }

  return 0;
}

function retrieveCheckoutSession_(sessionId) {
  return stripeRequest_("get", "/checkout/sessions/" + encodeURIComponent(sessionId), null);
}

function stripeRequest_(method, path, payload) {
  const secretKey = PropertiesService.getScriptProperties().getProperty("STRIPE_SECRET_KEY");

  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY in Apps Script Properties.");
  }

  const options = {
    method: method,
    headers: {
      Authorization: "Bearer " + secretKey
    },
    muteHttpExceptions: true
  };

  if (payload) {
    options.payload = payload;
  }

  const response = UrlFetchApp.fetch(STRIPE_API_BASE + path, options);
  const body = response.getContentText();
  const statusCode = response.getResponseCode();
  const parsed = JSON.parse(body);

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error((parsed.error && parsed.error.message) || "Stripe request failed.");
  }

  return parsed;
}

function parseRequest_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("Missing request body.");
  }

  return JSON.parse(e.postData.contents);
}

function normalizeRegistration_(data, programCode) {
  const registration = {
    studentName: requireText_(data.studentName, "studentName", 100),
    parentName: requireText_(data.parentName, "parentName", 100),
    parentEmail: sanitizeEmail_(data.parentEmail),
    phone: requireText_(data.phone, "phone", 40)
  };

  if (programCode === ADULT_HAND_BUILDING_POTTERY_PROGRAM_CODE || programCode === SUMMER_CAMP_4_TO_10_SESSIONS_PROGRAM_CODE) {
    registration.waiverAccepted = false;
    registration.waiverVersion = "";
    registration.waiverSignedDate = "";
    return registration;
  }

  const waiver = normalizeWaiver_(data);

  Object.keys(waiver).forEach(function(key) {
    registration[key] = waiver[key];
  });

  return registration;
}

function normalizeWaiver_(data) {
  if (!isTruthy_(data.waiverAccepted)) {
    throw new Error("The parent/guardian waiver must be completed before payment.");
  }

  if (!isTruthy_(data.medicalInformationConfirmed)) {
    throw new Error("Medical and emergency information must be confirmed.");
  }

  if (!isTruthy_(data.waiverAcknowledged)) {
    throw new Error("The parent/guardian waiver must be acknowledged.");
  }

  const photoConsent = sanitizeText_(data.photoConsent, 3).toLowerCase();

  if (photoConsent !== "yes" && photoConsent !== "no") {
    throw new Error("Choose yes or no for photo and video consent.");
  }

  const childDateOfBirth = requireDate_(data.childDateOfBirth, "childDateOfBirth");
  const waiverSignedDate = requireDate_(data.waiverSignedDate, "waiverSignedDate");
  const pickup2 = normalizeOptionalPickup_(data.authorizedPickup2Name, data.authorizedPickup2Phone, 2);
  const pickup3 = normalizeOptionalPickup_(data.authorizedPickup3Name, data.authorizedPickup3Phone, 3);

  return {
    waiverChildFullName: requireText_(data.waiverChildFullName, "waiverChildFullName", 100),
    childDateOfBirth: childDateOfBirth,
    waiverParentGuardianFullName: requireText_(data.waiverParentGuardianFullName, "waiverParentGuardianFullName", 100),
    waiverParentPhone: requireText_(data.waiverParentPhone, "waiverParentPhone", 40),
    waiverParentEmail: sanitizeNamedEmail_(data.waiverParentEmail, "waiverParentEmail"),
    emergencyContactName: requireText_(data.emergencyContactName, "emergencyContactName", 100),
    emergencyContactPhone: requireText_(data.emergencyContactPhone, "emergencyContactPhone", 40),
    emergencyContactRelationship: requireText_(data.emergencyContactRelationship, "emergencyContactRelationship", 80),
    medicalInformation: requireText_(data.medicalInformation, "medicalInformation", 2000),
    medicalInformationConfirmed: true,
    waiverAcknowledged: true,
    photoConsent: photoConsent,
    authorizedPickup1Name: requireText_(data.authorizedPickup1Name, "authorizedPickup1Name", 100),
    authorizedPickup1Phone: requireText_(data.authorizedPickup1Phone, "authorizedPickup1Phone", 40),
    authorizedPickup2Name: pickup2.name,
    authorizedPickup2Phone: pickup2.phone,
    authorizedPickup3Name: pickup3.name,
    authorizedPickup3Phone: pickup3.phone,
    waiverConfirmationName: requireText_(data.waiverConfirmationName, "waiverConfirmationName", 100),
    electronicSignature: requireText_(data.electronicSignature, "electronicSignature", 100),
    waiverSignedDate: waiverSignedDate,
    waiverVersion: requireText_(data.waiverVersion, "waiverVersion", 30),
    waiverAccepted: true
  };
}

function normalizeOptionalPickup_(nameValue, phoneValue, number) {
  const name = sanitizeText_(nameValue, 100);
  const phone = sanitizeText_(phoneValue, 40);

  if ((name && !phone) || (!name && phone)) {
    throw new Error("Authorized pickup " + number + " requires both a name and phone number.");
  }

  return { name: name, phone: phone };
}

function requireDate_(value, fieldName) {
  const date = requireText_(value, fieldName, 10);
  const parsed = new Date(date + "T00:00:00Z");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Invalid " + fieldName + ".");
  }

  return date;
}

function normalizeSelectedWeeks_(selectedWeeks) {
  if (!Array.isArray(selectedWeeks) || selectedWeeks.length === 0) {
    throw new Error("No weeks selected.");
  }

  if (selectedWeeks.length > 24) {
    throw new Error("Too many sessions or meals selected.");
  }

  const normalized = selectedWeeks.map(function(weekCode) {
    return String(weekCode || "").trim().toUpperCase();
  });
  const unique = {};

  normalized.forEach(function(weekCode) {
    if (!/^[A-Z0-9_-]{1,20}$/.test(weekCode)) {
      throw new Error("Invalid week code: " + weekCode);
    }

    if (unique[weekCode]) {
      throw new Error("Duplicate week selected: " + weekCode);
    }

    unique[weekCode] = true;
  });

  return normalized;
}

function validateProgramSelections_(selectedWeeks, programCode) {
  if (programCode !== SUMMER_CAMP_4_TO_10_SESSIONS_PROGRAM_CODE) {
    return;
  }

  const selected = {};
  let sessionCount = 0;

  selectedWeeks.forEach(function(code) {
    selected[code] = true;

    if (/^W[1-8](AM|PM)$/.test(code)) {
      sessionCount++;
    }
  });

  if (sessionCount === 0) {
    throw new Error("Choose at least one morning or afternoon session.");
  }
}

function sanitizeSessionId_(sessionId) {
  const value = String(sessionId || "").trim();

  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(value)) {
    throw new Error("Invalid Stripe session ID.");
  }

  return value;
}

function requireText_(value, fieldName, maxLength) {
  const text = sanitizeText_(value, maxLength);

  if (!text) {
    throw new Error("Missing " + fieldName + ".");
  }

  return text;
}

function sanitizeText_(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function sanitizeEmail_(value) {
  return sanitizeNamedEmail_(value, "parentEmail");
}

function sanitizeNamedEmail_(value, fieldName) {
  const email = requireText_(value, fieldName, 120).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid " + fieldName + ".");
  }

  return email;
}

function normalizeCents_(value, fieldName) {
  const cents = Number(value);

  if (!Number.isFinite(cents) || Math.round(cents) !== cents || cents < 0) {
    throw new Error("Invalid " + fieldName + ".");
  }

  return cents;
}

function safeReturnUrl_(value, kind) {
  const fallback = kind === "success"
    ? "https://sparkpreneurs.ca/?payment=success&session_id={CHECKOUT_SESSION_ID}"
    : "https://sparkpreneurs.ca/?payment=canceled#summer-camp";
  const url = String(value || fallback).trim();
  const allowed = [
    "https://sparkpreneurs.ca/",
    "https://www.sparkpreneurs.ca/"
  ];
  const isAllowed = allowed.some(function(prefix) {
    return url.indexOf(prefix) === 0;
  });

  return isAllowed ? url : fallback;
}

function readTaxRatePercent_(values, headers) {
  const taxRateIndex = optionalHeader_(headers, "taxRatePercent");

  if (taxRateIndex === -1) {
    return DEFAULT_TAX_RATE_PERCENT;
  }

  for (let i = 1; i < values.length; i++) {
    if (values[i][taxRateIndex] !== "") {
      const taxRate = Number(values[i][taxRateIndex]);

      if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
        throw new Error("Invalid taxRatePercent.");
      }

      return taxRate;
    }
  }

  return DEFAULT_TAX_RATE_PERCENT;
}

function isTruthy_(value) {
  const text = String(value).trim().toUpperCase();
  return value === true || text === "TRUE" || text === "YES" || text === "1";
}

function requiredHeader_(headers, headerName) {
  const index = optionalHeader_(headers, headerName);

  if (index === -1) {
    throw new Error("Sheet2 is missing column: " + headerName);
  }

  return index;
}

function optionalHeader_(headers, headerName) {
  return headers.indexOf(headerName);
}

function savePendingRegistration_(sessionId, payload) {
  PropertiesService.getScriptProperties().setProperty("pending_" + sessionId, JSON.stringify(payload));
}

function loadPendingRegistration_(sessionId) {
  const raw = PropertiesService.getScriptProperties().getProperty("pending_" + sessionId);
  return raw ? JSON.parse(raw) : null;
}

function deletePendingRegistration_(sessionId) {
  PropertiesService.getScriptProperties().deleteProperty("pending_" + sessionId);
}

function sendEnrollmentNotificationSafely_(details) {
  try {
    sendEnrollmentNotification_(details);
  } catch (error) {
    console.log("Enrollment email failed: " + String(error && error.message ? error.message : error));
  }
}

function sendEnrollmentNotification_(details) {
  const recipients = getEnrollmentNotificationRecipients_();
  if (!recipients) return;

  const body = [
    "A new paid registration was received.",
    "",
    "Program: " + programNameFromCode_(details.programCode),
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
    subject: "New paid registration: " + programNameFromCode_(details.programCode),
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

function programNameFromCode_(programCode) {
  if (programCode === SUMMER_CAMP_4_TO_10_SESSIONS_PROGRAM_CODE) {
    return "Summer Camp";
  }
  if (programCode === ADULT_HAND_BUILDING_POTTERY_PROGRAM_CODE) {
    return "Hand-Building Pottery";
  }
  if (programCode === DEFAULT_PROGRAM_CODE) {
    return "SparkPreneurs Summer Camp";
  }
  return String(programCode || "SparkPreneurs");
}

function formatMoneyCents_(value) {
  return "CAD $" + (Number(value || 0) / 100).toFixed(2);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
