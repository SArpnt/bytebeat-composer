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
		this.calcOutValues = null;
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
		this.calcOutValues = // create function based on mode
			this.songData.mode === "Bytebeat" ? funcValue => {
				this.lastByteOut = funcValue & 255;
				this.lastAudioOut = this.lastByteOut / 127.5 - 1;
			} : this.songData.mode === "Signed Bytebeat" ? funcValue => {
				this.lastByteOut = (funcValue + 128) & 255;
				this.lastAudioOut = this.lastByteOut / 127.5 - 1;
			} : this.songData.mode === "Floatbeat" || this.songData.mode === "Funcbeat" ? funcValue => {
				this.lastAudioOut = Math.min(Math.max(funcValue, -1), 1);
				this.lastByteOut = Math.round((this.lastAudioOut + 1) * 127.5);
			} : funcValue => {
				this.lastByteOut = NaN;
			};
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
/*
				try {
					funcValue = Number(funcValue);
				} catch (err) {
					funcValue = NaN;
				}
				if (funcValue !== this.lastFuncOut && !(isNaN(funcValue) && isNaN(this.lastFuncOut))) {
					if (isNaN(funcValue))
						this.lastByteOut = NaN;
					else
						this.calcOutValues(funcValue);
					drawBuffer.push({ t: roundSample, value: this.lastByteOut });
				}
				byteSample += flooredTime - this.lastFlooredTime;
				this.lastFuncOut = funcValue;
				this.lastFlooredTime = flooredTime;
			}
			chData[i] = this.lastAudioOut;
		}
		this.audioSample += chDataLen;

		const message = {};
		if (byteSample !== this.byteSample)
			message.byteSample = byteSample;
		if (drawBuffer.length)
			message.drawBuffer = drawBuffer;
		this.port.postMessage(message);

		this.byteSample = byteSample;*/
		return true;
	}
	getRawByteValue(t, sampleRate, sampleRateDivisor) {
		try {
			if (this.songData.mode === "Funcbeat")
				return this.func(t, sampleRate / sampleRateDivisor); // TODO set roundsample properly for supersampling
			else
				return this.func(t);
		} catch (err) {
			if (this.postedErrorPriority === null) {
				this.postedErrorPriority = 0;
				this.port.postMessage({ errorMessage: { type: "runtime", err: this.getErrorMessage(err, roundSample) } });
			}
			return NaN;
		}
	}
}

registerProcessor("bytebeatProcessor", BytebeatProcessor);