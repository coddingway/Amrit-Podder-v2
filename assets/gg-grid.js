/**
 * Gift Guide — product grid quick-view popup.
 * ----------------------------------------------------------------------------
 * Vanilla JS (no jQuery, no Dawn helpers). One custom element per section:
 *
 *   <gg-product-grid>  ← sections/gift-guide-grid.liquid
 *
 * Responsibilities
 *   1. Open a native <dialog> when a "+" hotspot is clicked.
 *   2. Render the product's name, price, description and options from the JSON
 *      embedded next to each hotspot (variants are fully data-driven).
 *      - "Color/Colour" options → button group with a colour swatch bar
 *      - every other option     → custom dropdown ("Choose your size")
 *   3. Resolve the selected variant and add it to the cart (AJAX Cart API).
 *   4. If the variant matches the trigger options (default Black + M/Medium),
 *      add the configured "auto-add" product (Soft Winter Jacket) in the same
 *      request.
 *
 * Using a custom element means the component re-initialises automatically when
 * the section is re-rendered in the theme editor.
 */
(() => {
  if (customElements.get('gg-product-grid')) return;

  /** Option names rendered as colour buttons instead of a dropdown. */
  const COLOR_OPTION = /^colou?r$/i;

  /** Copy shown to shoppers. */
  const TEXT = {
    choose: (name) => `Choose your ${name.toLowerCase()}`,
    missing: (names) => `Please choose your ${names.join(' and ').toLowerCase()}.`,
    unavailable: 'This combination is sold out.',
    adding: 'Adding…',
    added: 'Added to cart.',
    viewCart: 'View cart',
    error: 'Something went wrong. Please try again.',
  };

  /** Lower-cased, trimmed comparison key. */
  const normalize = (value) => String(value).trim().toLowerCase();

  /** Swatch colours used in the Figma popups, keyed by option value. */
  const DESIGN_SWATCHES = {
    black: '#000000',
    white: '#ffffff',
    blue: '#0d499f',
    red: '#b20f36',
    grey: '#afafb7',
    gray: '#afafb7',
  };

  /**
   * Colour shown in the swatch bar of a colour button. Priority:
   *   1. the option value's native Shopify swatch colour (set in admin),
   *   2. the Figma palette above,
   *   3. the value itself when it is a valid CSS colour ("navy", "#123456"),
   *   4. a neutral grey.
   */
  const swatchColor = (value, nativeSwatch) => {
    if (nativeSwatch) return nativeSwatch;
    const key = normalize(value).replace(/\s+/g, '');
    if (DESIGN_SWATCHES[key]) return DESIGN_SWATCHES[key];
    return CSS.supports('color', key) ? key : '#c4c4c4';
  };

  /** Small DOM helper: el('button', { class: 'x', type: 'button' }, 'Label'). */
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === false || value == null) return;
      // setProperty() is required for CSS custom properties (--foo); Object.assign ignores them.
      if (key === 'style') Object.entries(value).forEach(([prop, val]) => node.style.setProperty(prop, val));
      else node.setAttribute(key, value === true ? '' : value);
    });
    node.append(...children);
    return node;
  };

  class GGProductGrid extends HTMLElement {
    connectedCallback() {
      this.dialog = this.querySelector('dialog');
      this.form = this.dialog.querySelector('form');
      this.ui = {
        image: this.dialog.querySelector('[data-gg-image]'),
        title: this.dialog.querySelector('[data-gg-title]'),
        price: this.dialog.querySelector('[data-gg-price]'),
        description: this.dialog.querySelector('[data-gg-description]'),
        options: this.dialog.querySelector('[data-gg-options]'),
        message: this.dialog.querySelector('[data-gg-message]'),
        submit: this.dialog.querySelector('[data-gg-submit]'),
      };

      // Auto-add rule configured in the section settings.
      this.autoAddVariantId = Number(this.dataset.autoAddVariant) || null;
      this.triggerColor = normalize(this.dataset.triggerColor || '');
      this.triggerSizes = (this.dataset.triggerSizes || '').split(',').map(normalize).filter(Boolean);

      // Event delegation keeps listeners to a handful regardless of block count.
      this.addEventListener('click', this.onClick);
      this.form.addEventListener('submit', this.onSubmit);
      this.dialog.addEventListener('close', this.onDialogClose);
      this.dialog.addEventListener('keydown', this.onDialogKeydown);
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.onClick);
    }

    /* ------------------------------------------------------------------ */
    /* Events                                                              */
    /* ------------------------------------------------------------------ */

    onClick = (event) => {
      const opener = event.target.closest('[data-gg-open]');
      if (opener) {
        const data = opener.parentElement.querySelector('[data-gg-product]');
        this.open(JSON.parse(data.textContent), opener);
        return;
      }

      if (event.target.closest('[data-gg-close]')) {
        this.dialog.close();
        return;
      }

      // A click on the ::backdrop targets the <dialog> element itself.
      if (event.target === this.dialog) {
        this.dialog.close();
        return;
      }

      // Close any open dropdown when clicking elsewhere inside the popup.
      if (!event.target.closest('.gg-select')) this.closeDropdowns();
    };

    onDialogKeydown = (event) => {
      // Escape closes an open dropdown first, the dialog second.
      if (event.key === 'Escape' && this.dialog.querySelector('.gg-select.is-open')) {
        event.preventDefault();
        this.closeDropdowns(true);
      }
    };

    onDialogClose = () => {
      document.documentElement.style.overflow = '';
      this.lastOpener?.focus();
    };

    onSubmit = async (event) => {
      event.preventDefault();

      const missing = this.product.options.filter((_, index) => this.selected[index] == null);
      if (missing.length) {
        this.showMessage(TEXT.missing(missing.map((option) => option.name)), true);
        return;
      }

      const variant = this.currentVariant();
      if (!variant || !variant.available) {
        this.showMessage(TEXT.unavailable, true);
        return;
      }

      const items = [{ id: variant.id, quantity: 1 }];
      if (this.shouldAutoAdd(variant)) items.push({ id: this.autoAddVariantId, quantity: 1 });

      this.setBusy(true);
      try {
        const response = await fetch(this.dataset.cartAddUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ items }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.description || result.message || TEXT.error);

        this.showMessage(`${TEXT.added} `);
        this.ui.message.append(el('a', { href: this.dataset.cartUrl }, TEXT.viewCart));
        document.dispatchEvent(new CustomEvent('gg:cart-updated', { detail: { items: result.items } }));
      } catch (error) {
        this.showMessage(error.message || TEXT.error, true);
      } finally {
        this.setBusy(false);
      }
    };

    /* ------------------------------------------------------------------ */
    /* Popup rendering                                                     */
    /* ------------------------------------------------------------------ */

    /**
     * Fills the popup with a product and opens it.
     * @param {object} product - JSON from snippets/gg-product-data.liquid
     * @param {HTMLElement} opener - Hotspot that opened it (focus returns here)
     */
    open(product, opener) {
      this.product = product;
      this.lastOpener = opener;
      // Pre-select options that only have one value; everything else is a choice.
      this.selected = product.options.map((option) => (option.values.length === 1 ? option.values[0] : null));

      const { image, title, price, description, options } = this.ui;
      image.hidden = !product.image;
      if (product.image) {
        image.src = product.image;
        image.alt = product.imageAlt;
      }
      title.textContent = product.title;
      price.textContent = product.price;
      description.textContent = product.description;

      // Colour first, then the remaining options (Figma order).
      const ordered = product.options
        .map((option, index) => ({ ...option, index }))
        .sort((a, b) => COLOR_OPTION.test(b.name) - COLOR_OPTION.test(a.name));
      options.replaceChildren(
        ...ordered.map((option) =>
          COLOR_OPTION.test(option.name) ? this.renderColorOption(option) : this.renderDropdown(option)
        )
      );

      this.showMessage('');
      this.updateVariant();
      document.documentElement.style.overflow = 'hidden';
      this.dialog.showModal();
    }

    /**
     * Colour option: button group with a swatch bar per value.
     * A single black indicator slides under the selected value (Figma prototype:
     * Smart Animate, 300ms ease-out) — positioned with CSS vars, animated in CSS.
     */
    renderColorOption({ name, values, swatches = [], index }) {
      const labelId = `gg-option-${index}-${Date.now()}`;
      const group = el('div', {
        class: 'gg-colors',
        role: 'radiogroup',
        'aria-labelledby': labelId,
        style: { '--gg-count': String(values.length) },
      });
      group.append(el('span', { class: 'gg-colors__indicator', 'aria-hidden': 'true' }));

      /**
       * Moves the indicator to the value at `position`. On the first pick the
       * position is applied before transitions are enabled, so the fill fades in
       * in place instead of sliding from the first value.
       */
      const moveIndicator = (position) => {
        group.style.setProperty('--gg-selected', String(position));
        if (!group.classList.contains('has-selection')) {
          void group.offsetWidth; // commit the position before enabling transitions
          group.classList.add('has-selection');
        }
      };
      const preselected = values.indexOf(this.selected[index]);
      if (preselected > -1) moveIndicator(preselected);

      values.forEach((value, position) => {
        const button = el(
          'button',
          {
            type: 'button',
            class: 'gg-colors__option',
            role: 'radio',
            'aria-checked': String(this.selected[index] === value),
            'data-value': value,
            style: { '--gg-swatch': swatchColor(value, swatches[position]) },
          },
          value
        );
        button.addEventListener('click', () => {
          this.selected[index] = value;
          group.querySelectorAll('[role="radio"]').forEach((radio) => {
            radio.setAttribute('aria-checked', String(radio === button));
          });
          moveIndicator(position);
          this.updateVariant();
        });
        group.append(button);
      });

      return el('div', { class: 'gg-option' }, el('p', { class: 'gg-option__label', id: labelId }, name), group);
    }

    /** Any other option: custom dropdown (button + listbox), keyboard accessible. */
    renderDropdown({ name, values, index }) {
      const id = `gg-select-${index}-${Date.now()}`;
      const placeholder = TEXT.choose(name);
      const current = el('span', { class: 'gg-select__value' }, this.selected[index] ?? placeholder);
      const toggle = el(
        'button',
        {
          type: 'button',
          class: 'gg-select__toggle',
          'aria-haspopup': 'listbox',
          'aria-expanded': 'false',
          'aria-controls': `${id}-list`,
          'aria-labelledby': `${id}-label ${id}-toggle`,
          id: `${id}-toggle`,
        },
        current,
        el('span', { class: 'gg-select__icon', 'aria-hidden': 'true' })
      );
      // Re-use the chevron SVG already rendered by Liquid inside the template.
      toggle.lastChild.innerHTML = this.chevronMarkup();

      const list = el('ul', { class: 'gg-select__list', role: 'listbox', id: `${id}-list`, tabindex: '-1' });
      const options = values.map((value) =>
        el('li', { class: 'gg-select__option', role: 'option', 'aria-selected': String(this.selected[index] === value), tabindex: '-1', 'data-value': value }, value)
      );
      list.append(...options);

      const wrapper = el('div', { class: 'gg-select' }, toggle, list);

      const setOpen = (open) => {
        wrapper.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        if (open) (list.querySelector('[aria-selected="true"]') || options[0]).focus();
      };

      const choose = (option) => {
        this.selected[index] = option.dataset.value;
        current.textContent = option.dataset.value;
        options.forEach((item) => item.setAttribute('aria-selected', String(item === option)));
        setOpen(false);
        toggle.focus();
        this.updateVariant();
      };

      toggle.addEventListener('click', () => {
        const willOpen = !wrapper.classList.contains('is-open');
        this.closeDropdowns();
        setOpen(willOpen);
      });
      toggle.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setOpen(true);
        }
      });
      list.addEventListener('click', (event) => {
        const option = event.target.closest('[role="option"]');
        if (option) choose(option);
      });
      list.addEventListener('keydown', (event) => {
        const position = options.indexOf(document.activeElement);
        if (event.key === 'ArrowDown') options[Math.min(position + 1, options.length - 1)].focus();
        else if (event.key === 'ArrowUp') options[Math.max(position - 1, 0)].focus();
        else if (event.key === 'Enter' || event.key === ' ') {
          if (position > -1) choose(options[position]);
        } else if (event.key === 'Tab') setOpen(false);
        else return;
        event.preventDefault();
      });

      return el('div', { class: 'gg-option' }, el('p', { class: 'gg-option__label', id: `${id}-label` }, name), wrapper);
    }

    /** Chevron SVG markup, cached from the hidden template inside the section. */
    chevronMarkup() {
      this.chevron ??= this.querySelector('template[data-gg-chevron]')?.innerHTML ?? '';
      return this.chevron;
    }

    /** Closes every open dropdown; optionally returns focus to its toggle. */
    closeDropdowns(returnFocus = false) {
      this.dialog.querySelectorAll('.gg-select.is-open').forEach((select) => {
        select.classList.remove('is-open');
        const toggle = select.querySelector('.gg-select__toggle');
        toggle.setAttribute('aria-expanded', 'false');
        if (returnFocus) toggle.focus();
      });
    }

    /* ------------------------------------------------------------------ */
    /* Variant + cart logic                                                */
    /* ------------------------------------------------------------------ */

    /** Variant matching every selected option, or undefined. */
    currentVariant() {
      return this.product.variants.find((variant) =>
        variant.options.every((value, index) => value === this.selected[index])
      );
    }

    /** Syncs price and button state with the current selection. */
    updateVariant() {
      const variant = this.currentVariant();
      this.ui.price.textContent = variant ? variant.price : this.product.price;
      const soldOut = Boolean(variant && !variant.available);
      this.ui.submit.disabled = soldOut;
      this.showMessage(soldOut ? TEXT.unavailable : '', soldOut);
    }

    /**
     * True when the added variant has the trigger colour AND one of the trigger
     * sizes (e.g. Black + M). Values are compared case-insensitively.
     */
    shouldAutoAdd(variant) {
      if (!this.autoAddVariantId || variant.id === this.autoAddVariantId) return false;
      const values = variant.options.map(normalize);
      return values.includes(this.triggerColor) && values.some((value) => this.triggerSizes.includes(value));
    }

    setBusy(busy) {
      this.ui.submit.disabled = busy;
      this.ui.submit.setAttribute('aria-busy', String(busy));
      if (busy) this.showMessage(TEXT.adding);
    }

    showMessage(text, isError = false) {
      this.ui.message.textContent = text;
      this.ui.message.classList.toggle('is-error', isError);
    }
  }

  customElements.define('gg-product-grid', GGProductGrid);
})();
