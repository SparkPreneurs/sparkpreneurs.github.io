(function() {
    'use strict';

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
            return;
        }

        selectedName.textContent = input.dataset.cohortLabel || '';
        selectedTime.textContent = input.dataset.cohortTime || '';
        selectedDates.textContent = input.dataset.cohortDates || '';
        submitButton.disabled = false;
        setStatus('', '');
    }

    cohortInputs.forEach((input) => input.addEventListener('change', updateSelection));

    clearButton.addEventListener('click', function() {
        cohortInputs.forEach((input) => { input.checked = false; });
        form.reset();
        updateSelection();
        setStatus('Your cohort selection and form details were cleared.', 'warning');
    });

    submitButton.addEventListener('click', function() {
        const input = selectedInput();

        if (!input) {
            setStatus('Please choose one four-session cohort before continuing.', 'warning');
            document.querySelector('#schedule')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }

        if (!form.reportValidity()) {
            setStatus('Please complete the required registration fields before continuing.', 'warning');
            return;
        }

        setStatus('Your selection is ready. Secure checkout will be enabled after the private registration service is connected.', 'warning');
    });

    updateSelection();
}());
