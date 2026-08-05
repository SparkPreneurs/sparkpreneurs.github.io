(function() {
    'use strict';

    function initHandBuildingRegistration(shop) {
        const programCode = String(shop.dataset.programCode || '').trim();
        const appsScriptUrl = String(shop.dataset.appsScriptUrl || '').trim();
        const returnPageUrl = String(shop.dataset.returnUrl || '').trim();
        const anchorId = String(shop.dataset.courseAnchor || 'registration').trim();
        const taxRate = Number(shop.dataset.taxRatePercent || 0) / 100;
        const cartList = shop.querySelector('[data-course-cart-list]');
        const totalsPanel = shop.querySelector('[data-course-cart-totals]');
        const subtotalEl = shop.querySelector('[data-course-subtotal]');
        const taxLabelEl = shop.querySelector('[data-course-tax-label]');
        const taxEl = shop.querySelector('[data-course-tax]');
        const grandTotalEl = shop.querySelector('[data-course-grand-total]');
        const registrationForm = shop.querySelector('[data-course-registration-form]');
        const purchaseButton = shop.querySelector('[data-course-purchase]');
        const clearButton = shop.querySelector('[data-course-clear]');
        const statusEl = shop.querySelector('[data-course-status]');
        const choices = Array.from(shop.querySelectorAll('[data-course-card]')).map(function(card) {
            const addButton = card.querySelector('[data-course-add]');

            return {
                card: card,
                addButton: addButton,
                addLabel: addButton ? addButton.textContent.trim() : 'Add to Cart',
                code: String(card.dataset.courseItemCode || '').trim().toUpperCase(),
                name: String(card.dataset.courseItemName || '').trim(),
                priceCents: Number(card.dataset.coursePriceCents || 0)
            };
        });
        let selectedItemCode = '';
        let isSubmitting = false;
        let backendReady = false;

        if (!programCode || !cartList || !totalsPanel || !subtotalEl || !taxEl || !grandTotalEl || !registrationForm || !purchaseButton || !clearButton || !statusEl || !choices.length || choices.some(function(choice) {
            return !choice.addButton || !choice.code || !choice.name || !Number.isInteger(choice.priceCents) || choice.priceCents < 0;
        })) {
            return;
        }

        function selectedItem() {
            return choices.find(function(choice) {
                return choice.code === selectedItemCode;
            }) || null;
        }

        function formatMoneyCents(cents) {
            return (cents / 100).toLocaleString('en-CA', {
                style: 'currency',
                currency: 'CAD'
            });
        }

        function calculateTotals(item) {
            const subtotalCents = item ? item.priceCents : 0;
            const taxCents = Math.round(subtotalCents * taxRate);

            return {
                subtotalCents: subtotalCents,
                taxCents: taxCents,
                totalCents: subtotalCents + taxCents
            };
        }

        function setStatus(message, type) {
            statusEl.textContent = message || '';
            statusEl.dataset.status = type || '';
        }

        function replaceCheckoutQuery() {
            window.history.replaceState({}, document.title, `${window.location.pathname}#${anchorId}`);
        }

        function render() {
            const item = selectedItem();
            const totals = calculateTotals(item);

            choices.forEach(function(choice) {
                const isSelected = choice.code === selectedItemCode;
                choice.card.classList.toggle('is-selected', isSelected);
                choice.addButton.classList.toggle('is-added', isSelected);
                choice.addButton.setAttribute('aria-pressed', String(isSelected));
                choice.addButton.textContent = isSelected ? 'Added' : choice.addLabel;
            });

            cartList.replaceChildren();

            if (!item) {
                const empty = document.createElement('li');
                empty.className = 'summer-cart-empty';
                empty.textContent = 'No class added yet.';
                cartList.appendChild(empty);
                totalsPanel.hidden = true;
                purchaseButton.disabled = true;
                clearButton.disabled = true;
                return;
            }

            const cartItem = document.createElement('li');
            const name = document.createElement('span');
            const removeButton = document.createElement('button');
            cartItem.className = 'summer-cart-item';
            name.className = 'summer-cart-item-name';
            name.textContent = `${item.name} - ${formatMoneyCents(item.priceCents)}`;
            removeButton.className = 'summer-cart-remove';
            removeButton.type = 'button';
            removeButton.dataset.courseRemove = 'true';
            removeButton.textContent = 'Remove';
            cartItem.append(name, removeButton);
            cartList.appendChild(cartItem);

            totalsPanel.hidden = false;
            subtotalEl.textContent = formatMoneyCents(totals.subtotalCents);
            taxEl.textContent = formatMoneyCents(totals.taxCents);
            grandTotalEl.textContent = formatMoneyCents(totals.totalCents);
            if (taxLabelEl) taxLabelEl.textContent = taxRate ? `HST ${Math.round(taxRate * 100)}%` : 'Tax included';
            purchaseButton.disabled = isSubmitting || !backendReady;
            clearButton.disabled = isSubmitting;
        }

        function getRegistrationData() {
            if (!registrationForm.reportValidity()) return null;

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

        async function checkBackendReady() {
            if (!appsScriptUrl) {
                setStatus('Registration is ready. Secure checkout will be available after the payment update is deployed.', 'warning');
                render();
                return;
            }

            try {
                const result = await postToAppsScript({ action: 'ping' });
                backendReady = Array.isArray(result.programs) && result.programs.includes(programCode);
                setStatus(backendReady ? '' : 'Secure checkout is temporarily unavailable. Please contact SparkPreneurs.', backendReady ? '' : 'warning');
            } catch (error) {
                backendReady = false;
                setStatus('Secure checkout is temporarily unavailable. Please contact SparkPreneurs.', 'warning');
            }

            render();
        }

        async function verifyReturnedPayment() {
            const params = new URLSearchParams(window.location.search);
            const sessionId = params.get('session_id');
            const paymentStatus = params.get('payment');

            if (paymentStatus === 'canceled') {
                setStatus('Payment was canceled. Your class selection is still available when you are ready.', 'warning');
                shop.scrollIntoView({ behavior: 'smooth', block: 'start' });
                replaceCheckoutQuery();
                return;
            }

            if (paymentStatus !== 'success' || !sessionId || !appsScriptUrl) return;

            setStatus('Checking payment status...', 'pending');
            shop.scrollIntoView({ behavior: 'smooth', block: 'start' });

            try {
                const result = await postToAppsScript({ action: 'verifyCheckoutSession', stripeSessionId: sessionId });
                if (result.paymentStatus !== 'paid') throw new Error('Payment could not be verified yet. Please contact SparkPreneurs.');
                setStatus(result.message || 'Payment verified. Your registration has been received.', 'success');
            } catch (error) {
                setStatus(error.message || 'Payment could not be verified yet. Please contact SparkPreneurs.', 'error');
            } finally {
                replaceCheckoutQuery();
            }
        }

        choices.forEach(function(choice) {
            choice.addButton.addEventListener('click', function() {
                selectedItemCode = selectedItemCode === choice.code ? '' : choice.code;
                if (backendReady) setStatus('', '');
                render();
            });
        });

        cartList.addEventListener('click', function(event) {
            if (!event.target.closest('[data-course-remove]')) return;
            selectedItemCode = '';
            render();
        });

        clearButton.addEventListener('click', function() {
            selectedItemCode = '';
            render();
        });

        purchaseButton.addEventListener('click', async function() {
            const item = selectedItem();

            if (!backendReady) {
                setStatus('Secure checkout will be available after the payment update is deployed.', 'warning');
                return;
            }

            if (!item) {
                setStatus('Please add one class schedule to your cart first.', 'warning');
                return;
            }

            const registrationData = getRegistrationData();
            if (!registrationData) {
                setStatus('Please complete the registration fields before payment.', 'warning');
                return;
            }

            const totals = calculateTotals(item);
            isSubmitting = true;
            purchaseButton.disabled = true;
            clearButton.disabled = true;
            purchaseButton.textContent = 'Opening Secure Payment...';
            setStatus('Checking the registration total...', 'pending');

            try {
                const result = await postToAppsScript({
                    action: 'createCheckoutSession',
                    programCode: programCode,
                    selectedItemCodes: [item.code],
                    selectedWeeks: [item.code],
                    selectedWeekDetails: [{ code: item.code, name: item.name, displayedPriceCents: item.priceCents }],
                    displayedAmountCents: totals.totalCents,
                    successUrl: `${returnPageUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
                    cancelUrl: `${returnPageUrl}?payment=canceled#${anchorId}`,
                    ...registrationData
                });
                const checkoutUrl = new URL(result.checkoutUrl);
                if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com') {
                    throw new Error('Stripe returned an invalid payment link.');
                }
                window.location.href = checkoutUrl.href;
            } catch (error) {
                isSubmitting = false;
                purchaseButton.disabled = false;
                clearButton.disabled = false;
                purchaseButton.textContent = 'Continue to Secure Payment';
                setStatus(error.message || 'Payment could not be started. Please try again.', 'error');
            }
        });

        render();
        checkBackendReady();
        verifyReturnedPayment();
    }

    function initializeHandBuildingRegistration() {
        document.querySelectorAll('[data-course-registration]').forEach(initHandBuildingRegistration);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeHandBuildingRegistration);
    } else {
        initializeHandBuildingRegistration();
    }
}());
