class JOptGroup extends HTMLElement {
	static #template = document.createElement("template");
	static #sheet = new CSSStyleSheet();
	static {
		this.#template.innerHTML = "<div part=\"label\"></div><slot></slot>";
		this.#sheet.replaceSync(":host { display: block }");
	}

	#internals;
	#label;

	constructor() {
		super();
		this.#internals = this.attachInternals();
		this.#internals.role = "group";

		this.attachShadow({mode: 'open'}).appendChild(JOptGroup.#template.content.cloneNode(true));
		this.shadowRoot.adoptedStyleSheets.push(JOptGroup.#sheet);

		this.#label = this.shadowRoot.querySelector("[part=\"label\"]");
	}

	connectedCallback() {
		if (!this.isConnected) {
			return;
		}

		const label = this.getAttribute("label");
		if (label !== null) {
			this.#label.textContent = label;
		}
	}
}

customElements.define("j-optgroup", JOptGroup);

class JOption extends HTMLElement {
	static observedAttributes = ["disabled"];

	static #template = document.createElement("template");
	static #sheet = new CSSStyleSheet();
	static {
		this.#template.innerHTML = "<slot></slot>";
		this.#sheet.replaceSync(":host { display: block }");
	}

	get active() {
		return this.classList.contains("active")
	}

	set active(v) {
		this.classList.toggle("active", v);
	}

	#internals;
	#optGroup;

	get value() {
		return this.getAttribute("value");
	}

	set value(v) {
		this.setAttribute("value", v);
	}

	get selected() {
		return this.hasAttribute("selected");
	}

	set selected(v) {
		this.toggleAttribute("selected", !!v);
	}

	get optGroup() {
		return this.#optGroup;
	}

	get disabled() {
		return this.hasAttribute("disabled");
	}

	set disabled(v) {
		this.toggleAttribute("disabled", !!v);
	}

	constructor() {
		super();
		this.#internals = this.attachInternals();
		this.#internals.role = "option";
		this.attachShadow({mode: 'open'}).appendChild(JOption.#template.content.cloneNode(true));

		this.shadowRoot.adoptedStyleSheets.push(JOption.#sheet);
	}

	connectedCallback() {
		if (!this.isConnected) {
			return;
		}

		if (this.parentElement instanceof JOptGroup) {
			this.#optGroup = this.parentElement;
		}
	}

	disconnectedCallback() {
		if (this.isConnected) {
			return;
		}

		if (!this.parentElement) {
			this.#optGroup = null;
		}
	}

	attributeChangedCallback(name, oldValue, newValue) {
		if (name === "disabled") {
			const d = newValue !== null;
			if (d) {
				this.#internals.states.add("disabled");
			} else {
				this.#internals.states.delete("disabled");
			}
		}
	}
}

customElements.define("j-option", JOption);

class JSelect extends HTMLElement {
	static formAssociated = true;
	static observedAttributes = ["value", "value-json", "url", "required", "multiple", "no-clear", "msg-too-short", "msg-no-match", "placeholder", "fetch-url-params-fn", "no-search", "disabled", "name"];

	static counter = 0;

	static #tmpl = document.createElement("template");
	static #itemTmpl = document.createElement("template");
	static #itemRemoveTmpl = document.createElement("template");

	static {
		this.#tmpl.innerHTML =
			"<div part=\"container\">" +
				"<div part=\"spacer\"></div>" +
				"<div part=\"placeholder\"></div>" +
				"<div part=\"disabled-indicator\"></div>" +
				"<div part=\"dropdown-indicator\"></div>" +
				"<div part=\"item-container\"></div>" +
				"<div part=\"clear\" role=\"button\">&#10006;</div>" +
				"<div part=\"overlay-container\">" +
					"<div part=\"dropdown-container\" popover=\"manual\">" +
						"<div part=\"input-container\"><input type=\"text\" part=\"input\" role=\"combobox\" aria-controls=\"listbox\" aria-autocomplete=\"list\" aria-expanded=\"false\"></div>" +
						"<div part=\"msg-container\"></div>" +
						"<div part=\"loading-indicator\">&#8203;</div>" +
						// tabindex="1" = WORKAROUND for Chrome >= 133 bug: https://issues.chromium.org/issues/400317114?pli=1
						"<div part=\"option-container\" role=\"listbox\" id=\"listbox\" tabindex=\"-1\"><slot></slot></div>" +
					"</div>" +
				"</div>" +
			"</div>";

		this.#itemTmpl.innerHTML =
			"<span part=\"item\"></span>";

		this.#itemRemoveTmpl.innerHTML = "<span part=\"item-remove\" role=\"button\">&#10006;</span>"; // may not be a button, otherwise delegatesFocus will focus first "item-remove" on JSelect focus
	}


	static #sheet = new CSSStyleSheet();
	static {
		let ruleStr =
			"* {box-sizing:border-box} " +
			// user-select:none = WORKAROUND for Chrome >= 133 bug: https://issues.chromium.org/issues/400317114?pli=1
			":host { display: inline-block;user-select:none }" +
			"[part=container] { display: grid; grid-template-columns: 1fr min-content; grid-template-rows: 1fr }" +
			"[part=spacer] { grid-column-start:1;grid-row-start:1;visibility:hidden;height:0px;overflow-y:hidden;white-space:pre }" +
			"[part=placeholder] { grid-column-start:1;grid-row-start:1 }" +
			":host(:not(:state(placeholder))) [part=placeholder] { visibility:hidden }" +
			"[part=dropdown-indicator],[part=disabled-indicator] { grid-column-start:2;grid-row-start:1;justify-self:end }" +
			":host(:state(disabled)) :is([part=dropdown-indicator],[part=clear]) { display:none }" +
			":host(:state(disabled)) [part=container] { pointer-events:none }" +
			"[part=item-container] { width:100%; height:100%;grid-column-start:1;grid-row-start:1;display:flex;flex-wrap:wrap }" +
			":host(:state(clearable)) [part=clear] { grid-column-start:1;grid-row-start:1;justify-self:end }" +
			":host(:not(:state(clearable))) [part=clear] { display:none }" +
			":host(:not(:state(disabled))) [part=disabled-indicator] { display:none }" +
			"[part=overlay-container] { position:relative;z-index:10;height:0;overflow:visible;grid-column:1 / 3;grid-row-start:2 }" +
			"[part=dropdown-container] { display:flex;flex-direction:column;background-color:white;inset:unset;border:0 }" +  // TODO: use css anchor positioning when available
			":host(:state(drop-down-top)) [part=input-container] { order: 1 }" +
			"[part=dropdown-container]:not(:popover-open) { opacity:0;pointer-events:none;width:0;max-width:0;height:0;max-height:0;overflow:hidden }" +
			":host(:not(:state(loading))) [part=loading-indicator] {" +
				"display:none" +
			"}" +
			":host(:state(loading)) [part=loading-indicator] {" +
				"background: linear-gradient(-90deg, #efefef 0%, #fcfcfc 50%, #efefef 100%);" +
				"background-size: 400% 400%;" +
				"animation: pulse 1.2s ease-in-out infinite" +
			"}" +
			"@keyframes pulse {" +
				"0% { background-position: 0% 0% }" +
				"100% { background-position: -135% 0% }" +
			"}" +
			"@keyframes pulseInput {" +
				"0% { transform: translateX(-20%) rotate(0deg) translateX(20%) rotate(0deg) }" +
				"100% { transform: translateX(-20%) rotate(360deg) translateX(20%) rotate(-360deg) }" +
			"}" +
			"[part=option-container] { width: 100%; position: relative }" +
			"[part=input] { width:100% }" +
			":host(:state(no-search)) [part=input-container] { opacity:0;height:0;width:0;overflow:hidden }" +
			":host(:state(loading)) [part=input-container]::after { animation: pulseInput 1.2s ease-in-out infinite }" +
			":host(:not(:state(msg))) [part=msg-container] { display:none }";


		this.#sheet.replaceSync(ruleStr);
	}

	static #defaultMsgRequired;
	static {
		const inp = document.createElement("input");
		inp.required = true;
		inp.checkValidity();
		this.#defaultMsgRequired = inp.validationMessage;
	}

	static #defaultMsgTooShort = (min) => `Enter at least ${min} characters`;
	static #defaultMsgNoMatch = "No matches found.";

	static #defaultSearchTermParam = "term";

	#internals;

	/** @type {string} */
	#url;
	/**
	 * Currently loaded option elements ; ordered, live node list
	 * @type {HTMLCollectionOf<Element>}
	 */
	#options;

	#activeOption;
	#selectedOptions=[];

	#slot;

	#mutationObserver;
	#boundOnMutation;

	#resizeObserver;
	#boundOnItemContainerResize;

	#listensToWindowResize;
	#boundOnWindowResize;

	#value;

	#fetchUrlParamsFn;

	#keepSingleSelectOption = true;
	#blurMultiAfterSelect = true;

	// can be used to set value from outside
	set value(v) {
		if (v !== undefined && v !== null && typeof v !== "string" && !Array.isArray(v) && !(v instanceof FormData)) {
			v = "" + v;

			if (v === "[object Object]") {
				throw new Error("value set using object");
			}
		}

		const oldValue = this.#value;
		let newValue;

		if (this.#isMultiple) {
			if (v instanceof FormData) {
				newValue = v.getAll(this.name);
			} else {
				newValue = v ? (Array.isArray(v) ? v : (v?.length ? [v] : null)) : null;
			}
		} else {
			if (v instanceof FormData) {
				newValue = v.get(this.name);
			} else {
				newValue = v ? (Array.isArray(v) ? (v.length ? v[0] : null) : (v?.length ? v : null)) : null;
			}
		}
		if (oldValue === newValue) {
			return;
		}

		if (this.#isMultiple) {
			const valueToSet = newValue || [];
			for (const opt of [...this.#selectedOptions]) {
				const valIdx = valueToSet.indexOf(opt.value);
				if (valIdx >= 0) {
					valueToSet.splice(valIdx, 1);
				} else {
					this.#unselectOption(opt);
				}
			}

			if (valueToSet.length) {
				for (const val of valueToSet) {
					const options = this.#findOptions(val);
					if (options.length) {
						this.#selectOption(options[0]);
					}
				}
			}
		} else {
			if (newValue !== null && newValue !== undefined && newValue !== "") {
				const options = this.#findOptions(newValue);

				if (options.length) {
					this.#selectOption(options[0]);
				} else {
					this.#value = newValue;
				}
			} else {
				this.#clear();
			}
		}

		this.#updateFormValue();
	}

	get value() {
		return this.#value;
	}

	set name(v) {
		this.setAttribute("name", v);
	}

	get name() {
		return this.getAttribute("name");
	}

	set multiple(v) {
		this.toggleAttribute("multiple", !!v);
	}

	get multiple() {
		return this.hasAttribute("multiple");
	}

	set url(v) {
		if (v === undefined || v=== null) {
			this.removeAttribute("url");
		} else {
			this.setAttribute("url", v);
		}
	}

	get url() {
		return this.getAttribute("url");
	}

	get form() {
		return this.#internals.form;
	}

	get selectedOptions() {
		return [...this.#selectedOptions];
	}

	get selectedOption() {
		return this.#selectedOptions?.length > 0 ? this.#selectedOptions[0] : null;
	}

	set disabled(v) {
		this.toggleAttribute("disabled", !!v);
	}

	get disabled() {
		return this.hasAttribute("disabled");
	}

	set keepSingleSelectOption(v) {
		this.#keepSingleSelectOption = !!v;
	}

	get keepSingleSelectOption() {
		return this.#keepSingleSelectOption;
	}

	set blurMultiAfterSelect(v) {
		this.#blurMultiAfterSelect = !!v;
	}

	get blurMultiAfterSelect() {
		return this.#blurMultiAfterSelect;
	}

	#required;
	#noSearch;
	#disabled;

	#input;

	#container;

	#itemContainer;
	#overlayContainer;
	#dropdownContainer;
	#inputContainer;
	#msgContainer;
	#optionContainer;

	#boundOnFocusIn;
	#boundOnFocusOut;

	#boundOnPaste;
	#boundOnInput;

	#boundOnOptionContainerMouseOver;
	#boundOnInputKeyDown;

	#boundOnContainerMouseDown;
	#boundOnContainerMouseUp;
	#boundOnContainerClick;
	#boundOnOptionContainerClick;

	#listenersEnabled = false;

	#isMultiple = false;
	#noClear = false;

	#idPrefix = "j-select-" + JSelect.counter + "-";
	#optionCounter = 0;

	#placeholderContainer;
	#loadingIndicator;

	#spacer;
	#addedTextChangedTask;

	#placeholder;

	#msgNoMatch;
	#msgTooShort;
	#msgRequired;

	#searchRemoteTimeout;
	#searchRemoteAbortController;
	#searchTermParam;

	// may be changed from outside
	minRemoteSearchLength = 3;
	searchRemoteDebounce = 300;

	constructor() {
		super();
		this.#internals = this.attachInternals();

		this.attachShadow({ mode: "open", delegatesFocus: true });
		this.shadowRoot.appendChild(JSelect.#tmpl.content.cloneNode(true));
		this.shadowRoot.adoptedStyleSheets.push(JSelect.#sheet);

		this.#slot = this.shadowRoot.querySelector("slot");

		this.#input = this.shadowRoot.querySelector("[part=\"input\"]");

		this.#container = this.shadowRoot.querySelector("[part=\"container\"]");

		this.#itemContainer = this.shadowRoot.querySelector("[part=\"item-container\"]");
		this.#overlayContainer = this.shadowRoot.querySelector("[part=\"overlay-container\"]");
		this.#dropdownContainer = this.shadowRoot.querySelector("[part=\"dropdown-container\"]");
		this.#inputContainer = this.shadowRoot.querySelector("[part=\"input-container\"]");
		this.#msgContainer = this.shadowRoot.querySelector("[part=\"msg-container\"]");
		this.#optionContainer = this.shadowRoot.querySelector("[part=\"option-container\"]");

		this.#spacer = this.shadowRoot.querySelector("[part=\"spacer\"]");
		this.#placeholderContainer = this.shadowRoot.querySelector("[part=\"placeholder\"]");

		this.#loadingIndicator = this.shadowRoot.querySelector("[part=\"loading-indicator\"]");

		this.#boundOnFocusIn = this.#onFocusIn.bind(this);
		this.#boundOnFocusOut = this.#onFocusOut.bind(this);
		this.#boundOnPaste = this.#onPaste.bind(this);
		this.#boundOnInput = this.#onInput.bind(this);
		this.#boundOnContainerMouseDown = this.#onContainerMouseDown.bind(this);
		this.#boundOnContainerMouseUp = this.#onContainerMouseUp.bind(this);
		this.#boundOnContainerClick = this.#onContainerClick.bind(this);
		this.#boundOnOptionContainerClick = this.#onOptionContainerClick.bind(this);
		this.#boundOnOptionContainerMouseOver = this.#onOptionContainerMouseOver.bind(this);
		this.#boundOnInputKeyDown = this.#onInputKeyDown.bind(this);

		this.#boundOnMutation = this.#onMutation.bind(this);

		this.#boundOnItemContainerResize = this.#onItemContainerResize.bind(this);
		this.#boundOnWindowResize = this.#onWindowResize.bind(this);

		// live NodeList, so it's okay to do this in the constructor
		this.#options = this.getElementsByTagName("j-option");
	}

	#updateListener(enable) {
		if (enable === this.#listenersEnabled) {
			return;
		}

		const fn = enable ? "addEventListener" : "removeEventListener";

		this.#container[fn]("focusin", this.#boundOnFocusIn);
		this.#container[fn]("focusout", this.#boundOnFocusOut);
		this.#input[fn]("paste", this.#boundOnPaste);
		this.#input[fn]("input", this.#boundOnInput);
		this.#container[fn]("mousedown", this.#boundOnContainerMouseDown);
		this.#container[fn]("mouseup", this.#boundOnContainerMouseUp);
		this.#container[fn]("click", this.#boundOnContainerClick);
		this.#optionContainer[fn]("click", this.#boundOnOptionContainerClick);
		this.#optionContainer[fn]("mouseover", this.#boundOnOptionContainerMouseOver);
		this.#input[fn]("keydown", this.#boundOnInputKeyDown)

		this.#listenersEnabled = enable;
	}

	/**
	 * This will fire when the opening tag is parsed, so no children are guaranteed to be there at this point.
	 */
	connectedCallback() {
		if (!this.isConnected) { // see: https://html.spec.whatwg.org/multipage/custom-elements.html#custom-element-conformance
			return;
		}

		this.#updateChildren();

		// need a MutationObserver because JOption elements below JOptGroup elements won't trigger slotChange events
		if (!this.#mutationObserver) {
			this.#mutationObserver = new MutationObserver(this.#boundOnMutation);
			this.#attachMutationObserver();
		}

		if (!this.#resizeObserver) {
			this.#resizeObserver = new ResizeObserver(this.#boundOnItemContainerResize);
			this.#attachResizeObserver();
		}

		if (!this.#listensToWindowResize) {
			this.#checkWindowResizeObserver();
		}

		const isDisabled = this.getAttribute("disabled") !== null;

		if (isDisabled === this.#listenersEnabled) {
			this.#updateListener(!isDisabled);
		}

		if (document.activeElement && (document.activeElement === this || this.contains(document.activeElement))) {
			this.#onFocusIn();
		}
	}

	#onItemContainerResize() {
		this.#positionDropdownContainer();
	}

	#needsSelection() {
		return !this.#isMultiple && !this.#placeholder && !this.#value && !this.#itemContainer.children.length;
	}

	/**
	 * @param {MutationRecord[]} mutations
	 */
	#onMutation(mutations) {
		let valueChanged = false;
		let textChanged = false;

		for(const mut of mutations) {
			// handle remove first - could happen together with add when using replaceChildren

			for(const removed of mut.removedNodes) {
				if (removed instanceof JOption) {
					const val = removed.value;
					if (val !== null && val !== undefined) {
						const item = this.#findItem(val);
						if (item) {
							this.#removeItem(item);
						}
					}

					this.#unselectOption(removed);
					textChanged = true;
				} else if (removed instanceof JOptGroup) {
					// TODO: remove selected items, which are children of the optgroup, if there are any
				} else if (removed instanceof Text) {
					// TODO: someone might have removed the text of a selected option
					textChanged = true;
				} else {
					throw new Error("Unsupported element removed: " + (typeof removed) + " ; with HTML: " + removed.outerHTML);
				}
			}

			for(const added of mut.addedNodes) {
				if (added instanceof JOption) {
					this.#addIdToOption(added);
					if (added.selected || this.#needsSelection()) {
						this.#selectOption(added);
						valueChanged = true;
					}

					if (!added.selected && added.parentElement instanceof JOptGroup && added.parentElement.hidden) {
						added.parentElement.hidden = false;
					}

					textChanged = true;
				} else if (added instanceof JOptGroup) {
					// nothing to do
				} else if (added instanceof Text) {
					// someone might have added text to a selected option
					const p = added.parentElement;
					if (p === this) { // ignore text nodes directly added to this element
						continue;
					}

					if (p instanceof JOption && p.selected) {
						const item = this.#findItem(p.value);
						if (item) { // might not have been added yet
							let textNode = item.lastChild;
							if (textNode instanceof Text) {
								textNode.nodeValue = p.textContent;
							} else {
								textNode = document.createTextNode(p.textContent);
								item.appendChild(textNode);
							}
						}
					}

					textChanged = true;
				} else {
					throw new Error("Unsupported element added: " + (typeof added) + " ; with HTML: " + added.outerHTML);
				}
			}
		}

		if (valueChanged) {
			this.#updateFormValue();
		}

		if (textChanged && !this.#url && !this.#addedTextChangedTask) {
			this.#addedTextChangedTask = true;
			setTimeout(() => this.#onTextChanged(), 0);
		}
	}

	#onTextChanged() {
		this.#addedTextChangedTask = false;

		this.#updateSpacer();
	}

	#updateSpacer() {
		this.#spacer.textContent = [...this.#options].map(o => o.textContent.trim()).join("\n");
	}

	// should never be manually called when mutation observer is active and already handles option changes
	#availableOptionsChanged() {
		// TODO: handle adding options that are already selected due to value being set !!!
		// TODO: what to do when options we have selected are removed?
		for(const option of this.#options) {
			this.#addIdToOption(option);
		}

		// TODO: handle options with selected set
	}

	// not needed anymore when ariaActiveDescendantElement is implemented by browsers
	#addIdToOption(o) {
		if (o.id) return;
		o.id = this.#idPrefix + this.#optionCounter;
		this.#optionCounter++;
	}

	#updateChildren() {
		this.#availableOptionsChanged();

		// TODO: what to do when options are added one after another and multiple are selected?
		if (this.#value === undefined) {
			if (this.#isMultiple) {
				this.#value = [];
			}

			const attributeValue = this.getAttribute("value");
			if (attributeValue !== null) {
				this.setSelectedItem({ [attributeValue] : null });
			}

			if (this.#options.length !== 0) {
				if (this.#isMultiple) {

					for (const opt of this.#options) {
						if (opt.selected) {
							this.#selectOption(opt);
						}
					}
				} else {
					let selectedOption;

					for (const opt of this.#options) {
						if (opt.selected) {
							selectedOption = opt;
							break;
						}
					}

					if (selectedOption !== undefined) {
						this.#selectOption(selectedOption);
					} else if (!this.#placeholder) { // in case there is no placeholder, force selection of first element
						this.#selectOption(this.#options.item(0));
					}
				}
			}

			this.#updateFormValue();
		}

		this.#updateSpacer();
	}

	/**
	 * called each time the element is removed from the document.
	 */
	disconnectedCallback() {
		this.#detachMutationObserver();
		this.#detachResizeObserver();
	}

	#updateAfterCanRemoveChange(canRemove) {
		if (this.#isMultiple) {
			for (const item of this.#itemContainer.children) {
				if (item.dataset.removable) {
					if (canRemove) continue;
					item.firstChild.remove();
					delete item.dataset.removable;
				} else {
					if (!canRemove) continue;
					this.#addRemove(item);
				}
			}
		} else if (canRemove && this.#itemContainer.children.length) {
			this.#addState("clearable");
		} else {
			this.#deleteState("clearable");
		}
	}

	#updateAfterMultipleChange(canRemove) {
		if (this.#isMultiple) {
			this.#deleteState("clearable");
		} else {
			// TODO: reduce selected items to 1
			for (const item of this.#itemContainer.children) {
				if (item.dataset.removable) {
					item.firstChild.remove();
					delete item.dataset.removable;
				}
			}

			if (canRemove && this.#itemContainer.children.length) {
				this.#addState("clearable");
			}
		}
	}

	/**
	 * This will fire with initial values, even before connectedCallback
	 */
	attributeChangedCallback(name, oldValue, newValue) {
		switch(name) {
			case "value":
				this.setSelectedItem({ [newValue] : null });
				break;
			case "value-json":
				const t = newValue?.trim();
				if (t.length > 0 && this.#url !== undefined) {
					// handle initial value, which might be provided as json text node
					this.setValueFromJSON(t);
					// TODO: while value might be set, we can still make sure the set json options are included in this.#options
				}
				break;
			case "multiple": {
				const oldCanRemove = this.#canRemove();
				const oldIsMultiple = this.#isMultiple;
				this.#isMultiple = newValue !== null;
				this.#optionContainer.setAttribute("aria-multiselectable", this.#isMultiple ? "true" : "false");
				if (this.#value) {
					if (this.#isMultiple && !Array.isArray(this.#value)) {
						this.#value = [this.#value];
					} else if (!this.#isMultiple && Array.isArray(this.#value) && this.#value.length) {
						this.#value = this.#value[0];
					}
				}
				const newCanRemove = this.#canRemove();
				if (oldCanRemove !== newCanRemove) {
					this.#updateAfterCanRemoveChange(newCanRemove);
				} else if (oldIsMultiple !== this.#isMultiple) {
					this.#updateAfterMultipleChange(newCanRemove);
				}
				break;
			}
			case "no-clear":
				this.#noClear = newValue !== null;
				// TODO: update already rendered items
				break;
			case "msg-no-match":
				this.#msgNoMatch = newValue;
				// TODO: update already displayed message
				break;
			case "msg-too-short":
				this.#msgTooShort = newValue;
				// TODO: update already displayed message
				break;
			case "placeholder": {
				const oldCanRemove = this.#canRemove();
				if (newValue === undefined || newValue === null || newValue.trim() === '') {
					this.#placeholderContainer.innerHTML = "";
					this.#placeholder = null;
				} else {
					this.#placeholderContainer.textContent = newValue;
					this.#placeholder = newValue;
					this.#checkPlaceholder();
				}
				const newCanRemove = this.#canRemove();
				if (oldCanRemove !== newCanRemove) {
					this.#updateAfterCanRemoveChange(newCanRemove);
				}
				break;
			}
			case "required":
				this.#required = newValue !== null;
				this.#checkValidity();
				break;
			case "msg-required":
				this.#msgRequired = newValue;
				// TODO: update already displayed message
				break;
			case "url":
				this.#url = newValue;
				this.#clear();
				break;
			case "fetch-url-params-fn":
				this.#fetchUrlParamsFn = newValue;
				break;
			case "no-search":
				this.#noSearch = newValue !== null;
				this.#checkSearchVisibility();
				break;
			case "disabled":
				const d = newValue !== null;
				this.#disabled = d;
				this.#updateDisabledState();
				break;
			case "name":
				this.#updateFormValue();
				break;
		}
	}

	formAssociatedCallback(form) {
	}

	formResetCallback() {
		this.#clear();
		this.#updateFormValue();
	}

	/**
	 * Called when the disabled state of the element changes.
	 * @param {boolean} isDisabled
	 */
	formDisabledCallback(isDisabled) {
		this.#disabled = isDisabled;
		this.#updateDisabledState();
	}

	/**
	 * Called when the browser is trying to restore element’s state to state in which case reason is “restore”,
	 * or when the browser is trying to fulfill autofill on behalf of user in which case reason is “autocomplete”.
	 * In the case of “restore”, state is a string, File, or FormData object previously set as the second argument to setFormValue.
	 *
	 * @param state
	 * @param reason
	 *
	 * Note: This seems to be called correctly in chrome, but not in FF 128 esr, so we're not using it.
	 */
	formStateRestoreCallback(state, reason) {

	}


	/**
	 * Called when this element gets focus
	 */
	#onFocusIn(e) {
		this.#ensureOpenOptionContainer();
		this.#positionDropdownContainer();

		this.#optionContainer.scrollTo({ top: 0, left: 0, behavior: "instant" });
		this.#dropdownContainer.showPopover();

		this.#checkPosition(this.#overlayContainer.getBoundingClientRect());

		this.#input.ariaExpanded = "true";

		if (!this.#isMultiple && this.#keepSingleSelectOption && this.#selectedOptions[0]) {
			this.#setActive(this.#selectedOptions[0]);
		} else {
			this.#setFirstActive();
		}

		this.#addState("open");
		this.#checkWindowResizeObserver();
	}

	#positionDropdownContainer() {
		const rect = this.#overlayContainer.getBoundingClientRect();
		this.#dropdownContainer.style.width = rect.width + "px";
		this.#checkPosition(rect);
	}

	#onWindowResize() {
		const rect = this.#overlayContainer.getBoundingClientRect();
		this.#checkPosition(rect);
	}

	#checkPosition(rect) {
		const dropDownRect = this.#dropdownContainer.getBoundingClientRect();
		const positionTop = (rect.top + dropDownRect.height) > window.innerHeight;

		let top;
		if (positionTop) {
			const elementRect = this.getBoundingClientRect();
			top = elementRect.top - dropDownRect.height;
			this.#addState("drop-down-top");
		} else {
			top = rect.top;
			this.#deleteState("drop-down-top");
		}

		let left = rect.left;

		if (positionTop) {
			this.#dropdownContainer.style.top = null;
			this.#dropdownContainer.style.bottom = (window.innerHeight - (top + dropDownRect.height)) + "px";
		} else {
			this.#dropdownContainer.style.bottom = null;
			this.#dropdownContainer.style.top = top + "px";
		}
		this.#dropdownContainer.style.left = left + "px";
	}

	#closeSingleAfterSelect(skipBlur) {
		if (!skipBlur) {
			this.blur();
		}
	}

	#closeMultiAfterSelect() {
		this.#removeActive();
		this.#input.value = '';

		if (this.#url) {
			this.#clearOptionContainer();
		} else {
			this.#matchLocalMultiple(this.#options);
		}
	}

	#ensureOpenOptionContainer() {
		this.#optionContainer.hidden = false;
	}

	#closeDropdownContainer() {
		this.#dropdownContainer.hidePopover();
		this.#input.ariaExpanded = "false";

		this.#removeActive();

		this.#deleteState("open");
		this.#checkWindowResizeObserver();

		this.#abortSearch();
		this.#deleteStateLoading();

		this.#input.value = "";

		if (this.#url) {
			// FIXME: setTimeout is needed to wait for any initially selected options triggering
			//  mutation for their text content to update selected item text ; need to get rid of the setTimeout call
			setTimeout(() => this.#clearOptionContainer(), 0);
		} else {
			this.#matchLocalMultiple(this.#options);
		}
	}

	/**
	 * Called when this element loses focus
	 */
	#onFocusOut(e) {
		this.#closeDropdownContainer();
	}

	#matchLocalMultiple(options) {
		const val = this.#removeDiacritics(this.#input.value).toLowerCase();

		// prevent slot change events due to our changes
		this.#detachMutationObserver();

		// Note: this could be improved for the case when val.startsWith the previous val
		// in that case we could skip hidden options
		for(const it of options) {
			const t = it.textContent;
			if (val.length === 0) { // reset
				it.textContent = t;
			} else {
				const foundPos = this.#removeDiacritics(t).toLowerCase().indexOf(val);

				if (foundPos >= 0) {
					const frag = new DocumentFragment();
					if (foundPos > 0) {
						frag.appendChild(document.createTextNode(t.substring(0, foundPos)));
					}
					const s = document.createElement("mark");
					s.textContent = t.substring(foundPos, foundPos + val.length);
					frag.appendChild(s);
					const end = foundPos + val.length;
					if (end < t.length) {
						frag.appendChild(document.createTextNode(t.substring(end)));
					}
					it.replaceChildren(frag);
				} else {
					if (!it.hidden) {
						it.hidden = true;
						const optGroup = it.optGroup;
						if (optGroup) {
							if (!Array.from(optGroup.children).filter(c => !c.hidden).length) {
								optGroup.hidden = true;
							}
						}


					}

					continue;
				}
			}

			if (it.hidden && !it.selected) {
				it.hidden = false;
				if (it.optGroup?.hidden) {
					it.optGroup.hidden = false;
				}
			}
		}

		this.#setFirstActive();

		if (val?.length) {
			this.#checkNoMatch();
		} else {
			this.#hideMessage();
		}

		// re-add listener
		this.#attachMutationObserver();
	}

	#searchLocal() {
		this.#matchLocalMultiple(this.#options)
	}

	#attachMutationObserver() {
		if (this.#mutationObserver) {
			this.#mutationObserver.observe(this, {childList: true, subtree: true});
		}
	}

	#detachMutationObserver() {
		if (this.#mutationObserver) {
			this.#mutationObserver.disconnect();
		}
	}

	#attachResizeObserver() {
		if (this.#resizeObserver) {
			this.#resizeObserver.observe(this.#itemContainer);
		}
	}

	#detachResizeObserver() {
		if (this.#resizeObserver) {
			this.#resizeObserver.disconnect();
		}
	}

	isOpen() {
		return this.#internals.states.has("open");
	}

	#checkWindowResizeObserver() {
		if (!this.#listensToWindowResize && this.isConnected && this.isOpen()) {
			window.addEventListener("resize", this.#boundOnWindowResize);
			this.#listensToWindowResize = true;
		} else if (this.#listensToWindowResize && (!this.isConnected || !this.isOpen())) {
			window.removeEventListener("resize", this.#boundOnWindowResize);
			this.#listensToWindowResize = false;
		}
	}

	#clearOptionContainer() {
		this.#detachMutationObserver();
		this.textContent = "";
		this.#attachMutationObserver();
	}

	#searchRemote() {
		this.#clearOptionContainer();

		const searchStr = this.#input.value.trim();

		if (this.minRemoteSearchLength && searchStr.length < this.minRemoteSearchLength) {
			let msg = this.#msgTooShort || JSelect.#defaultMsgTooShort;
			if (msg instanceof Function) {
				msg = msg(this.minRemoteSearchLength);
			}

			this.#showMessage(msg);
			return;
		}

		this.#hideMessage();

		this.#addStateLoading();
		this.#abortSearch();

		this.fetchFn(this.#url, searchStr)
			.then(ret => ret.json())
			.then(obj => this.#handleFetchObject(obj))
			.catch(reason => this.#handleFetchReject(reason));
	}

	#abortSearch() {
		if (this.#searchRemoteAbortController) {
			// abort previous fetch if new search comes in
			this.#searchRemoteAbortController.abort("JSelectInternal");
		}
	}

	// override if needed
	fetchFn(url, searchStr) {
		this.#searchRemoteAbortController = new AbortController();

		const urlParamsFn = (this.#fetchUrlParamsFn != null && window[this.#fetchUrlParamsFn]) || (s => this.#buildFetchUrlParams(s));
		const urlParams = urlParamsFn(searchStr);

		return fetch(
			this.buildFetchUrl(url, urlParams),
			{
				...this.buildFetchOptions(url, searchStr),
				signal: this.#searchRemoteAbortController.signal
			}
		);
	}

	#buildFetchUrlParams(searchStr) {
		return {
			[this.#searchTermParam || JSelect.#defaultSearchTermParam] : searchStr
		};
	}

	// override if needed
	buildFetchUrl(urlStr, urlParams) {
		const url = new URL(urlStr, window.location);

		for(const [k, v] of Object.entries(urlParams)) {
			if (v !== undefined && v !== null) {
				if (Array.isArray(v)) {
					url.searchParams.delete(k);
					v.forEach(val => url.searchParams.append(k, val))
				} else {
					url.searchParams.set(k, v);
				}
			}
		}

		return url;
	}

	// override if needed
	buildFetchOptions(urlStr, searchStr) {
		return {};
	}

	#handleFetchObject(obj) {
		const options = this.convertFetchResponse(obj);

		this.#detachMutationObserver();
		this.append(...options);
		this.#attachMutationObserver();

		this.#checkNoMatch();
		this.#deleteStateLoading();

		this.#availableOptionsChanged();

		this.#setFirstActive();
	}

	// override if needed
	convertFetchResponse(obj) {
		if (obj === null || obj === undefined) {
			return null;
		}

		let options;
		if (!Array.isArray(obj)) { // support for map-style format { id1: text1, id2: text2, ... }
			options = Object.entries(obj).map(([value, text]) => {
				const selectedOption = this.#selectedOptions.find(opt => opt.value === value);
				if (selectedOption) {
					return selectedOption;
				}

				const el = new JOption();
				el.value = value;
				el.textContent = text;
				return el;
			});
		} else { // object format [{id: ..., text: ..., ...}, {id:..., text: ..., ...}, ...]

			options = obj.map(o => {
				const selectedOption = this.#selectedOptions.find(opt => opt.value === o.id);
				if (selectedOption) {
					return selectedOption;
				}

				const el = new JOption();
				el.value = o.id;
				el.textContent = o.text;
				// everything else is assigned to dataset
				Object.entries(o).filter(([k, v]) => k !== "id" && k !== "text").forEach(([k, v]) => el.dataset[k] = v);

				return el;
			});
		}

		return options;
	}

	#handleFetchReject(reason) {
		if (reason instanceof DOMException) {
			if (reason.name === "AbortError") {
				this.#deleteStateLoading();
				return;
			}
		} else if (reason === "JSelectInternal") {
			return;
		}

		// TODO: wrap/prefix error message?
		this.#showMessage(reason.message);
	}

	#showMessage(msg) {
		this.#msgContainer.textContent = msg;
		this.#addState("msg");
	}

	#hideMessage() {
		this.#deleteState("msg");
	}

	#addStateLoading() {
		this.#addState("loading");
	}

	#deleteStateLoading() {
		this.#deleteState("loading");
	}

	#addState(state) {
		this.#internals.states.add(state);
	}

	#deleteState(state) {
		this.#internals.states.delete(state);
	}

	#onPaste(e) {
		e.preventDefault();

		const textToPaste = e.clipboardData.getData('Text')?.trim();

		if (textToPaste) {
			this.#input.setRangeText(textToPaste, this.#input.selectionStart, this.#input.selectionEnd, "end");
			this.#input.dispatchEvent(new InputEvent('input', {bubbles: true, cancelable: false}));
		}
	}

	#onInput() {
		if (this.#url) {
			clearTimeout(this.#searchRemoteTimeout);

			this.#abortSearch();
			this.#deleteStateLoading();

			this.#searchRemoteTimeout = setTimeout(() => {
				this.#ensureOpenOptionContainer();
				this.#searchRemote();
			}, this.searchRemoteDebounce);
		} else {
			this.#ensureOpenOptionContainer();

			this.#searchLocal();
		}
	}

	#checkNoMatch() {
		for (const el of this.#options) {
			if (!el.hidden) {
				this.#hideMessage();
				return;
			}
		}

		this.#showMessage(this.#msgNoMatch || JSelect.#defaultMsgNoMatch);
	}

	#onContainerMouseDown(e) {
		const part = e.target?.getAttribute("part");
		if (part === "item-remove" || part === "clear") {
			e.preventDefault(); // prevent focus on item remove
		} else if (this.#internals.states.has("open")) {
			if (e.target !== this.#input) {
				e.preventDefault();
			}
			// this.blur();
		}
	}

	#onContainerMouseUp(e) {
		if (e.target !== this.#input) {
			e.preventDefault();
		}
	}

	#onContainerClick(e) {
		const part = e.target?.getAttribute("part");
		if (part === "item-remove") {
			const item = e.target.closest("[part=\"item\"]");
			this.#removeItem(item);
			this.#onValueChange(true);

			e.preventDefault(); // prevent focus on item remove
		} else if (part === "clear") {
			const item = this.#itemContainer.firstElementChild;
			if (!item) {
				return;
			}

			this.#removeItem(item);
			this.#onValueChange(true);

			e.preventDefault(); // prevent focus on item remove
		}
	}


	#onOptionContainerClick(e) {
		if (e.target instanceof JOption && !e.target.disabled) {
			this.#userSelectOption(e.target);

			e.preventDefault();
		}
	}

	#onOptionContainerMouseOver(e) {
		if (e.target instanceof JOption && !e.target.disabled) {
			this.#setActive(e.target);
		}
	}

	#unselectOption(el) {
		if (!el) {
			return;
		}

		const item = this.#findItem(el.value);
		this.#unselectOnlyOption(el);
		item?.remove();
	}

	#unselectOnlyOption(el) {
		if (!el?.selected) {
			return;
		}

		el.ariaSelected = null;
		el.selected = false;
		el.hidden = false;

		if (el.optGroup?.hidden) {
			el.optGroup.hidden = false;
		}

		if (this.#isMultiple) {
			if (this.#value) {
				const idx = this.#value.indexOf(el.value);
				if (idx >= 0) {
					this.#value.splice(idx, 1);
				}
			}
		} else if (this.#value === el.value) {
			this.#value = null;
		}

		const selectedElIndex = this.#selectedOptions.indexOf(el);

		if (selectedElIndex >= 0) {
			this.#selectedOptions.splice(selectedElIndex, 1);
		}

		if (!this.#url) {
			this.#matchLocalMultiple([el]);
		}
	}

	#selectOption(el) {
		if (!this.#isMultiple && this.#selectedOptions.length) {
			if (el.selected && this.#selectedOptions[0] === el) {
				return;
			}

			this.#selectedOptions.forEach(o => this.#unselectOption(o));
		}

		if (el) {
			el.ariaSelected = true;
			el.selected = true;
			this.#hideOptionAfterSelect(el);
			this.#selectedOptions.push(el);
			this.#addValue(el);
		} else {
			this.#selectedOptions = [];
			this.#value = this.#isMultiple ? [] : null;
		}
	}

	#findItem(value) {
		for(const item of this.#itemContainer.children) {
			if (item.dataset.value === value) {
				return item;
			}
		}

		return null;
	}

	#findOptions(value) {
		const opts = [];

		for(const option of this.#options) {
			if(option.value === value) {
				opts.push(option)
			}
		}

		for(const option of this.#selectedOptions) {
			if(option.value === value && !opts.includes(option)) {
				opts.push(option)
			}
		}

		return opts;
	}

	#removeItem(el) {
		const value = el.dataset.value;
		const option = this.#findOptions(value).find(o => o.selected);
		// option might be null when using remote search
		if (option) {
			this.#unselectOnlyOption(option);
		}

		el.remove();

		this.#checkAfterItemRemove();
	}

	#checkAfterItemRemove() {
		this.#checkPlaceholder();
		this.#checkValidity();

		if (!this.#isMultiple && this.#itemContainer.children.length === 0) {
			this.#deleteState("clearable");
		}
	}

	#checkPlaceholder() {
		if (this.#itemContainer.children.length === 0 && this.#placeholder !== null) {
			this.#addState("placeholder");
		} else {
			this.#deleteState("placeholder");
		}
	}

	#checkValidity() {
		if (this.#required && this.#itemContainer.children.length === 0) {
			this.#internals.setValidity({ valueMissing: true }, this.#msgRequired || JSelect.#defaultMsgRequired, this.#input);
		} else {
			this.#internals.setValidity({});
		}
	}

	#checkSearchVisibility() {
		this.#input.readOnly = this.#noSearch;

		if (this.#noSearch) {
			this.#addState("no-search");
			if (this.#input.value?.length > 0) {
				this.#input.value = "";

				if (!this.#url) {
					this.#matchLocalMultiple(this.#options);
				}
			}
		} else {
			this.#deleteState("no-search");
		}
	}

	#newItem(el) {
		const item = JSelect.#itemTmpl.content.cloneNode(true).firstChild;
		item.textContent = el.textContent;
		item.dataset.value = el.value;

		if (this.#canRemove()) {
			if (this.#isMultiple) {
				this.#addRemove(item);
			} else {
				this.#addState("clearable");
			}
		}

		return item;
	}

	#addRemove(item) {
		const remove = JSelect.#itemRemoveTmpl.content.cloneNode(true);
		item.insertBefore(remove, item.firstChild);
		item.dataset.removable = "";
	}

	#canRemove() {
		return !this.#noClear && (this.#isMultiple || this.#placeholder);
	}

	#addValue(el) {
		const wasEmpty = this.#itemContainer.children.length === 0;

		const item = this.#newItem(el);

		// add a value for multiple mode, set value otherwise
		if (this.#isMultiple) {
			if (!this.#value) {
				this.#value = [];
			}

			this.#value.push(el.getAttribute("value"));

			if (this.#itemContainer.children.length === 0) {
				this.#itemContainer.replaceChildren(item);
			} else {
				this.#itemContainer.appendChild(item);
			}
		} else {
			this.#value = el.getAttribute("value");

			this.#itemContainer.replaceChildren(item);
		}

		if (wasEmpty) {
			this.#checkPlaceholder();
			this.#checkValidity();
		}
	}

	#hideOptionAfterSelect(el) {
		if (el.hidden) {
			return;
		}

		if (this.#isMultiple || !this.#keepSingleSelectOption) {
			el.hidden = true;
			const optGroup = el.optGroup;
			if (optGroup && !Array.from(optGroup.children).filter(c => !c.hidden).length) {
				optGroup.hidden = true;
			}
		}

		if (this.#isMultiple) {
			if ((this.#isMultiple || !this.#keepSingleSelectOption) && this.#activeOption === el) {
				const opt = this.#getNextOption(el) || this.#getPreviousOption(el);
				if (opt) {
					this.#setActive(opt);
				}
			}
		}
	}

	#afterUserSelect(skipBlur) {
		if (this.#isMultiple) {
			if (this.#blurMultiAfterSelect) {
				this.#closeMultiAfterSelect();
			}
		} else {
			this.#closeSingleAfterSelect(skipBlur);
		}
	}

	#userSelectOption(opt) {
		if (!opt.selected) {
			const nextActive = this.#getNextOption(opt) || this.#getPreviousOption(opt);

			this.#selectOption(opt);
			this.#afterUserSelect();

			this.#setActive(nextActive);
			this.#onValueChange(true);
		} else if (!this.#isMultiple) {
			this.#closeSingleAfterSelect();
		}  else if (this.#blurMultiAfterSelect) {
			this.#closeMultiAfterSelect();
		}
	}

	#onInputKeyDown(e) {
		if (e.key === "Escape") {
			this.blur();
			e.preventDefault();
			return;
		}

		if (e.key === "Enter") {
			if (this.#activeOption) {
				this.#userSelectOption(this.#activeOption);
			}

			e.preventDefault();
		} else if (e.key === "PageUp") {
			if (this.#activeOption) {
				const clientHeight = this.#optionContainer.clientHeight;
				const minTop = this.#optionContainer.getBoundingClientRect().top - clientHeight;
				const opts = [...this.#options];
				const idx = opts.indexOf(this.#activeOption);
				let newActive;
				for (let i = idx - 1; i >= 0; i--) {
					const opt = opts[i];
					if (opt.hidden) {
						continue;
					}

					const optRect = opt.getBoundingClientRect();
					if (optRect.top >= minTop || !newActive) {
						newActive = opt;
					} else {
						break;
					}
				}
				if (newActive) {
					this.#setActive(newActive);
					this.#activeOption.scrollIntoView(false);
				}
			} else {
				this.#setLastActive();
				this.#activeOption?.scrollIntoView(false);
			}

			e.preventDefault();
		} else if (e.key === "PageDown") {
			if (this.#activeOption) {
				const containerBottom = this.#optionContainer.getBoundingClientRect().bottom;
				const opts = [...this.#options];
				const idx = opts.indexOf(this.#activeOption);
				let newActive;
				for (let i = idx + 1; i < opts.length; i++) {
					const opt = opts[i];

					if (opt.hidden) {
						continue;
					}

					const optRect = opt.getBoundingClientRect();
					if (optRect.bottom <= containerBottom || !newActive) {
						newActive = opt;
					} else {
						break;
					}
				}
				if (newActive) {
					this.#setActive(newActive);
					this.#activeOption.scrollIntoView(true);
				}
			} else {
				this.#setFirstActive();
				this.#activeOption?.scrollIntoView(true);
			}

			e.preventDefault();
		} else if (e.key === "Tab" && !e.shiftKey) {
			if (this.#activeOption) {
				if (!this.#activeOption.selected) {
					this.#selectOption(this.#activeOption);
					this.#afterUserSelect(true);
					this.#onValueChange(true);
				} else if (!this.#isMultiple || this.#blurMultiAfterSelect) {
					// this.blur();
				}
			}

			// don't prevent focus jumping to the next/previous element
		} else {
			const isUp = e.key === "ArrowUp";
			const isDown = e.key === "ArrowDown";

			if (isUp || isDown) {
				e.preventDefault();
			}

			if(isUp !== isDown) {
				const activeEl = this.querySelector("j-option.active");

				if (!activeEl) {
					if (isDown) {
						this.#setFirstActive();
						this.#activeOption?.scrollIntoView(true);
					} else {
						this.#setLastActive();
						this.#activeOption?.scrollIntoView(false);
					}
				} else {
					const nextActiveEl = isDown ? this.#getNextOption(activeEl) : this.#getPreviousOption(activeEl);

					if (nextActiveEl) {
						nextActiveEl.scrollIntoView({ behavior: "instant", block: "nearest" });
						this.#setActive(nextActiveEl);
					}
				}
			}
		}
	}

	#getOptionIndex(el) {
		let i = 0;
		for(const o of this.#options) {
			if (o === el) {
				return i;
			}

			i++;
		}

		return null;
	}

	#getNextOption(el) {
		if (el.hidden) {
			return null;
		}

		let returnNext = false;

		for(const o of this.#options) {
			if (returnNext && !o.hidden) {
				return o;
			}

			if (o === el) {
				returnNext = true;
			}
		}

		return null;
	}

	#getPreviousOption(el) {
		if (el.hidden) {
			return null;
		}

		let idx = 0;
		for(const o of this.#options) {
			if (o === el) break;
			idx++;
		}

		if (idx >= this.#options.length) {
			return null;
		}

		for(let i=idx-1; i >= 0; i--) {
			const item = this.#options.item(i);
			if (!item.hidden) {
				return item;
			}
		}

		return null;
	}

	#setFirstActive() {
		for(const el of this.#options) {
			if (!el.hidden) {
				this.#setActive(el);
				return;
			}
		}

		this.#removeActive();
	}

	#setLastActive() {
		const len = this.#options.length;
		for(let i = len - 1; i >= 0; i--) {
			const item = this.#options.item(i);
			if (!item.hidden) {
				this.#setActive(item);
				return;
			}
		}

		this.#removeActive();
	}

	#setActive(newActiveEl) {
		if (newActiveEl !== this.#activeOption) {
			if (newActiveEl) {
				newActiveEl.active = true;
			}

			if (this.#activeOption) {
				this.#activeOption.active = false;
			}

			this.#activeOption = newActiveEl;
			if (this.#activeOption) {
				// TODO: once browsers support it, use ariaActiveDescendantElement, so we don't need ids anymore
				this.#input.setAttribute("aria-activedescendant", this.#activeOption.id);
			}
		}
	}

	#removeActive() {
		if (this.#activeOption) {
			this.#activeOption.active = false;
			this.#activeOption = null;
		}
	}

	#removeDiacritics(str) {
		return str
			?.normalize('NFD')
			?.replace(/[\u0300-\u036f]/g, '')
	}

	/**
	 * Run after value was changed by changing selection
	 * @param {boolean} triggerEvent
	 */
	#onValueChange(triggerEvent) {
		this.#updateFormValue();

		triggerEvent && this.#triggerChangeEvent();
	}

	#triggerChangeEvent() {
		this.dispatchEvent(new Event("change", { bubbles:true, cancelable: false, composed: true }));
	}

	#updateDisabledState() {
		this.#internals.ariaDisabled = this.#disabled ? "true" : "false";
		if (this.#disabled) {
			this.#addState("disabled");
		} else {
			this.#deleteState("disabled");
		}
		this.#input.disabled = this.#disabled;

		this.#updateFormValue();
		this.#updateListener(!this.#disabled);
	}

	#updateFormValue() {
		if (this.#disabled) {
			this.#internals.setFormValue(null);
			return;
		}

		const name = this.getAttribute("name");

		let val;
		if (name === null || name.length === 0) {
			val = null;
		} else {
			val = new FormData();
			if (Array.isArray(this.#value)) {
				if (this.#value.length === 0) {
					val = "";
				} else {
					this.#value.forEach(it => {
						// PROD DEBUG
						val.append(name, it);
					}); // multiple values
				}
			} else if (this.#value !== null && this.#value !== undefined) {
				// PROD DEBUG
				val.set(name, this.#value); // single value
			} else {
				val.set(name, "");
			}
		}

		// value is internal value, state will be used for formStateRestoreCallback on e.g. page back button
		this.#internals.setFormValue(val, val);
	}

	setValueFromJSON(json) {
		try {
			const obj=JSON.parse(json);
			this.setSelectedItem(obj);
		} catch (e) {}
	}

	setOptionsFromObject(obj) {
		this.#value = undefined;
		const options = this.convertFetchResponse(obj);
		this.#detachMutationObserver();
		if (options !== null && options !== undefined) {
			this.replaceChildren(...options);
		} else {
			this.replaceChildren();
		}
		this.#updateSpacer();
		this.#attachMutationObserver();

		this.#updateChildren();
	}

	setSelectedItem(item) {
		if (item === undefined) {
			return;
		}

		if (item === null) {
			this.#clear();
			return;
		}

		let props = Object.entries(item);
		if(props.length === 0) {
			this.#clear();
			return;
		}

		if (!this.#isMultiple) {
			props = [props[0]];
		}

		const values = new Set(props.map(entry => entry[0]));
		const selectedRaw = this.#selectedOptions.map(selectedOption => [selectedOption.value, selectedOption]);

		let valueChanged = false;

		if (this.#isMultiple) {
			for (const [k, v] of selectedRaw) {
				if (!values.has(k)) {
					this.#unselectOption(v, true);
					valueChanged = true;
				}
			}
		}

		const selected = new Map(selectedRaw);
		const opts = new Map([...this.#options].map(option => [option.value, option]));

		for(const [k, v] of props) {
			if (!selected.has(k)) {
				let opt = opts.get(k);
				if (!opt) {
					opt = this.#createOption(k, v);
				}
				this.#selectOption(opt, false);
				valueChanged = true;
			}
		}

		if (valueChanged) {
			this.#onValueChange(false);
		}
	}

	#createOption(value, label) {
		const el = new JOption();
		el.value = value;
		el.innerText = label;
		return el;
	}

	#clear() {
		for (const opt of [...this.#selectedOptions]) {
			this.#unselectOption(opt);
		}

		if (this.#url) {
			this.textContent = '';
		}

		this.#itemContainer.replaceChildren();
		this.#checkAfterItemRemove();
	}
}

customElements.define("j-select", JSelect);
