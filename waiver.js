(function() {
    const WAIVER_VERSION = '2026-06-15';
    let dialog;
    let form;
    let activeResolve;

    function field(label, name, type = 'text', options = '') {
        return `
            <label class="waiver-field">
                <span>${label}</span>
                <input type="${type}" name="${name}" ${options}>
            </label>
        `;
    }

    function createDialog() {
        dialog = document.createElement('dialog');
        dialog.className = 'waiver-dialog';
        dialog.setAttribute('aria-labelledby', 'waiver-title');
        dialog.innerHTML = `
            <form class="waiver-form" method="dialog" novalidate>
                <div class="waiver-header">
                    <div>
                        <p class="waiver-kicker">Required Before Checkout</p>
                        <h2 id="waiver-title">SparkPreneurs Inc.</h2>
                        <p>Participant/Guardian Waiver, Consent and Medical Information Form</p>
                    </div>
                    <button class="waiver-close" type="button" data-waiver-cancel aria-label="Close waiver">&times;</button>
                </div>

                <div class="waiver-body">
                    <section class="waiver-section">
                        <h3>Participant Information</h3>
                        <div class="waiver-fields">
                            ${field('Participant Full Name', 'waiverChildFullName', 'text', 'autocomplete="name" required')}
                            ${field('Date of Birth', 'childDateOfBirth', 'date', 'required')}
                            ${field('Participant or Guardian Full Name', 'waiverParentGuardianFullName', 'text', 'autocomplete="name" required')}
                            ${field('Phone Number', 'waiverParentPhone', 'tel', 'autocomplete="tel" required')}
                            ${field('Email Address', 'waiverParentEmail', 'email', 'autocomplete="email" required')}
                            ${field('Emergency Contact Name', 'emergencyContactName', 'text', 'required')}
                            ${field('Emergency Contact Phone', 'emergencyContactPhone', 'tel', 'required')}
                            ${field('Relationship to Participant', 'emergencyContactRelationship', 'text', 'required')}
                        </div>
                    </section>

                    <section class="waiver-section">
                        <h3>Medical Information</h3>
                        <label class="waiver-field">
                            <span>Please identify any medical conditions, allergies, medications, dietary restrictions, accessibility needs, or other information that may affect the participant’s safe involvement. Enter “None” when there is nothing to report.</span>
                            <textarea name="medicalInformation" rows="5" required></textarea>
                        </label>
                        <label class="waiver-check">
                            <input type="checkbox" name="medicalInformationConfirmed" value="yes" required>
                            <span>I confirm that I have provided complete and accurate medical and emergency information and will notify SparkPreneurs Inc. of any changes.</span>
                        </label>
                    </section>

                    <section class="waiver-section waiver-terms">
                        <h3>Acknowledgement and Assumption of Risk</h3>
                        <p>I understand that participation in SparkPreneurs Inc. programs may include art, pottery, movement, dance, yoga, 3D printing, cooking, outdoor activities, games, camps, workshops, and the use of program-appropriate tools and materials.</p>
                        <p>I understand that participation may involve ordinary risks, including slips, falls, minor cuts, allergic reactions, contact with art materials, physical exertion, equipment use, and other minor injuries.</p>
                        <p>I voluntarily consent to participation and agree to inform SparkPreneurs Inc. of any activity the participant should not join.</p>

                        <h3>Safety and Conduct</h3>
                        <p>I understand that the participant must follow the safety instructions and behaviour expectations provided by SparkPreneurs Inc. staff.</p>
                        <p>SparkPreneurs Inc. reserves the right to contact a parent or guardian and require early pick-up if a participant’s behaviour creates a safety risk to themselves or others.</p>

                        <h3>Emergency Medical Consent</h3>
                        <p>If I cannot be reached during an emergency, I authorize SparkPreneurs Inc. staff to provide reasonable first aid; contact emergency medical services; arrange transportation to a medical facility when necessary; and share relevant medical information with emergency responders.</p>
                        <p>I understand that I am responsible for any medical or transportation expenses not covered by insurance.</p>

                        <h3>Release and Indemnity</h3>
                        <p>To the extent permitted by law, I agree not to hold SparkPreneurs Inc., its directors, employees, instructors, contractors, volunteers, partners, or venue providers responsible for claims arising from the ordinary and inherent risks of participation.</p>
                        <p>This section does not release any party from liability that cannot legally be excluded, including gross negligence or intentional misconduct.</p>

                        <h3>Personal Belongings</h3>
                        <p>I understand that SparkPreneurs Inc. is not responsible for lost, stolen, or damaged personal belongings. Participants should not bring valuable items unless required for the program.</p>
                    </section>

                    <section class="waiver-section">
                        <h3>Photo and Video Consent — Optional</h3>
                        <p>Please select one. Refusing photo consent will not affect the participant’s ability to participate.</p>
                        <label class="waiver-check">
                            <input type="radio" name="photoConsent" value="yes" required>
                            <span><strong>Yes,</strong> I authorize SparkPreneurs Inc. to photograph or record the participant during programs and use selected images or videos for its website, social media, advertisements, printed materials, and other promotional purposes.</span>
                        </label>
                        <label class="waiver-check">
                            <input type="radio" name="photoConsent" value="no" required>
                            <span><strong>No,</strong> I do not authorize the use of identifiable photographs or videos of the participant for promotional purposes.</span>
                        </label>
                    </section>

                    <section class="waiver-section">
                        <h3>Pick-Up Authorization</h3>
                        <p>List at least one person authorized to pick up the participant when required. Identification may be requested before the participant is released.</p>
                        <div class="waiver-fields">
                            ${field('Authorized Person 1 Name', 'authorizedPickup1Name', 'text', 'required')}
                            ${field('Authorized Person 1 Phone', 'authorizedPickup1Phone', 'tel', 'required')}
                            ${field('Authorized Person 2 Name', 'authorizedPickup2Name')}
                            ${field('Authorized Person 2 Phone', 'authorizedPickup2Phone', 'tel')}
                            ${field('Authorized Person 3 Name', 'authorizedPickup3Name')}
                            ${field('Authorized Person 3 Phone', 'authorizedPickup3Phone', 'tel')}
                        </div>
                    </section>

                    <section class="waiver-section">
                        <h3>Participant/Guardian Confirmation</h3>
                        <p>By signing below, I confirm that I am the participant or the participant’s parent/legal guardian; I have read and understood this form; the information I provided is complete and accurate; I consent to participation; and I agree that my electronic signature has the same effect as a handwritten signature.</p>
                        <label class="waiver-check">
                            <input type="checkbox" name="waiverAcknowledged" value="yes" required>
                            <span>I have read and agree to the acknowledgements, consents, release, and confirmation above.</span>
                        </label>
                        <div class="waiver-fields">
                            ${field('Participant/Guardian Full Name', 'waiverConfirmationName', 'text', 'required')}
                            ${field('Electronic Signature', 'electronicSignature', 'text', 'required')}
                            ${field('Date', 'waiverSignedDate', 'date', 'required')}
                        </div>
                    </section>
                </div>

                <div class="waiver-actions">
                    <button class="summer-cart-clear" type="button" data-waiver-cancel>Cancel</button>
                    <button class="summer-cart-purchase" type="submit">Sign Waiver & Continue to Secure Payment</button>
                </div>
            </form>
        `;

        document.body.appendChild(dialog);
        form = dialog.querySelector('.waiver-form');

        dialog.querySelectorAll('[data-waiver-cancel]').forEach(button => {
            button.addEventListener('click', cancel);
        });

        dialog.addEventListener('cancel', event => {
            event.preventDefault();
            cancel();
        });

        form.addEventListener('submit', event => {
            event.preventDefault();

            if (!form.reportValidity()) {
                return;
            }

            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            data.medicalInformationConfirmed = formData.get('medicalInformationConfirmed') === 'yes';
            data.waiverAcknowledged = formData.get('waiverAcknowledged') === 'yes';
            data.waiverAccepted = true;
            data.waiverVersion = WAIVER_VERSION;

            dialog.close();
            const resolve = activeResolve;
            activeResolve = null;
            resolve(data);
        });
    }

    function setIfBlank(name, value) {
        const input = form.elements.namedItem(name);

        if (input && !input.value) {
            input.value = value || '';
        }
    }

    function cancel() {
        if (dialog.open) {
            dialog.close();
        }

        if (activeResolve) {
            const resolve = activeResolve;
            activeResolve = null;
            resolve(null);
        }
    }

    function collect(prefill = {}) {
        if (!dialog) {
            createDialog();
        }

        if (activeResolve) {
            return Promise.resolve(null);
        }

        setIfBlank('waiverChildFullName', prefill.childName);
        setIfBlank('waiverParentGuardianFullName', prefill.parentName);
        setIfBlank('waiverConfirmationName', prefill.parentName);
        setIfBlank('electronicSignature', prefill.parentName);
        setIfBlank('waiverParentEmail', prefill.parentEmail);
        setIfBlank('waiverParentPhone', prefill.phone);
        const now = new Date();
        const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
        setIfBlank('waiverSignedDate', localDate);

        dialog.showModal();
        dialog.querySelector('.waiver-body').scrollTop = 0;

        return new Promise(resolve => {
            activeResolve = resolve;
        });
    }

    window.SparkPreneursWaiver = { collect };
})();
