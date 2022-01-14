// TODO: use import when fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=1636121
//import jsOptimize from "./jsOptimize.mjs";
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
	console.debug("optimized script:", script);
	return script;
};

function betterErrorString(err, time) {
	if (err instanceof Error) {
		if (time !== undefined)
			return `${err.message} (at line ${err.lineNumber - 3}, character ${err.columnNumber}, t=${time})`;
		else
			return `${err.message} (at line ${err.lineNumber - 3}, character ${err.columnNumber})`;
	} else {
		if (time !== undefined)
			return `Thrown: ${JSON.stringify(err)} (at t=${time})`;
		else
			return `Thrown: ${JSON.stringify(err)}`;
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

		this.lastByteValue = null;
		this.lastValue = 0;
		this.lastFuncValue = null;

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
			this.songData.mode === "Bytebeat" ? funcValue => {
				this.lastByteValue = funcValue & 255;
				this.lastValue = this.lastByteValue / 127.5 - 1;
			} : this.songData.mode === "Signed Bytebeat" ? funcValue => {
				this.lastByteValue = (funcValue + 128) & 255;
				this.lastValue = this.lastByteValue / 127.5 - 1;
			} : this.songData.mode === "Floatbeat" ? funcValue => {
				this.lastValue = Math.min(Math.max(funcValue, -1), 1);
				this.lastByteValue = Math.round((this.lastValue + 1) * 127.5);
			} : funcValue => {
				this.lastByteValue = NaN;
			};
	}
	setByteSample(value, clear = false) {
		this.byteSample = value;
		this.port.postMessage({ [clear ? "clearCanvas" : "clearDrawBuffer"]: true });
		this.audioSample = 0;
		this.lastFlooredTime = -1;
		this.lastValue = 0;
		this.lastByteValue = null;
		this.lastFuncValue = null;
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
			this.func = new Function(...params, "t", `return 0,\n${optimizedCode || "undefined"}\n;`).bind(globalThis, ...values);
			errType = "runtime";
			this.func(0);
		} catch (err) {
			// TODO: handle arbitrary thrown objects, and modified Errors
			if (errType === "compile") {
				this.func = oldFunc;
				this.postedErrorPriority = 2;
			} else
				this.postedErrorPriority = 1;
			this.port.postMessage({ updateUrl: true, errorMessage: { type: errType, err: betterErrorString(err, 0), priority: this.postedErrorPriority } });
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
		const chData = outputs[0][0];
		const chDataLen = chData.length; // for performance
		if (!chDataLen)
			return true;
		if (!this.isPlaying || !this.func) {
			chData.fill(0);
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
					funcValue = this.func(roundSample);
				} catch (err) {
					if (this.postedErrorPriority === null) {
						this.postedErrorPriority = 0;
						this.port.postMessage({ errorMessage: { type: "runtime", err: betterErrorString(err, roundSample) } });
					}
					funcValue = NaN;
				}
				try {
					funcValue = Number(funcValue);
				} catch (err) {
					funcValue = NaN;
				}
				if (funcValue !== this.lastFuncValue && !(isNaN(funcValue) && isNaN(this.lastFuncValue))) {
					if (isNaN(funcValue))
						this.lastByteValue = NaN;
					else
						this.calcByteValue(funcValue);
					drawBuffer.push({ t: roundSample, value: this.lastByteValue });
				}
				byteSample += flooredTime - this.lastFlooredTime;
				this.lastFuncValue = funcValue;
				this.lastFlooredTime = flooredTime;
			}
			chData[i] = this.lastValue;
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