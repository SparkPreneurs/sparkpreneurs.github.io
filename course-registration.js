(function() {
    'use strict';

    function initCourseRegistration(shop) {
        const item = {
            code: String(shop.dataset.itemCode || '').trim().toUpperCase(),
            name: String(shop.dataset.itemName || '').trim(),
            priceCents: Number(shop.dataset.priceCents || 0)
        };
        const programCode = String(shop.dataset.programCode || '').trim();
        const appsScriptUrl = String(shop.dataset.appsScriptUrl || '').trim();
        const returnPageUrl = String(shop.dataset.returnUrl || '').trim();
        const anchorId = String(shop.dataset.courseAnchor || 'registration').trim();
        const requiredStripeMode = String(shop.dataset.requiredStripeMode || '').trim().toLowerCase();
        const checkoutReturnStatus = new URLSearchParams(window.location.search).get('payment');
        const taxRate = Number(shop.dataset.taxRatePercent || 0) / 100;
        const requiresWaiver = shop.dataset.requiresWaiver === 'true';
        const addButton = shop.querySelector('[data-course-add]');
        const classCard = shop.querySelector('[data-course-card]');
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
        const successDialog = document.querySelector('[data-course-success-dialog]');
        const successDialogMessage = successDialog?.querySelector('[data-course-success-message]');
        const successDialogClose = successDialog?.querySelector('[data-course-success-close]');
        let selected = false;
        let isSubmitting = false;
        let backendReady = false;

        if (!item.code || !item.name || !Number.isInteger(item.priceCents) || item.priceCents < 0 || !programCode || !addButton || !classCard || !cartList || !totalsPanel || !subtotalEl || !taxEl || !grandTotalEl || !registrationForm || !purchaseButton || !clearButton || !statusEl) {
            return;
        }

        function formatMoneyCents(cents) {
            return (cents / 100).toLocaleString('en-CA', {
                style: 'currency',
                currency: 'CAD'
            });
        }

        function calculateTotals() {
            const subtotalCents = selected ? item.priceCents : 0;
            const taxCents = Math.round(subtotalCents * taxRate);

            return {
                subtotalCents,
                taxCents,
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

        function showPaymentSuccess(message) {
            if (!successDialog) return false;

            if (successDialogMessage) {
                successDialogMessage.textContent = message;
            }

            if (typeof successDialog.showModal === 'function') {
                if (!successDialog.open) successDialog.showModal();
            } else {
                successDialog.setAttribute('open', '');
            }

            return true;
        }

        function render() {
            const totals = calculateTotals();
            classCard.classList.toggle('is-selected', selected);
            addButton.classList.toggle('is-added', selected);
            addButton.setAttribute('aria-pressed', String(selected));
            addButton.textContent = selected ? 'Added' : 'Add to Cart';
            cartList.replaceChildren();

            if (!selected) {
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
                backendReady = Array.isArray(result.programs) && result.programs.includes(programCode) && (!requiredStripeMode || result.stripeMode === requiredStripeMode);
                if (!backendReady || !checkoutReturnStatus) {
                    setStatus(backendReady ? '' : 'Secure checkout is temporarily unavailable. Please contact SparkPreneurs.', backendReady ? '' : 'warning');
                }
            } catch (error) {
                backendReady = false;
                setStatus('Secure checkout is temporarily unavailable. Please contact SparkPreneurs.', 'warning');
            }

            render();
        }

        async function collectWaiverData(registrationData) {
            if (!requiresWaiver) return {};
            if (!window.SparkPreneursWaiver) {
                throw new Error('The required waiver could not be opened. Please refresh the page and try again.');
            }

            return window.SparkPreneursWaiver.collect({
                childName: registrationData.studentName,
                parentName: registrationData.parentName,
                parentEmail: registrationData.parentEmail,
                phone: registrationData.phone
            }, {
                kicker: 'Required Before 3D Printing Checkout',
                submitLabel: 'Sign Waiver & Continue to Secure Payment'
            });
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
                const successMessage = result.message || 'Payment verified. Your registration has been received.';
                if (showPaymentSuccess(successMessage)) {
                    setStatus('', '');
                } else {
                    setStatus(successMessage, 'success');
                }
            } catch (error) {
                setStatus(error.message || 'Payment could not be verified yet. Please contact SparkPreneurs.', 'error');
            } finally {
                replaceCheckoutQuery();
            }
        }

        addButton.addEventListener('click', function() {
            selected = !selected;
            if (backendReady) setStatus('', '');
            render();
        });

        cartList.addEventListener('click', function(event) {
            if (!event.target.closest('[data-course-remove]')) return;
            selected = false;
            render();
        });

        clearButton.addEventListener('click', function() {
            selected = false;
            render();
        });

        successDialogClose?.addEventListener('click', function() {
            if (typeof successDialog.close === 'function') {
                successDialog.close();
            } else {
                successDialog.removeAttribute('open');
            }
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
                setStatus(error.message || 'The waiver could not be opened. Please try again.', 'error');
                return;
            }

            if (waiverData === null) {
                setStatus('Please complete and sign the required waiver before payment.', 'warning');
                return;
            }

            const totals = calculateTotals();
            isSubmitting = true;
            purchaseButton.disabled = true;
            clearButton.disabled = true;
            purchaseButton.textContent = 'Opening Secure Payment...';
            setStatus('Checking the registration total...', 'pending');

            try {
                const result = await postToAppsScript({
                    action: 'createCheckoutSession',
                    programCode,
                    selectedItemCodes: [item.code],
                    selectedWeeks: [item.code],
                    selectedWeekDetails: [{ code: item.code, name: item.name, displayedPriceCents: item.priceCents }],
                    displayedAmountCents: totals.totalCents,
                    successUrl: `${returnPageUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
                    cancelUrl: `${returnPageUrl}?payment=canceled#${anchorId}`,
                    ...registrationData,
                    ...waiverData
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

    function initializeCourseRegistrations() {
        document.querySelectorAll('[data-course-registration]').forEach(initCourseRegistration);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeCourseRegistrations);
    } else {
        initializeCourseRegistrations();
    }
}());
