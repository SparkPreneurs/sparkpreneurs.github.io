document.addEventListener('DOMContentLoaded', function() {
    const shop = document.querySelector('[data-after-school-shop]');

    if (!shop) {
        return;
    }

    const HST_RATE = 0.13;
    const cartList = shop.querySelector('[data-after-school-cart-list]');
    const totalsPanel = shop.querySelector('[data-after-school-cart-totals]');
    const subtotalEl = shop.querySelector('[data-after-school-subtotal]');
    const hstEl = shop.querySelector('[data-after-school-hst]');
    const totalEl = shop.querySelector('[data-after-school-total]');
    const registrationForm = shop.querySelector('[data-after-school-registration-form]');
    const checkoutButton = shop.querySelector('[data-after-school-checkout]');
    const clearButton = shop.querySelector('[data-after-school-clear]');
    const statusEl = shop.querySelector('[data-after-school-cart-status]');
    const appsScriptUrl = shop.dataset.appsScriptUrl || '';
    const programCode = shop.dataset.programCode || 'after_school_program';
    let selectedPlan = null;
    let backendReady = false;
    let isSubmitting = false;

    function formatMoneyCents(cents) {
        return (cents / 100).toLocaleString('en-CA', {
            style: 'currency',
            currency: 'CAD'
        });
    }

    function calculateTotals() {
        const subtotalCents = selectedPlan ? selectedPlan.priceCents : 0;
        const hstCents = Math.round(subtotalCents * HST_RATE);

        return {
            subtotalCents,
            hstCents,
            totalCents: subtotalCents + hstCents
        };
    }

    function syncSharedCart() {
        if (!window.SparkPreneursCart) return;
        window.SparkPreneursCart.setProgram({
            id: 'after-school',
            title: 'After School',
            checkoutUrl: `${window.location.pathname}#after-school`,
            items: selectedPlan ? [{ id: selectedPlan.code, name: `${selectedPlan.name} (3 PM-5 PM)`, priceCents: selectedPlan.priceCents }] : []
        });
    }

    function setStatus(message, type = '') {
        if (!statusEl) {
            return;
        }

        statusEl.textContent = message;
        statusEl.dataset.status = type;
    }

    function getPlanFromCard(card) {
        return {
            code: card.dataset.afterSchoolCode,
            name: card.dataset.afterSchoolPlan,
            priceCents: Number(card.dataset.afterSchoolPrice || 0)
        };
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
            const response = await fetch(appsScriptUrl);
            const result = await response.json();
            backendReady = Boolean(result.success && result.programCode === programCode && result.stripeMode === 'live');
            setStatus(backendReady ? '' : 'Secure checkout is in test mode and will be available after live payment is enabled.', backendReady ? '' : 'warning');
        } catch (error) {
            backendReady = false;
            setStatus('Secure checkout is temporarily unavailable. Please contact SparkPreneurs to register.', 'warning');
        }

        render();
    }

    async function verifyReturnedPayment() {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get('session_id');
        const paymentStatus = params.get('payment');

        if (paymentStatus === 'canceled') {
            setStatus('Payment was canceled. Please choose your weekly option again when you are ready.', 'warning');
            shop.scrollIntoView({ behavior: 'smooth', block: 'start' });
            window.history.replaceState({}, document.title, `${window.location.pathname}#after-school`);
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
                sessionId
            });
            setStatus(result.paid ? 'Payment received. Your After School registration has been recorded.' : 'Payment is still processing. Please contact SparkPreneurs if this does not update shortly.', result.paid ? 'success' : 'warning');
            window.history.replaceState({}, document.title, `${window.location.pathname}#after-school`);
        } catch (error) {
            setStatus('Payment was received, but the page could not confirm it automatically. Please contact SparkPreneurs with your payment receipt.', 'warning');
        }
    }

    function render() {
        shop.querySelectorAll('[data-after-school-plan]').forEach(card => {
            const isSelected = selectedPlan && card.dataset.afterSchoolCode === selectedPlan.code;
            card.classList.toggle('is-selected', Boolean(isSelected));

            const button = card.querySelector('[data-after-school-add]');
            button.textContent = isSelected ? 'Added' : 'Add to Cart';
            button.setAttribute('aria-pressed', String(Boolean(isSelected)));
        });

        cartList.innerHTML = '';

        if (!selectedPlan) {
            cartList.innerHTML = '<li class="after-school-cart-empty">No option added yet.</li>';
            totalsPanel.hidden = true;
            checkoutButton.disabled = true;
            checkoutButton.classList.add('is-disabled');
            clearButton.disabled = true;
            syncSharedCart();
            return;
        }

        const totals = calculateTotals();
        const item = document.createElement('li');
        const itemName = document.createElement('span');
        const itemPrice = document.createElement('strong');
        const removeButton = document.createElement('button');

        item.className = 'after-school-cart-item';
        itemName.className = 'after-school-cart-item-name';
        itemName.textContent = `${selectedPlan.name} from 3 PM-5 PM`;
        itemPrice.className = 'after-school-cart-item-price';
        itemPrice.textContent = formatMoneyCents(selectedPlan.priceCents);
        removeButton.className = 'after-school-cart-remove';
        removeButton.type = 'button';
        removeButton.textContent = 'Remove';
        removeButton.dataset.afterSchoolRemove = 'true';
        item.append(itemName, itemPrice, removeButton);
        cartList.appendChild(item);

        subtotalEl.textContent = formatMoneyCents(totals.subtotalCents);
        hstEl.textContent = formatMoneyCents(totals.hstCents);
        totalEl.textContent = formatMoneyCents(totals.totalCents);
        totalsPanel.hidden = false;
        checkoutButton.disabled = !backendReady || isSubmitting;
        checkoutButton.classList.toggle('is-disabled', !backendReady || isSubmitting);
        clearButton.disabled = isSubmitting;
        syncSharedCart();
    }

    shop.addEventListener('click', function(event) {
        const addButton = event.target.closest('[data-after-school-add]');
        const removeButton = event.target.closest('[data-after-school-remove]');

        if (addButton) {
            const card = addButton.closest('[data-after-school-plan]');
            const plan = getPlanFromCard(card);
            selectedPlan = selectedPlan && selectedPlan.code === plan.code ? null : plan;
            setStatus('');
            render();
            return;
        }

        if (removeButton) {
            selectedPlan = null;
            setStatus('');
            render();
        }
    });

    clearButton.addEventListener('click', function() {
        selectedPlan = null;
        setStatus('');
        render();
    });

    window.addEventListener('sparkpreneurs-cart-item-removed', function(event) {
        if (event.detail.programId !== 'after-school') return;
        selectedPlan = null;
        render();
    });

    checkoutButton.addEventListener('click', async function() {
        if (!backendReady) {
            setStatus('Secure checkout will be available after the payment update is deployed.', 'warning');
            return;
        }

        if (!selectedPlan) {
            setStatus('Please choose one weekly option first.', 'warning');
            return;
        }

        const registrationData = getRegistrationData();
        if (!registrationData) {
            setStatus('Please complete the registration fields before payment.', 'warning');
            return;
        }

        const totals = calculateTotals();
        const pageUrl = `${window.location.origin}${window.location.pathname}`;

        isSubmitting = true;
        checkoutButton.disabled = true;
        clearButton.disabled = true;
        checkoutButton.textContent = 'Opening Secure Payment...';
        setStatus('Checking the registration total...', 'pending');

        try {
            const result = await postToAppsScript({
                action: 'createCheckoutSession',
                programCode,
                selectedItemCodes: [selectedPlan.code],
                displayedAmountCents: totals.totalCents,
                successUrl: `${pageUrl}?payment=success`,
                cancelUrl: `${pageUrl}?payment=canceled#after-school`,
                ...registrationData
            });

            if (!result.checkoutUrl) {
                throw new Error('Stripe Checkout did not return a payment link.');
            }

            window.location.href = result.checkoutUrl;
        } catch (error) {
            isSubmitting = false;
            checkoutButton.disabled = false;
            clearButton.disabled = false;
            checkoutButton.textContent = 'Continue to Secure Payment';
            setStatus(error.message || 'Payment could not be started. Please try again.', 'error');
        }
    });

    const savedProgram = window.SparkPreneursCart && window.SparkPreneursCart.getProgram('after-school');
    if (savedProgram && savedProgram.items[0]) {
        const savedCard = shop.querySelector(`[data-after-school-code="${savedProgram.items[0].id}"]`);
        if (savedCard) selectedPlan = getPlanFromCard(savedCard);
    }
    render();
    verifyReturnedPayment();
    checkBackendReady();
});
