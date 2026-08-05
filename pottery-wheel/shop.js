(function() {
    'use strict';

    const scheduleSection = document.querySelector('#schedule');
    const registrationSection = document.querySelector('#registration');

    if (scheduleSection && registrationSection && scheduleSection.nextElementSibling !== registrationSection) {
        scheduleSection.insertAdjacentElement('afterend', registrationSection);
    }

    const registration = document.querySelector('[data-pottery-wheel-registration]');
    const cohortInputs = Array.from(document.querySelectorAll('[data-pottery-wheel-cohorts] input[type="radio"]'));

    if (!registration || !cohortInputs.length) return;

    const form = registration.querySelector('[data-pottery-wheel-form]');
    const selectedName = registration.querySelector('[data-pottery-wheel-selected-name]');
    const selectedTime = registration.querySelector('[data-pottery-wheel-selected-time]');
    const selectedDates = registration.querySelector('[data-pottery-wheel-selected-dates]');
    const submitButton = registration.querySelector('[data-pottery-wheel-submit]');
    const clearButton = registration.querySelector('[data-pottery-wheel-clear]');
    const status = registration.querySelector('[data-pottery-wheel-status]');
    const appsScriptUrl = registration.dataset.appsScriptUrl || '';
    const programCode = registration.dataset.programCode || '';
    const requiredStripeMode = registration.dataset.requiredStripeMode || 'test';
    const cohortItemCodes = {
        'pottery-wheel-mon-evening': 'POTTERY_WHEEL_MON_EVENING',
        'pottery-wheel-tue-daytime': 'POTTERY_WHEEL_TUE_DAYTIME',
        'pottery-wheel-wed-evening': 'POTTERY_WHEEL_WED_EVENING',
        'pottery-wheel-sat-afternoon': 'POTTERY_WHEEL_SAT_AFTERNOON'
    };
    const returnPageUrl = 'https://sparkpreneurs.ca/pottery-wheel/';
    let backendReady = false;
    let isSubmitting = false;

    function setStatus(message, type) {
        status.textContent = message || '';
        status.dataset.status = type || '';
    }

    function selectedInput() {
        return cohortInputs.find((input) => input.checked) || null;
    }

    function updateCohortCards() {
        cohortInputs.forEach((input) => {
            const card = input.closest('[data-pottery-wheel-cohort-card]');
            if (card) card.classList.toggle('is-selected', input.checked);
        });
    }

    function updateSelection() {
        const input = selectedInput();
        updateCohortCards();

        if (!input) {
            selectedName.textContent = 'Select a schedule above';
            selectedTime.textContent = 'Choose one weekly time and attend four consecutive sessions.';
            selectedDates.textContent = 'All four dates will appear here after you choose a cohort.';
            submitButton.disabled = true;
            clearButton.disabled = isSubmitting;
            return;
        }

        selectedName.textContent = input.dataset.cohortLabel || '';
        selectedTime.textContent = input.dataset.cohortTime || '';
        selectedDates.textContent = input.dataset.cohortDates || '';
        submitButton.disabled = !backendReady || isSubmitting;
        clearButton.disabled = isSubmitting;
    }

    async function postToAppsScript(payload) {
        const response = await fetch(appsScriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        const responseText = await response.text();
        let result;

        try {
            result = JSON.parse(responseText);
        } catch (error) {
            throw new Error('The registration service did not return a readable response.');
        }

        if (!response.ok || result.success === false) {
            throw new Error(result.error || 'The registration service could not process this request.');
        }

        return result;
    }

    function registrationData() {
        if (!form.reportValidity()) return null;

        const values = new FormData(form);
        return {
            firstName: String(values.get('firstName') || '').trim(),
            lastName: String(values.get('lastName') || '').trim(),
            email: String(values.get('email') || '').trim(),
            phone: String(values.get('phone') || '').trim(),
            experienceLevel: String(values.get('experienceLevel') || '').trim(),
            message: String(values.get('message') || '').trim(),
            consent: values.get('consent') === 'yes'
        };
    }

    async function checkBackendReady() {
        if (!appsScriptUrl || !programCode) {
            setStatus('Secure checkout is temporarily unavailable. Please contact SparkPreneurs.', 'warning');
            updateSelection();
            return;
        }

        setStatus('Preparing secure checkout…', 'pending');

        try {
            const result = await postToAppsScript({ action: 'ping', programCode });
            backendReady = result.programCode === programCode && result.stripeMode === requiredStripeMode;
            setStatus(backendReady ? '' : 'Secure checkout is temporarily unavailable. Please contact SparkPreneurs.', backendReady ? '' : 'warning');
        } catch (error) {
            backendReady = false;
            setStatus('Secure checkout is temporarily unavailable. Please contact SparkPreneurs.', 'warning');
        }

        updateSelection();
    }

    function replaceCheckoutQuery() {
        const url = new URL(window.location.href);
        url.searchParams.delete('session_id');
        url.searchParams.delete('payment');
        window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
    }

    async function verifyReturnedPayment() {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session_id');
        const payment = params.get('payment');

        if (payment === 'cancelled' || payment === 'canceled') {
            setStatus('Payment was canceled. Your cohort selection is still available when you are ready.', 'warning');
            registration.scrollIntoView({ behavior: 'smooth', block: 'start' });
            replaceCheckoutQuery();
            return;
        }

        if (!sessionId || !appsScriptUrl) return;

        setStatus('Checking payment status…', 'pending');
        registration.scrollIntoView({ behavior: 'smooth', block: 'start' });

        try {
            const result = await postToAppsScript({ action: 'verifyCheckoutSession', programCode, stripeSessionId: sessionId });

            if (result.paymentStatus !== 'paid') {
                throw new Error('Payment could not be verified yet. Please contact SparkPreneurs.');
            }

            setStatus(result.message || 'Payment verified. Your registration has been received.', 'success');
        } catch (error) {
            setStatus(error.message || 'Payment could not be verified yet. Please contact SparkPreneurs.', 'error');
        } finally {
            replaceCheckoutQuery();
        }
    }

    async function beginCheckout() {
        const input = selectedInput();

        if (!input) {
            setStatus('Please choose one four-session cohort before continuing.', 'warning');
            document.querySelector('#schedule')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }

        if (!backendReady) {
            setStatus('Secure checkout is temporarily unavailable. Please contact SparkPreneurs.', 'warning');
            return;
        }

        const details = registrationData();
        if (!details) {
            setStatus('Please complete the required registration fields before continuing.', 'warning');
            return;
        }

        const itemCode = cohortItemCodes[input.value];
        if (!itemCode) {
            setStatus('Please choose a valid cohort before continuing.', 'warning');
            return;
        }

        isSubmitting = true;
        submitButton.textContent = 'Opening Secure Payment…';
        updateSelection();
        setStatus('Checking your cohort and registration total…', 'pending');

        try {
            const result = await postToAppsScript({
                action: 'createCheckoutSession',
                programCode,
                selectedItemCodes: [itemCode],
                displayedAmountCents: 25000,
                successUrl: `${returnPageUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
                cancelUrl: `${returnPageUrl}?payment=cancelled#registration`,
                ...details
            });
            const checkoutUrl = new URL(result.checkoutUrl);

            if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com') {
                throw new Error('Stripe returned an invalid payment link.');
            }

            window.location.assign(checkoutUrl.href);
        } catch (error) {
            isSubmitting = false;
            submitButton.textContent = 'Continue to Secure Payment';
            setStatus(error.message || 'Payment could not be started. Please try again.', 'error');
            updateSelection();
        }
    }

    cohortInputs.forEach((input) => input.addEventListener('change', function() {
        setStatus('', '');
        updateSelection();
    }));

    clearButton.addEventListener('click', function() {
        cohortInputs.forEach((input) => { input.checked = false; });
        form.reset();
        setStatus('Your cohort selection and form details were cleared.', 'warning');
        updateSelection();
    });

    form.addEventListener('submit', function(event) {
        event.preventDefault();
        beginCheckout();
    });

    submitButton.addEventListener('click', beginCheckout);

    updateSelection();
    checkBackendReady();
    verifyReturnedPayment();
}());
