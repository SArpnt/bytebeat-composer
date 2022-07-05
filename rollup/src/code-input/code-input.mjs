// CodeInput 1.0.3, modified heavily

const codeInput = Object.seal({
	usedTemplates: {}, // TODO: this should be renamed to templates and the other thing named something else
	defaultTemplate: null,
	registerTemplate(templateName, template) {
		codeInput.usedTemplates[templateName] = template;
		codeInput.defaultTemplate = templateName;
		for (const e of document.querySelectorAll("code-input")) // TODO: this isn't great because it doesn't support extensions of it and such
			if (!e.template || e.template === templateName)
				e.updateTemplate();
	},
	templates: {
		prism(prism) { // Prism.js (https://prismjs.com/)
			console.log(prism, prism.high);
			return {
				highlight: prism.highlightElement,
				isCode: true,
				includeCodeInputInHighlightFunc: false,
			};
		},
		/*hljs(hljs) { // Highlight.js (https://highlightjs.org/)
			return {
				highlight: hljs.highlightElement,
				preElementStyled: false,
				isCode: true,
				includeCodeInputInHighlightFunc: false,
			};
		},
		characterLimit() {
			return {
				highlight: function(result_element, code_input) {
	
					let character_limit = Number(code_input.getAttribute("data-character-limit"));
	
					let normal_characters = code_input.escape_html(code_input.value.slice(0, character_limit));
					let overflow_characters = code_input.escape_html(code_input.value.slice(character_limit));
					
					result_element.innerHTML = `${normal_characters}<mark class="overflow">${overflow_characters}</mark>`;
					if(overflow_characters.length > 0) {
						result_element.innerHTML += ` <mark class="overflow-msg">${code_input.getAttribute("data-overflow-msg") || "(Character limit reached)"}</mark>`;
					}
				},
				preElementStyled: true,
				isCode: false,
				includeCodeInputInHighlightFunc: true,
			}
		},
		rainbowText(rainbow_colors=["red", "orangered", "orange", "goldenrod", "gold", "green", "darkgreen", "navy", "blue",  "magenta"], delimiter="") {
			return {
				highlight: function(result_element, code_input) {
					let html_result = [];
					let sections = code_input.value.split(code_input.template.delimiter);
					for (let i = 0; i < sections.length; i++) {
						html_result.push(`<span style="color: ${code_input.template.rainbow_colors[i % code_input.template.rainbow_colors.length]}">${code_input.escape_html(sections[i])}</span>`);
					}
					result_element.innerHTML = html_result.join(code_input.template.delimiter);
				},
				preElementStyled: true,
				isCode: false,
				includeCodeInputInHighlightFunc: true,
				rainbow_colors: rainbow_colors,
				delimiter: delimiter,
			}
		}*/
	}
})

class CodeInputElem extends HTMLElement {
	constructor() {
		super();

		const value = this.value || this.innerHTML || "";

		const shadow = this.attachShadow({ mode: "open" });
		this.scrollElem = document.createElement("pre");
		this.outputElem = document.createElement("code");
		this.outputElem.part = "code";
		this.scrollElem.part = "pre";
		this.scrollElem.ariaHidden = true;
		this.scrollElem.append(this.outputElem);
		shadow.append(this.scrollElem);
		this.inputElem = document.createElement("textarea");
		this.inputElem.part = "textarea";
		this.inputElem.placeholder = this.getAttribute("placeholder");
		this.inputElem.spellcheck = false;
		this.inputElem.name = this.getAttribute("name");
		this.removeAttribute("name");
		this.inputElem.oninput = () => {this.value = this.inputElem.value;}
		this.inputElem.onscroll = () => {this.syncScroll();}
		this.inputElem.onkeydown = e => {this.checkTab(e); this.checkEnter(e);}
		shadow.append(this.inputElem);

		this.updateTemplate();

		this.value = value; // runs this.update()
	}
	updateTemplate() {
		this.templateName = this.getAttribute("template") || this.templateName || codeInput.defaultTemplate;
		this.template = this.templateName ?
			codeInput.usedTemplates[this.templateName] :
			null;

		if (this.template?.isCode) {
			const lang = this.getAttribute("lang");
			if (lang)
				this.outputElem.classList.add("language-" + lang);
		}
	}

	/* Syntax-highlighting functions */
	update() {
		let text = this.value;

		// Handle final newlines (see article)
		if (text[text.length - 1] === "\n")
			text += " ";

		this.outputElem.innerHTML = this.escapeHtml(text);
		if (this.template) {
			if (this.template.includeCodeInputInHighlightFunc)
				this.template.highlight(this.outputElem, this);
			else
				this.template.highlight(this.outputElem);
		}

		this.syncScroll();
	}

	syncScroll() {
		/* Scroll result to scroll coords of event - sync with textarea */
		// Get and set x and y
		this.scrollElem.scrollTop = this.inputElem.scrollTop;
		this.scrollElem.scrollLeft = this.inputElem.scrollLeft;
	}

	checkTab(event) { // TODO: fix variable names in this function
		if (event.key != "Tab" || !this.template?.isCode)
			return;

		const oldVal = this.inputElem.value;
		event.preventDefault();

		if (!event.shiftKey && this.inputElem.selectionStart === this.inputElem.selectionEnd) {
			// Shift always means dedent - this places a tab here.
			let before_selection = oldVal.slice(0, this.inputElem.selectionStart); // text before tab
			let after_selection = oldVal.slice(this.inputElem.selectionEnd, this.inputElem.value.length); // text after tab

			let cursor_pos = this.inputElem.selectionEnd + 1; // where cursor moves after tab - moving forward by 1 char to after tab
			this.inputElem.value = before_selection + "\t" + after_selection; // add tab char

			// move cursor
			this.inputElem.selectionStart = cursor_pos;
			this.inputElem.selectionEnd = cursor_pos;

		} else {
			let lines = this.inputElem.value.split("\n");
			let letter_i = 0;

			let selection_start = this.inputElem.selectionStart; // where cursor moves after tab - moving forward by 1 indent
			let selection_end = this.inputElem.selectionEnd; // where cursor moves after tab - moving forward by 1 indent

			let number_indents = 0;
			let first_line_indents = 0;

			for (let i = 0; i < lines.length; i++) {
				letter_i += lines[i].length+1; // newline counted
				
				console.log(lines[i], ": start", this.inputElem.selectionStart, letter_i, "&& end", this.inputElem.selectionEnd , letter_i - lines[i].length)
				if (this.inputElem.selectionStart <= letter_i && this.inputElem.selectionEnd >= letter_i - lines[i].length) {
					// Starts before or at last char and ends after or at first char
					if (event.shiftKey) {(t*(1+(5&t>>10))*(3+(t>>17&1?(2^2&t>>14)/3:3&(t>>13)+1))>>(3&t>>9))&(t&4096?(t*(t^t%9)|t>>3)>>1:255)
						if (lines[i][0] === "\t") {
							// Remove first tab
							lines[i] = lines[i].slice(1);
							if (number_indents === 0)
								first_line_indents--;
							number_indents--;
						}
					} else {
						lines[i] = "\t" + lines[i];
						if (number_indents === 0)
							first_line_indents++;
						number_indents++;
					}
					
				}
			}
			this.inputElem.value = lines.join("\n");

			// move cursor
			this.inputElem.selectionStart = selection_start + first_line_indents;
			this.inputElem.selectionEnd = selection_end + number_indents;
		}

		this.value = this.inputElem.value;
	}

	checkEnter(event) { // TODO: fix variable names in this function
		if (event.key != "Enter" || !this.template?.isCode)
			return;

		event.preventDefault();

		let lines = this.inputElem.value.split("\n");
		let letter_i = 0;
		let current_line = lines.length - 1;
		let new_line = "";
		let number_indents = 0;

		// find the index of the line our cursor is currently on
		for (let i = 0; i < lines.length; i++) {
			letter_i += lines[i].length + 1;
			if (this.inputElem.selectionEnd <= letter_i) {
				current_line = i;
				break;
			}
		}

		// count the number of indents the current line starts with (up to our cursor position in the line)
		let cursor_pos_in_line = lines[current_line].length - (letter_i - this.inputElem.selectionEnd) + 1;
		for (let i = 0; i < cursor_pos_in_line; i++) {
			if (lines[current_line][i] === "\t")
				number_indents++;
			else
				break;
		}

		// determine the text before and after the cursor and chop the current line at the new line break
		let text_after_cursor = "";
		if (cursor_pos_in_line != lines[current_line].length) {
			text_after_cursor = lines[current_line].substring(cursor_pos_in_line);
			lines[current_line] = lines[current_line].substring(0, cursor_pos_in_line);
		}

		// insert our indents and any text from the previous line that might have been after the line break
		for (let i = 0; i < number_indents; i++) {
			new_line += "\t";
		}
		new_line += text_after_cursor;

		// save the current cursor position
		let selection_start = this.inputElem.selectionStart;
		let selection_end = this.inputElem.selectionEnd;

		// splice our new line into the list of existing lines and join them all back up
		lines.splice(current_line + 1, 0, new_line);
		this.inputElem.value = lines.join("\n");

		// move cursor to new position
		this.inputElem.selectionStart = selection_start + number_indents + 1;  // count the indent level and the newline character
		this.inputElem.selectionEnd = selection_end + number_indents + 1;

		this.value = this.inputElem.value;
	}

	escapeHtml(text) {
		return text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
	}

	/* Callbacks */
	static get observedAttributes() {
		return ["value", "placeholder", "lang", "template"];
	}
	attributeChangedCallback(name, oldValue, newValue) {
		// This will sometimes be called before the element has been created, so trying to update an attribute causes an error.
		// Thanks to Kevin Loughead for pointing this out.
		if (this.isConnected) {
			switch (name) {
				case "value":
					this.inputElem.value = newValue;
					this.update();
					break;
				case "placeholder":
					this.querySelector("textarea").placeholder = newValue;
					break;
				case "template":
					this.updateTemplate();
					this.update();
					break;
				case "lang":
					if (oldValue)
						this.outputElem.classList.remove("language-" + oldValue);
					else
						this.outputElem.classList.remove("language-none"); // Prism

					if (newValue)
						this.outputElem.classList.add("language-" + newValue);

					this.update();
			}
		}
	}

	/* Value attribute */
	get value() {
		return this.getAttribute("value");
	}
	set value(val) {
		return this.setAttribute("value", val);
	}
	/* Placeholder attribute */
	get placeholder() {
		return this.getAttribute("placeholder");
	}
	set placeholder(val) {
		return this.setAttribute("placeholder", val);
	}
};

customElements.define("code-input", CodeInputElem); // Set tag
export default codeInput;
