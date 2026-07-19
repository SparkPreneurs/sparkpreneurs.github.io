document.addEventListener('DOMContentLoaded', function() {
    const shop = document.querySelector('[data-after-school-shop]');

    if (!shop) {
        return;
    }

    const cartList = shop.querySelector('[data-after-school-cart-list]');
    const requestLink = shop.querySelector('[data-after-school-request]');
    const clearButton = shop.querySelector('[data-after-school-clear]');
    let selectedPlan = '';

    function render() {
        shop.querySelectorAll('[data-after-school-plan]').forEach(card => {
            const isSelected = card.dataset.afterSchoolPlan === selectedPlan;
            card.classList.toggle('is-selected', isSelected);

            const button = card.querySelector('[data-after-school-add]');
            button.textContent = isSelected ? 'Added' : 'Add to Cart';
            button.setAttribute('aria-pressed', String(isSelected));
        });

        cartList.innerHTML = '';

        if (!selectedPlan) {
            cartList.innerHTML = '<li class="after-school-cart-empty">No option added yet.</li>';
            requestLink.classList.add('is-disabled');
            requestLink.href = '../index.html#contact';
            clearButton.disabled = true;
            return;
        }

        const item = document.createElement('li');
        const itemName = document.createElement('span');
        const removeButton = document.createElement('button');
        const subject = encodeURIComponent(`After School request - ${selectedPlan}`);
        const body = encodeURIComponent(`Hello SparkPreneurs,\n\nI am interested in the After School program for ${selectedPlan}, 3 PM-5 PM. Please send pricing, availability, and neighbourhood school pick-up details.\n\nThank you.`);

        item.className = 'after-school-cart-item';
        itemName.className = 'after-school-cart-item-name';
        itemName.textContent = `${selectedPlan} from 3 PM-5 PM`;
        removeButton.className = 'after-school-cart-remove';
        removeButton.type = 'button';
        removeButton.textContent = 'Remove';
        removeButton.dataset.afterSchoolRemove = 'true';
        item.append(itemName, removeButton);
        cartList.appendChild(item);

        requestLink.classList.remove('is-disabled');
        requestLink.href = `mailto:sparkpreneurs.ca@gmail.com?subject=${subject}&body=${body}`;
        clearButton.disabled = false;
    }

    shop.addEventListener('click', function(event) {
        const addButton = event.target.closest('[data-after-school-add]');
        const removeButton = event.target.closest('[data-after-school-remove]');

        if (addButton) {
            selectedPlan = addButton.dataset.afterSchoolAdd === selectedPlan ? '' : addButton.dataset.afterSchoolAdd;
            render();
            return;
        }

        if (removeButton) {
            selectedPlan = '';
            render();
        }
    });

    clearButton.addEventListener('click', function() {
        selectedPlan = '';
        render();
    });

    render();
});
