(function () {
	class BytebeatProcessor extends AudioWorkletProcessor {
		constructor() {
			super();

			// need to check
			this.audioSample = 0;
			this.lastFlooredTime = -1;
			this.byteSample = 0;

			this.nextErrType = null;
			this.nextErr = null;

			this.isPlaying = false;

			this.lastByteValue;
			this.lastValue;
			this.lastFuncValue;

			this.drawBuffer = [];

			// will use
			this.func = null;

			this.mode = "Bytebeat";
			this.sampleRate = 8000;
			this.sampleRateDivisor = 1;
			this.playSpeed = 1;
			this.sampleRatio = NaN;

			this.updateSampleRatio();

			this.port.addEventListener("message", this.messageHandler.bind(this));
			this.port.start();
		}

		messageHandler(e) {
			console.info("window -> worklet:", e);
			if (e.data.codeText !== undefined)
				this.refreshCalc(e.data.codeText);
			if (e.data.sampleRate !== undefined) {
				this.sampleRate = e.data.sampleRate;
				this.updateSampleRatio();
			}
			if (e.data.mode !== undefined)
				this.mode = e.data.mode;
			if (e.data.isPlaying !== undefined)
				this.isPlaying = e.data.isPlaying;
		}

		refreshCalc(codeText) {
			// create shortened functions
			const params = Object.getOwnPropertyNames(Math);
			const values = params.map(k => Math[k]);
			params.push("int");
			values.push(Math.floor);
			params.push("window");
			values.push(globalThis);

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
					this.port.postMessage({ errorMessage: { errType, err } });
					return;
				}
			}

			// delete single letter variables to prevent persistent variable errors (covers a good enough range)
			for (let i = 0; i < 26; i++)
				delete globalThis[String.fromCharCode(65 + i)], globalThis[String.fromCharCode(97 + i)];

			this.port.postMessage({ generateUrl: true, errorMessage: null });
		}
		updateSampleRatio() {
			//let flooredTimeOffset = this.lastFlooredTime - Math.floor(this.sampleRatio * this.audioSample);
			this.sampleRatio = this.sampleRate * this.playSpeed / sampleRate;
			//this.lastFlooredTime = Math.floor(this.sampleRatio * this.audioSample) - flooredTimeOffset;
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
			for (let i = 0; i < chDataLen; i++) {
				time += this.sampleRatio;
				const flooredTime = Math.floor(time / this.sampleRateDivisor) * this.sampleRateDivisor;
				if (this.lastFlooredTime != flooredTime) {
					const roundSample = Math.floor(byteSample / this.sampleRateDivisor) * this.sampleRateDivisor;
					let funcValue;
					try {
						funcValue = this.func(roundSample);
					} catch (err) {
						this.nextErrType = "runtime";
						this.nextErr = err;
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
						this.drawBuffer.push({ t: roundSample, value: this.lastByteValue });
					}
					byteSample += flooredTime - this.lastFlooredTime;
					this.lastFuncValue = funcValue;
					this.lastFlooredTime = flooredTime;
				}
				chData[i] = this.lastValue;
			}
			this.audioSample += chDataLen;
			this.byteSample = byteSample;
			return true;
		}
	}

	registerProcessor("bytebeat-processor", BytebeatProcessor);
})();