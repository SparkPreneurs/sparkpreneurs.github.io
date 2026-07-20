document.addEventListener('DOMContentLoaded', function() {
    const shop = document.querySelector('[data-hand-building-shop]');

    if (!shop) {
        return;
    }

    const CLASS_ITEM = {
        code: 'HB4SUN',
        name: 'Hand-Building Pottery: 4 Sunday Sessions (10:30 AM-12:30 PM)',
        priceCents: 24000
    };
    const HST_RATE = 0.13;
    const addButton = shop.querySelector('[data-hand-building-add]');
    const classCard = shop.querySelector('.hand-building-class-card');
    const cartList = shop.querySelector('[data-hand-building-cart-list]');
    const totalsPanel = shop.querySelector('[data-hand-building-cart-totals]');
    const subtotalEl = shop.querySelector('[data-hand-building-subtotal]');
    const hstEl = shop.querySelector('[data-hand-building-hst]');
    const grandTotalEl = shop.querySelector('[data-hand-building-grand-total]');
    const registrationForm = shop.querySelector('[data-hand-building-registration-form]');
    const purchaseButton = shop.querySelector('[data-hand-building-purchase]');
    const clearButton = shop.querySelector('[data-hand-building-clear]');
    const statusEl = shop.querySelector('[data-hand-building-cart-status]');
    const appsScriptUrl = shop.dataset.appsScriptUrl || '';
    const programCode = shop.dataset.programCode || 'adult_hand_building_pottery';
    const returnPageUrl = 'https://sparkpreneurs.ca/hand-building-pottery/';
    let selected = false;
    let isSubmitting = false;
    let backendReady = false;

    function formatMoneyCents(cents) {
        return (cents / 100).toLocaleString('en-CA', {
            style: 'currency',
            currency: 'CAD'
        });
    }

    function calculateTotals() {
        const subtotalCents = selected ? CLASS_ITEM.priceCents : 0;
        const hstCents = Math.round(subtotalCents * HST_RATE);

        return {
            subtotalCents,
            hstCents,
            totalCents: subtotalCents + hstCents
        };
    }

    function setStatus(message, type = '') {
        statusEl.textContent = message;
        statusEl.dataset.status = type;
    }

    function render() {
        const totals = calculateTotals();

        classCard.classList.toggle('is-selected', selected);
        addButton.classList.toggle('is-added', selected);
        addButton.setAttribute('aria-pressed', String(selected));
        addButton.textContent = selected ? 'Added' : 'Add to Cart';

        cartList.innerHTML = '';

        if (!selected) {
            cartList.innerHTML = '<li class="summer-cart-empty">No class added yet.</li>';
            totalsPanel.hidden = true;
            purchaseButton.disabled = true;
            clearButton.disabled = true;
            return;
        }

        const item = document.createElement('li');
        const name = document.createElement('span');
        const removeButton = document.createElement('button');

        item.className = 'summer-cart-item';
        name.className = 'summer-cart-item-name';
        name.textContent = `${CLASS_ITEM.name} - ${formatMoneyCents(CLASS_ITEM.priceCents)}`;
        removeButton.className = 'summer-cart-remove';
        removeButton.type = 'button';
        removeButton.textContent = 'Remove';
        removeButton.dataset.handBuildingRemove = 'true';
        item.append(name, removeButton);
        cartList.appendChild(item);

        totalsPanel.hidden = false;
        subtotalEl.textContent = formatMoneyCents(totals.subtotalCents);
        hstEl.textContent = formatMoneyCents(totals.hstCents);
        grandTotalEl.textContent = formatMoneyCents(totals.totalCents);
        purchaseButton.disabled = isSubmitting || !backendReady;
        clearButton.disabled = isSubmitting;
    }

    function getRegistrationData() {
        if (!registrationForm.reportValidity()) {
            return null;
        }

        const formData = new FormData(registrationForm);

        return {
            studentName: String(formData.get('studentName') || '').trim(),
            parentName: String(formData.get('parentName') || '').trim(),
            parentEmail: String(formData.get('parentEmail') || '').trim(),
            phone: String(formData.get('phone') || '').trim()
        };
    }

    async function collectWaiverData(registrationData) {
        if (!window.SparkPreneursWaiver) {
            throw new Error('The required waiver could not be opened. Please refresh the page and try again.');
        }

        return window.SparkPreneursWaiver.collect({
            childName: registrationData.studentName,
            parentName: registrationData.parentName,
            parentEmail: registrationData.parentEmail,
            phone: registrationData.phone
        });
    }

    async function postToAppsScript(payload) {
        const response = await fetch(appsScriptUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify(payload)
        });
        const text = await response.text();
        let data;

        try {
            data = JSON.parse(text);
        } catch (error) {
            throw new Error('The registration service did not return a readable response.');
        }

        if (!response.ok || data.success === false) {
            throw new Error(data.error || 'The registration service could not process this request.');
        }

        return data;
    }

    async function checkBackendReady() {
        if (!appsScriptUrl) {
            setStatus('Secure checkout is not connected yet. Please contact SparkPreneurs to register.', 'warning');
            render();
            return;
        }

        try {
            const result = await postToAppsScript({ action: 'ping' });
            backendReady = Array.isArray(result.programs) && result.programs.includes(programCode);

            if (backendReady) {
                setStatus('');
            } else {
                setStatus('Class selection is ready. Secure checkout will be available after the payment update is deployed.', 'warning');
            }
        } catch (error) {
            setStatus('Secure checkout is temporarily unavailable. Please contact SparkPreneurs to register.', 'warning');
        }

        render();
    }

    async function verifyReturnedPayment() {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session_id');
        const paymentStatus = params.get('payment');

        if (paymentStatus === 'canceled') {
            setStatus('Payment was canceled. Please add the class again when you are ready.', 'warning');
            shop.scrollIntoView({ behavior: 'smooth', block: 'start' });
            window.history.replaceState({}, document.title, `${window.location.pathname}#hand-building-pottery`);
            return;
        }

        if (paymentStatus !== 'success' || !sessionId || !appsScriptUrl) {
            return;
        }

        setStatus('Checking payment status...', 'pending');
        shop.scrollIntoView({ behavior: 'smooth', block: 'start' });

        try {
            const result = await postToAppsScript({
                action: 'verifyCheckoutSession',
                stripeSessionId: sessionId
            });

            if (result.paymentStatus !== 'paid') {
                throw new Error('Payment could not be verified yet. Please contact SparkPreneurs.');
            }

            setStatus(result.message || 'Payment verified. Your registration has been received.', 'success');
        } catch (error) {
            setStatus(error.message || 'Payment could not be verified yet. Please contact SparkPreneurs.', 'error');
        } finally {
            window.history.replaceState({}, document.title, `${window.location.pathname}#hand-building-pottery`);
        }
    }

    addButton.addEventListener('click', function() {
        selected = !selected;

        if (backendReady) {
            setStatus('');
        }

        render();
    });

    cartList.addEventListener('click', function(event) {
        const removeButton = event.target.closest('[data-hand-building-remove]');

        if (!removeButton) {
            return;
        }

        selected = false;
        render();
    });

    clearButton.addEventListener('click', function() {
        selected = false;
        render();
    });

    purchaseButton.addEventListener('click', async function() {
        if (!backendReady) {
            setStatus('Secure checkout will be available after the payment update is deployed.', 'warning');
            return;
        }

        if (!selected) {
            setStatus('Please add the class to your cart first.', 'warning');
            return;
        }

        const registrationData = getRegistrationData();

        if (!registrationData) {
            setStatus('Please complete the registration fields before payment.', 'warning');
            return;
        }

        let waiverData;

        try {
            waiverData = await collectWaiverData(registrationData);
        } catch (error) {
            setStatus(error.message, 'error');
            return;
        }

        if (!waiverData) {
            setStatus('Please complete and sign the required waiver before payment.', 'warning');
            return;
        }

        const totals = calculateTotals();
        // Checkout returns must stay on the approved HTTPS site even if a visitor used an old HTTP link.
        const pageUrl = returnPageUrl;

        isSubmitting = true;
        purchaseButton.disabled = true;
        clearButton.disabled = true;
        purchaseButton.textContent = 'Opening Secure Payment...';
        setStatus('Checking the registration total...', 'pending');

        try {
            const result = await postToAppsScript({
                action: 'createCheckoutSession',
                programCode,
                selectedWeeks: [CLASS_ITEM.code],
                selectedWeekDetails: [{
                    code: CLASS_ITEM.code,
                    name: CLASS_ITEM.name,
                    displayedPriceCents: CLASS_ITEM.priceCents
                }],
                displayedAmountCents: totals.totalCents,
                successUrl: `${pageUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
                cancelUrl: `${pageUrl}?payment=canceled#hand-building-pottery`,
                ...registrationData,
                ...waiverData
            });

            if (!result.checkoutUrl) {
                throw new Error('Stripe Checkout did not return a payment link.');
            }

            window.location.href = result.checkoutUrl;
        } catch (error) {
            isSubmitting = false;
            purchaseButton.disabled = false;
            clearButton.disabled = false;
            purchaseButton.textContent = 'Continue to Secure Payment';
            setStatus(error.message || 'Payment could not be started. Please try again.', 'error');
        }
    });

    render();
    verifyReturnedPayment();
    checkBackendReady();
});
