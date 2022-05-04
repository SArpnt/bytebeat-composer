// note: imports don't work: https://bugzilla.mozilla.org/show_bug.cgi?id=1636121

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

function getErrorMessage(err, time) {
	if (
		err instanceof Error &&
		typeof err.lineNumber === "number" &&
		typeof err.columnNumber === "number"
	) {
		const message = safeStringify(err.message, false);

		if (time !== undefined)
			return `${message} (at line ${err.lineNumber - 3}, character ${err.columnNumber}, t=${time})`;
		else
			return `${message} (at line ${err.lineNumber - 3}, character ${err.columnNumber})`;
	} else {
		if (time !== undefined)
			return `Thrown: ${safeStringify(err, true)} (at t=${time})`;
		else
			return `Thrown: ${safeStringify(err, true)}`;
	}
}

// delete most enumerable variables, and all single letter variables (not foolproof but works well enough)
function deleteGlobals() {
	for (let i = 0; i < 26; i++)
		delete globalThis[String.fromCharCode(65 + i)], globalThis[String.fromCharCode(97 + i)];
	for (let v in globalThis)
		if (![ // TODO: get rid of these global variables
			"currentFrame",
			"currentTime",
			"sampleRate",
		].includes(v))
			delete globalThis[v];
}
// make all existing global properties non-writable, and freeze objects
function freezeExistingGlobals() {
	for (const k of Object.getOwnPropertyNames(globalThis)) {
		if (![
			"currentFrame",
			"currentTime",
			"sampleRate",
		].includes(k)) {
			if ((typeof globalThis[k] === "object" || typeof globalThis[k] === "function") && ![
				"globalThis",
			].includes(k))
				Object.freeze(globalThis[k]);
			if (typeof globalThis[k] === "function" && Object.hasOwnProperty.call(globalThis[k], "prototype"))
				Object.freeze(globalThis[k].prototype);
			Object.defineProperty(globalThis, k, {
				writable: false,
				configurable: false,
			});
		}
	};
}

class BytebeatProcessor extends AudioWorkletProcessor {
	constructor() {
		super({ numberOfInputs: 0 });

		this.audioSample = 0; // TODO: is this needed? might be better to use currentTime
		this.lastFlooredTime = -1;
		this.byteSample = 0;

		this.sampleRatio = NaN;

		this.lastByteValue = [null, null];
		this.lastValue = [0, 0];
		this.lastFuncValue = [null, null];

		this.isPlaying = false;

		this.func = null;
		this.calcByteValue = null;
		this.songData = { sampleRate: null, mode: null };
		this.sampleRateDivisor = 1;
		this.playSpeed = 1;

		this.postedErrorPriority = null;

		Object.seal(this);

		deleteGlobals();
		freezeExistingGlobals();

		this.updateSampleRatio();

		this.port.addEventListener("message", this.handleMessage.bind(this));
		this.port.start();
	}

	handleMessage(e) {
		const data = e.data;

		// set vars
		for (let v of [
			"isPlaying",
			"songData",
			"sampleRateDivisor",
			"playSpeed",
		])
			if (data[v] !== undefined)
				this[v] = data[v];

		// run functions
		if (data.songData !== undefined)
			this.updatePlaybackMode();

		if (data.setByteSample !== undefined)
			this.setByteSample(...data.setByteSample);

		// other
		if (data.code !== undefined)
			this.refreshCode(data.code); // code is already trimmed

		if (data.updateSampleRatio)
			this.updateSampleRatio();

		if (data.displayedError && this.postedErrorPriority < 2)
			this.postedErrorPriority = null;
	}

	updatePlaybackMode() {
		this.calcByteValue = // create function based on mode
			this.songData.mode === "Bytebeat" ? (funcValueC, c) => {
				this.lastByteValue[c] = funcValueC & 255;
				this.lastValue[c] = this.lastByteValue[c] / 127.5 - 1;
			} : this.songData.mode === "Signed Bytebeat" ? (funcValueC, c) => {
				this.lastByteValue[c] = (funcValueC + 128) & 255;
				this.lastValue[c] = this.lastByteValue[c] / 127.5 - 1;
			} : this.songData.mode === "Floatbeat" || this.songData.mode === "Funcbeat" ? (funcValueC, c) => {
				this.lastValue[c] = Math.min(Math.max(funcValueC, -1), 1);
				this.lastByteValue[c] = Math.round((this.lastValue[c] + 1) * 127.5);
			} : (funcValueC, c) => {
				this.lastByteValue[c] = NaN;
			};
	}
	setByteSample(value, clear = false) {
		this.byteSample = value;
		this.port.postMessage({ [clear ? "clearCanvas" : "clearDrawBuffer"]: true });
		this.audioSample = 0;
		this.lastFlooredTime = -1;
		for (let c = 0; c < 2; c++) {
			this.lastValue[c] = 0;
			this.lastByteValue[c] = null;
			this.lastFuncValue[c] = null;
		}
	}
	refreshCode(code) { // code is already trimmed
		// create shortened functions
		const params = Object.getOwnPropertyNames(Math);
		const values = params.map(k => Math[k]);
		params.push("int");
		values.push(Math.floor);
		params.push("window");
		values.push(globalThis);

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
			this.func(0);
		} catch (err) {
			// TODO: handle arbitrary thrown objects, and modified Errors
			if (errType === "compile") {
				this.func = oldFunc;
				this.postedErrorPriority = 2;
			} else
				this.postedErrorPriority = 1;
			this.port.postMessage({ updateUrl: true, errorMessage: { type: errType, err: getErrorMessage(err, 0), priority: this.postedErrorPriority } });
			return;
		}
		this.postedErrorPriority = null;
		this.port.postMessage({ updateUrl: true, errorMessage: null });
	}
	updateSampleRatio() {
		let flooredTimeOffset;
		if (isNaN(this.sampleRatio))
			flooredTimeOffset = 0;
		else
			flooredTimeOffset = this.lastFlooredTime - Math.floor(this.sampleRatio * this.audioSample);
		this.sampleRatio = this.songData.sampleRate * this.playSpeed / sampleRate; // TODO: this is the only use of global sampleRate, can it be removed?
		this.lastFlooredTime = Math.floor(this.sampleRatio * this.audioSample) - flooredTimeOffset;
		return this.sampleRatio;
	}

	process(inputs, outputs, parameters) {
		const chData = outputs[0];
		const chDataLen = chData[0].length; // for performance
		if (!chDataLen || !this.isPlaying || !this.func) {
			return true;
		}

		let time = this.sampleRatio * this.audioSample;
		let byteSample = this.byteSample;
		const drawBuffer = [];
		for (let i = 0; i < chDataLen; i++) {
			time += this.sampleRatio;
			const flooredTime = Math.floor(time / this.sampleRateDivisor) * this.sampleRateDivisor;
			if (this.lastFlooredTime !== flooredTime) {
				const roundSample = Math.floor(byteSample / this.sampleRateDivisor) * this.sampleRateDivisor;
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

				let changedSample = false;
				for (const c in funcValue) {
					try {
						funcValue[c] = Number(funcValue[c]);
					} catch (err) {
						funcValue[c] = NaN;
					}
					if (funcValue[c] !== this.lastFuncValue[c] && !(isNaN(funcValue[c]) && isNaN(this.lastFuncValue[c]))) {
						changedSample = true;
						if (isNaN(funcValue[c]))
							this.lastByteValue[c] = NaN;
						else
							this.calcByteValue(funcValue[c], c);
					}
					this.lastFuncValue[c] = funcValue[c];
				}
				if (changedSample)
					drawBuffer.push({ t: roundSample, value: [this.lastByteValue[0], this.lastByteValue[1]] });

				byteSample += flooredTime - this.lastFlooredTime;
				this.lastFlooredTime = flooredTime;
			}
			chData[0][i] = this.lastValue[0];
			chData[1][i] = this.lastValue[1];
		}
		this.audioSample += chDataLen;

		const message = {};
		if (byteSample !== this.byteSample)
			message.byteSample = byteSample;
		if (drawBuffer.length)
			message.drawBuffer = drawBuffer;
		this.port.postMessage(message);

		this.byteSample = byteSample;
		return true;
	}
}

registerProcessor("bytebeatProcessor", BytebeatProcessor);