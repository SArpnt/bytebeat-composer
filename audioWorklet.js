(function () {
	class BytebeatProcessor extends AudioWorkletProcessor {
		constructor() {
			super();

			this.func = null;

			this.port.addEventListener("message", this.messageHandler.bind(this));
			this.port.start();

			this.port.postMessage("message from worklet");
		}

		messageHandler(e) {
			console.info("window -> worklet:", e);
		}

		process(inputs, outputs, parameters) {
			const chData = outputs[0][0];
			const chDataLen = chData.length; // for performance
			if (!chDataLen)
				return;
			if (!this.isPlaying) {
				chData.fill(0);
				return;
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
			this.setByteSample(byteSample, false);
			return true;
		}
	}

	registerProcessor("bytebeat-processor", BytebeatProcessor);
})();