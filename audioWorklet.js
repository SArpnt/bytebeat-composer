(function () {
	class BytebeatProcessor extends AudioWorkletProcessor {
		constructor() {
			super();

			this.func

			this.port.onmessage = e => {
				console.log(e.data);
			};

			this.port.postMessage("postMessage from processor");
			(function test() {
				console.log({globalThis});
			})()
		}

		process(inputs, outputs, parameters) {
			const output = outputs[0];
			output.forEach(channel => {
				for (let i = 0; i < channel.length; i++)
					channel[i] = Math.random() * 2 - 1;
			});
			return true;
		}
	}

	registerProcessor("bytebeat-processor", BytebeatProcessor);
})();