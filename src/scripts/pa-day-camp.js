const camp = document.querySelector('[data-pa-camp]');

if (camp) {
  const find = selector => camp.querySelector(selector);
  const tabs = [...camp.querySelectorAll('[data-pa-tab]')];
  const panels = [...camp.querySelectorAll('[data-pa-panel]')];
  const form = find('[data-pa-form]');
  const days = [...camp.querySelectorAll('[data-pa-day]')];
  const money = cents => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
  const selected = () => days.filter(day => day.querySelector('[data-pa-select]').checked);
  const optionFor = day => day.querySelector('select').selectedOptions[0];
  const subtotal = () => selected().reduce((sum, day) => sum + Number(optionFor(day).dataset.price), 0);
  const status = find('[data-pa-status]');
  const timePickers = days.map(day => ({
    day, select: day.querySelector('select'), trigger: day.querySelector('[data-pa-time-trigger]'),
    menu: day.querySelector('[data-pa-time-menu]'), options: [...day.querySelectorAll('[data-pa-time-option]')],
  }));
  function closeTimeMenus() {
    timePickers.forEach(picker => {
      picker.menu.hidden = true;
      picker.trigger.setAttribute('aria-expanded', 'false');
    });
  }
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  function showPanel(id, focus = false) {
    closeTimeMenus();
    tabs.forEach(tab => {
      const active = tab.dataset.paTab === id;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    panels.forEach(panel => { panel.hidden = panel.id !== id; });
  }

  function navigate(id) {
    showPanel(id, true);
    history.replaceState({}, '', `#${id}`);
    find('#pa-booking').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function render() {
    const selection = selected();
    days.forEach(day => {
      const checked = day.querySelector('[data-pa-select]').checked;
      day.classList.toggle('is-selected', checked);
      day.querySelector('select').disabled = !checked || day.hidden;
    });
    timePickers.forEach(picker => {
      const option = picker.select.selectedOptions[0];
      picker.trigger.disabled = picker.select.disabled;
      picker.trigger.querySelector('[data-pa-time-text]').textContent = option.value === 'extended' ? '8:00 AM - 5:00 PM' : '8:00 AM - 3:00 PM';
      picker.trigger.querySelector('[data-pa-time-price]').textContent = money(Number(option.dataset.price));
      picker.options.forEach(button => button.setAttribute('aria-selected', String(button.dataset.paTimeOption === option.value)));
      if (picker.trigger.disabled) {
        picker.menu.hidden = true;
        picker.trigger.setAttribute('aria-expanded', 'false');
      }
    });
    find('[data-pa-count]').textContent = `${selection.length} ${selection.length === 1 ? 'day' : 'days'} selected`;
    find('[data-pa-selection-total]').textContent = money(subtotal());
    find('[data-pa-subtotal]').textContent = money(subtotal());
    find('[data-pa-summary]').hidden = !selection.length;
    find('[data-pa-submit]').disabled = !selection.length;
    find('[data-pa-next]').disabled = !selection.length;
    find('[data-pa-clear]').hidden = !selection.length;
    const list = find('[data-pa-items]');
    list.replaceChildren();
    if (!selection.length) {
      const empty = document.createElement('li');
      empty.className = 'pa-cart-empty';
      empty.textContent = 'Choose your PA days to start your booking.';
      list.append(empty);
    }
    selection.forEach(day => {
      const option = optionFor(day);
      const item = document.createElement('li');
      item.className = 'pa-cart-item';
      const title = document.createElement('strong');
      title.textContent = day.dataset.label;
      const price = document.createElement('b');
      price.textContent = money(Number(option.dataset.price));
      const detail = document.createElement('span');
      detail.textContent = option.dataset.label;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${day.dataset.label}`);
      remove.addEventListener('click', () => {
        day.querySelector('[data-pa-select]').checked = false;
        status.textContent = '';
        render();
      });
      item.append(title, price, detail, remove);
      list.append(item);
    });
  }

  timePickers.forEach(picker => {
    const open = (last = false) => {
      if (picker.trigger.disabled) return;
      closeTimeMenus();
      picker.menu.hidden = false;
      picker.trigger.setAttribute('aria-expanded', 'true');
      const selectedOption = picker.options.find(button => button.dataset.paTimeOption === picker.select.value);
      (last ? picker.options.at(-1) : selectedOption || picker.options[0]).focus();
    };
    picker.trigger.addEventListener('click', () => {
      if (picker.menu.hidden) open();
      else closeTimeMenus();
    });
    picker.trigger.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        open(event.key === 'ArrowUp');
      }
    });
    picker.options.forEach((button, index) => {
      button.addEventListener('click', () => {
        picker.select.value = button.dataset.paTimeOption;
        closeTimeMenus();
        status.textContent = '';
        render();
        picker.trigger.focus();
      });
      button.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault(); closeTimeMenus(); picker.trigger.focus(); return;
        }
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? picker.options.length - 1
          : event.key === 'ArrowDown' ? (index + 1) % picker.options.length
          : event.key === 'ArrowUp' ? (index + picker.options.length - 1) % picker.options.length : null;
        if (next === null) return;
        event.preventDefault(); picker.options[next].focus();
      });
    });
    picker.day.addEventListener('focusout', event => {
      if (!picker.day.contains(event.relatedTarget)) {
        picker.menu.hidden = true;
        picker.trigger.setAttribute('aria-expanded', 'false');
      }
    });
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-pa-time-picker]')) closeTimeMenus();
  });
  days.forEach(day => {
    if (day.dataset.date < today) {
      day.hidden = true;
      day.querySelector('[data-pa-select]').checked = false;
      day.querySelector('[data-pa-select]').disabled = true;
    }
    day.addEventListener('change', () => { status.textContent = ''; render(); });
  });
  find('[data-pa-no-dates]').hidden = days.some(day => !day.hidden);
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => navigate(tab.dataset.paTab));
    tab.addEventListener('keydown', event => {
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : event.key === 'ArrowRight' ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : null;
      if (next === null) return;
      event.preventDefault();
      navigate(tabs[next].dataset.paTab);
    });
  });
  document.querySelectorAll('a[href="#pa-dates"], a[href="#pa-enrollment"]').forEach(link => {
    link.addEventListener('click', event => { event.preventDefault(); navigate(link.hash.slice(1)); });
  });
  find('[data-pa-next]').addEventListener('click', () => { if (selected().length) navigate('pa-enrollment'); });
  find('[data-pa-clear]').addEventListener('click', () => {
    days.forEach(day => { day.querySelector('[data-pa-select]').checked = false; });
    status.textContent = '';
    render();
  });
  window.addEventListener('hashchange', () => {
    if (['#pa-dates', '#pa-enrollment'].includes(location.hash)) showPanel(location.hash.slice(1));
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!selected().length || !form.reportValidity()) return;
    const fields = Object.fromEntries(new FormData(form));
    const lines = selected().map(day => `${day.dataset.label}: ${optionFor(day).dataset.label} — ${money(Number(optionFor(day).dataset.price))}`);
    const body = [
      'Hello SparkPreneurs,', '', 'I would like to register one child for PA Day Camp:', '', ...lines, '',
      `Camp subtotal: ${money(subtotal())} CAD`, 'Please confirm availability, any applicable tax, and payment instructions.', '',
      `Child: ${fields.studentName.trim()}`, `Age: ${fields.studentAge}`, `School: ${fields.school.trim()}`,
      `Parent / guardian: ${fields.parentName.trim()}`, `Email: ${fields.parentEmail.trim()}`, `Phone: ${fields.phone.trim()}`,
      `Discount / referral code: ${fields.discountCode.trim() || 'None'}`, '', 'Thank you!',
    ].join('\n');
    const mailto = `mailto:${camp.dataset.email}?subject=${encodeURIComponent('PA Day Camp Registration')}&body=${encodeURIComponent(body)}`;
    find('[data-pa-email-link]').href = mailto;
    find('[data-pa-email-link]').hidden = false;
    status.textContent = 'Your email app will open with your registration details. Send the email to request your place; the studio will confirm availability and payment.';
    window.location.assign(mailto);
  });
  showPanel(location.hash === '#pa-enrollment' ? 'pa-enrollment' : 'pa-dates');
  render();
}
