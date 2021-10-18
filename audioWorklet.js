(function () {
	class BytebeatProcessor extends AudioWorkletProcessor {
		constructor() {
			super();

			this.audioSample = 0; // TODO: is this needed? might be better to use currentTime
			this.lastFlooredTime = -1;
			this.byteSample = 0;

			this.sampleRatio = NaN;

			this.lastByteValue = NaN;
			this.lastValue = NaN;
			this.lastFuncValue = null;

			this.isPlaying = false;

			this.func = null;
			this.mode = "Bytebeat";
			this.sampleRate = 8000;
			this.sampleRateDivisor = 1;
			this.playSpeed = 1;


			this.updateSampleRatio();

			this.port.addEventListener("message", this.messageHandler.bind(this));
			this.port.start();
		}

		messageHandler(e) {
			const data = e.data;

			// set vars
			for (let v of [
				"mode",
				"isPlaying",
				"sampleRate",
				"sampleRateDivisor",
				"playSpeed",
			])
				if (data[v] !== undefined)
					this[v] = data[v];

			// run functions
			if (data.setByteSample !== undefined)
				this.setByteSample(...data.setByteSample);

			// other
			if (data.codeText !== undefined)
				this.refreshCalc(data.codeText);

			if (data.updateSampleRatio)
				this.updateSampleRatio();
		}

		setByteSample(value, clear = false) {
			this.byteSample = value;
			this.port.postMessage({ [clear ? "clearCanvas" : "clearDrawBuffer"]: true });
			this.audioSample = 0;
			this.lastFlooredTime = -1;
			this.lastValue = NaN;
			this.lastByteValue = NaN;
			this.lastFuncValue = null;
		}
		refreshCalc(codeText) {
			// create shortened functions
			const params = Object.getOwnPropertyNames(Math);
			const values = params.map(k => Math[k]);
			params.push("int");
			values.push(Math.floor);
			params.push("window");
			values.push(globalThis);

			// TODO: block out vars currentFrame, currentTime, sampleRate, registerProcessor

			// test bytebeat
			{
				const oldFunc = this.func;
				let errType;
				try {
					errType = "compile";
					this.func = new Function(...params, "t", `return 0, ${codeText.trim() || "undefined"}\n;`).bind(globalThis, ...values);
					errType = "runtime";
					this.func(0);
				} catch (err) {
					this.func = oldFunc;
					this.port.postMessage({ errorMessage: { type: errType, err, priority: 1 } });
					return;
				}
			}

			// delete single letter variables to prevent persistent variable errors (covers a good enough range)
			for (let i = 0; i < 26; i++)
				delete globalThis[String.fromCharCode(65 + i)], globalThis[String.fromCharCode(97 + i)];

			this.port.postMessage({ generateUrl: true, errorMessage: null });
		}
		updateSampleRatio() {
			let flooredTimeOffset;
			if (isNaN(this.sampleRatio))
				flooredTimeOffset = 0;
			else
				flooredTimeOffset = this.lastFlooredTime - Math.floor(this.sampleRatio * this.audioSample);
			this.sampleRatio = this.sampleRate * this.playSpeed / sampleRate;
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
			let drawBuffer = [];
			for (let i = 0; i < chDataLen; i++) {
				time += this.sampleRatio;
				const flooredTime = Math.floor(time / this.sampleRateDivisor) * this.sampleRateDivisor;
				if (this.lastFlooredTime != flooredTime) {
					const roundSample = Math.floor(byteSample / this.sampleRateDivisor) * this.sampleRateDivisor;
					let funcValue;
					try {
						funcValue = this.func(roundSample);
					} catch (err) {
						this.port.postMessage({ errorMessage: { type: "runtime", err } });
						this.lastByteValue = this.lastValue = funcValue = NaN;
					}
					if (funcValue != this.lastFuncValue) {
						if (!isNaN(funcValue)) {
							if (this.mode == "Bytebeat") {
								this.lastByteValue = funcValue & 255;
								this.lastValue = this.lastByteValue / 127.5 - 1;
							} else if (this.mode == "Signed Bytebeat") {
								this.lastByteValue = (funcValue + 128) & 255;
								this.lastValue = this.lastByteValue / 127.5 - 1;
							} else if (this.mode == "Floatbeat") {
								this.lastValue = funcValue;
								this.lastByteValue = Math.round((this.lastValue + 1) * 127.5);
							}
						}
						drawBuffer.push({ t: roundSample, value: this.lastByteValue });
					}
					byteSample += flooredTime - this.lastFlooredTime;
					this.lastFuncValue = funcValue;
					this.lastFlooredTime = flooredTime;
				}
				chData[i] = this.lastValue;
			}
			this.audioSample += chDataLen;
			this.byteSample = byteSample;
			this.port.postMessage({ byteSample, drawBuffer });
			return true;
		}
	}

	registerProcessor("bytebeat-processor", BytebeatProcessor);
})();