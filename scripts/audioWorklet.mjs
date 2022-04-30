// note: imports don't work: https://bugzilla.mozilla.org/show_bug.cgi?id=1636121

// this audio worklet isn't used for the audio node, it's used for performance and the minimal scope. this prevents bytebeat code from doing anything malicious.

function jsOptimize(script, isExpression = true) {
	script = script.trim();
	{ // detect eval(unescape(escape(<const string>).replace(/u(..)/g, "$1%")))
		let evalOptScript = script;
		let replaces = 0;
		evalOptScript = evalOptScript.replace(/^eval\s*\(\s*unescape\s*\(\s*escape/, () => (replaces++, ""));
		if (replaces === 1) {
			evalOptScript = evalOptScript.replace(/\.replace\(\/u\(\.\.\)\/g,([`"'])\$1%\1\)\)\)$/, () => (replaces++, ""));
			if (replaces === 2) {
				console.debug("detected eval compress, escape args:", evalOptScript);
				let hasParens = false;
				evalOptScript = evalOptScript.replace(/^\s*\((?<content>.*)\)\s*$/s, (_, content) => (hasParens = true, content));
				evalOptScript = evalOptScript.trim().match(
					hasParens ?
						/^(?<quote>[`"'])(?<content>.*)\1$/s :
						/^`(?<content>.*)`$/s
				);
				console.debug("string match:", hasParens, evalOptScript);
				if (evalOptScript) {
					const
						quote = evalOptScript.groups.quote ?? "`",
						stringContent = evalOptScript.groups.content;
					console.debug("string match info:", { quote, stringContent });
					if (stringContent.includes(evalOptScript.groups.quote) || stringContent.includes("\\")) // TODO: improve escape handling
						console.debug("invalid string");
					else
						script = unescape(escape(stringContent).replace(/u(..)/g, "$1%"));
				}
			}
		}
	}
	return script;
};

function safeStringify(value, quoteString) {
	if (!quoteString && typeof value === "string")
		return value;
	else
		return JSON.stringify(value);
}


function deleteGlobals() {
	// TODO: delete non enumerables
	for (let v in globalThis)
		if (v !== "currentFrame")
			delete globalThis[v];
}


function setupGlobalScope() {
	// make all existing global properties non-writable, and freeze objects
	for (const k of Object.getOwnPropertyNames(globalThis)) {
		if ((typeof globalThis[k] === "object" || typeof globalThis[k] === "function") && k !== "globalThis")
			Object.freeze(globalThis[k]);

		if (typeof globalThis[k] === "function" && Object.hasOwnProperty.call(globalThis[k], "prototype"))
			Object.freeze(globalThis[k].prototype);

		Object.defineProperty(globalThis, k, {
			writable: false,
			configurable: false,
		});
	};

	// create variables
	Object.defineProperty(globalThis, "window", { value: globalThis });
}


class BytebeatProcessor extends AudioWorkletProcessor {
	constructor() {
		super({ numberOfInputs: 0 });

		this.func = null;
		this.calcOutValue = null;
		this.songData = { sampleRate: null, mode: null };
		this.sampleRateDivisor = 1;

		this.postedErrorPriority = null;

		Object.seal(this);

		deleteGlobals();
		setupGlobalScope();

		this.port.addEventListener("message", this.handleMessage.bind(this));
		this.port.start();
	}

	handleMessage(e) {
		const data = e.data;

		// set vars
		for (let v of [
			"songData",
			"sampleRateDivisor",
		])
			if (data[v] !== undefined)
				this[v] = data[v];

		// run functions
		if (data.songData !== undefined)
			this.updatePlaybackMode();

		// other
		if (data.code !== undefined)
			this.refreshCode(data.code); // code is already trimmed

		if (data.displayedError && this.postedErrorPriority < 2)
			this.postedErrorPriority = null;
	}
	getErrorMessage(err, time) {
		if (
			err instanceof Error &&
			typeof err.lineNumber === "number" &&
			typeof err.columnNumber === "number"
		) {
			const message = safeStringify(err.message, false);

			if (time !== undefined)
				return `${message} (at line ${err.lineNumber - 3 * (this.songData.mode !== "Funcbeat")}, character ${err.columnNumber}, t=${time})`;
			else
				return `${message} (at line ${err.lineNumber - 3 * (this.songData.mode !== "Funcbeat")}, character ${err.columnNumber})`;
		} else {
			if (time !== undefined)
				return `Thrown: ${safeStringify(err, true)} (at t=${time})`;
			else
				return `Thrown: ${safeStringify(err, true)}`;
		}
	}

	updatePlaybackMode() {
		this.calcOutValue = // create function based on mode
			this.songData.mode === "Bytebeat" ?
				funcValueC => (funcValueC & 255) / 127.5 - 1
			: this.songData.mode === "Signed Bytebeat" ?
				funcValueC => ((funcValueC + 128) & 255) / 127.5 - 1
			: this.songData.mode === "Floatbeat" || this.songData.mode === "Funcbeat" ?
				funcValueC => Math.min(Math.max(funcValueC, -1), 1)
			:
				() => NaN;
	}
	refreshCode(code) { // code is already trimmed
		// create shortened functions
		const params = Object.getOwnPropertyNames(Math);
		const values = params.map(k => Math[k]);
		params.push("int");
		values.push(Math.floor);

		deleteGlobals();

		const optimizedCode = jsOptimize(code, true);
		// test bytebeat
		const oldFunc = this.func;
		let errType;
		try {
			errType = "compile";
			if (this.songData.mode === "Funcbeat")
				this.func = new Function(...params, optimizedCode).bind(globalThis, ...values);
			else
				this.func = new Function(...params, "t", `return 0,\n${optimizedCode || "undefined"}\n;`).bind(globalThis, ...values);
			errType = "runtime";
			if (this.songData.mode === "Funcbeat")
				this.func = this.func();
			else
				this.func(0);
		} catch (err) {
			if (errType === "compile") {
				this.func = oldFunc;
				this.postedErrorPriority = 2;
			} else
				this.postedErrorPriority = 1;
			this.port.postMessage({ updateUrl: true, errorMessage: { type: errType, err: this.getErrorMessage(err, 0), priority: this.postedErrorPriority } });
			return;
		}
		this.postedErrorPriority = null;
		this.port.postMessage({ updateUrl: true, errorMessage: null });
	}

	process(inputs, outputs, parameters) {
		const chData = outputs[0];
		const chDataLen = chData[0].length; // for performance
		if (!chDataLen || !this.func)
			return true;

		for (let t = 0; t < chDataLen; t++) {
			const roundSample = Math.floor((t + currentFrame) / this.sampleRateDivisor) * this.sampleRateDivisor; // TODO: remove currentFrame
			let funcValue;
			try {
				if (this.songData.mode === "Funcbeat")
					funcValue = this.func(roundSample / this.songData.sampleRate, this.songData.sampleRate / this.sampleRateDivisor);
				else
					funcValue = this.func(roundSample);
			} catch (err) {
				if (this.postedErrorPriority === null) {
					this.postedErrorPriority = 0;
					this.port.postMessage({ errorMessage: { type: "runtime", err: getErrorMessage(err, roundSample) } });
				}
				funcValue = NaN;
			}

			if (Array.isArray(funcValue))
				funcValue = [funcValue[0], funcValue[1]]; // replace array for safety, arrays could have modified functions
			else
				funcValue = [funcValue, funcValue];

			for (const c in funcValue) {
				try {
					funcValue[c] = Number(funcValue[c]);
				} catch (err) {
					funcValue[c] = NaN;
				}
				if (isNaN(funcValue[c]))
					chData[c][t] = NaN;
				else
					chData[c][t] = this.calcOutValue(funcValue[c]);
			}
		}
		return true;
	}
}

registerProcessor("bytebeatProcessor", BytebeatProcessor);