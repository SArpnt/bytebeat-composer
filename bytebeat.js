function $toggle(el) {
	if (el.style.display)
		el.style.removeProperty("display");
	else
		el.style.display = "none";
}

class Bytebeat {
	constructor() {
		this.audioCtx = null;
		this.audioWorklet = null;
		this.audioGain = null;
		this.audioRecorder = null;
		this.recordChunks = [];
		this.bufferSize = 0;

		this.audioSample = 0;
		this.lastFlooredTime = -1;
		this.byteSample = 0;
		this.lastValue = NaN;
		this.lastByteValue = NaN;
		this.lastFuncValue = null;
		this.func = () => 0;

		this.nextErrType = null;
		this.nextErr = null;
		this.errorPriority = -Infinity;

		this.canvasCtx = null;
		this.drawScale = 5;
		this.drawBuffer = [];
		this.drawImageData = null;

		this.isPlaying = false;
		this.isRecording = false;

		this.mode = "Bytebeat";
		this.sampleRate = 8000;
		this.sampleRateDivisor = 1;
		this.playSpeed = 1;
		this.sampleRatio = NaN;

		this.canvasElem = null;
		this.inputElem = null;
		this.errorElem = null;

		this.animationFrame = this.animationFrame.bind(this);
		document.addEventListener("DOMContentLoaded", async function onDomLoad() {
			this.initLibrary();
			this.initCodeInput();
			this.initControls();
			this.initCanvas();
			this.refreshCalc();
			await this.initAudioContext();

			this.handleWindowResize(true);
			document.defaultView.addEventListener("resize", this.handleWindowResize.bind(this, false));
		}.bind(this));
	}

	get saveData() {
		const a = document.createElement("a");
		document.body.appendChild(a);
		a.style.display = "none";
		const saveDataInternal = function saveDataInternal(blob, fileName) {
			url = URL.createObjectURL(blob);
			a.href = url;
			a.download = fileName;
			a.click();
			setTimeout(() => window.URL.revokeObjectURL(url));
		};
		Object.defineProperty(this, "saveData", { value: saveDataInternal });
		return saveDataInternal;
	}
	applySampleRate(rate) {
		this.setSampleRate(rate);
		document.getElementById("control-samplerate").value = rate;
	}
	applyMode(mode) {
		this.mode = document.getElementById("control-mode").value = mode;
	}
	changeScale(amount) {
		if (amount) {
			this.drawScale = Math.max(this.drawScale + amount, 0);
			this.clearCanvas();
			if (this.drawScale <= 0)
				this.controlScaleDown.setAttribute("disabled", true);
			else
				this.controlScaleDown.removeAttribute("disabled");
		}
	}
	changeVolume(el) {
		const fraction = parseInt(el.value) / parseInt(el.max);
		this.audioGain.gain.value = fraction * fraction;
	}
	clearCanvas() {
		this.canvasCtx.fillRect(0, 0, this.canvasElem.width, this.canvasElem.height);
	}
	drawGraphics(endTime) {
		const bufferLen = this.drawBuffer.length;
		if (!bufferLen)
			return;

		const
			width = this.canvasElem.width,
			height = this.canvasElem.height;
		const
			startTime = this.drawBuffer[0].t,
			lenTime = endTime - startTime;

		const
			fmod = (a, b) => ((a % b) + b) % b,
			getXpos = t => t / (1 << this.drawScale),
			playingForward = this.playSpeed > 0;

		const
			startXPos = fmod(getXpos(startTime), width), // in canvas bounds
			endXPos = startXPos + getXpos(lenTime); // relative to startXPos, can be outside canvas bounds

		{
			const drawStartX = Math.floor(startXPos);
			const drawEndX = Math.floor(endXPos);
			const drawLenX = Math.abs(drawEndX - drawStartX) + 1;
			const imagePos = Math.min(drawStartX, drawEndX);
			// create imageData
			let imageData = this.canvasCtx.createImageData(drawLenX, height);
			// create / add drawimageData
			if (this.drawScale) { // full zoom can't have multiple samples on one pixel
				if (this.drawImageData) {
					let x = playingForward ? 0 : drawLenX - 1;
					for (let y = 0; y < height; y++) {
						imageData.data[(drawLenX * y + x) << 2] = this.drawImageData.data[y << 2];
						imageData.data[((drawLenX * y + x) << 2) + 1] = this.drawImageData.data[(y << 2) + 1];
						imageData.data[((drawLenX * y + x) << 2) + 2] = this.drawImageData.data[(y << 2) + 2];
					}
				} else
					this.drawImageData = this.canvasCtx.createImageData(1, height);
			} else
				this.drawImageData = null;
			// set alpha
			for (let x = 0; x < drawLenX; x++)
				for (let y = 0; y < height; y++)
					imageData.data[((drawLenX * y + x) << 2) + 3] = 255;
			// draw
			const iterateOverLine = (function iterateOverLine(bufferElem, nextBufferElemTime, callback) {
				const startX = fmod(Math.floor(getXpos(playingForward ? bufferElem.t : nextBufferElemTime + 1)) - imagePos, width);
				const endX = fmod(Math.ceil(getXpos(playingForward ? nextBufferElemTime : bufferElem.t + 1)) - imagePos, width);
				for (let xPos = startX; xPos != endX; xPos = fmod(xPos + 1, width))
					callback(xPos);
			}).bind(this);

			for (let i = 0; i < bufferLen; i++) {
				let bufferElem = this.drawBuffer[i];
				let nextBufferElemTime = this.drawBuffer[i + 1]?.t ?? endTime;
				if (isNaN(bufferElem.value)) {
					iterateOverLine(bufferElem, nextBufferElemTime, xPos => {
						for (let h = 0; h < 256; h++) {
							const pos = (drawLenX * h + xPos) << 2;
							imageData.data[pos] = 128;
							imageData.data[pos + 3] = 255;
						}
					});
				} else if (bufferElem.value >= 0 && bufferElem.value < 256) {
					iterateOverLine(bufferElem, nextBufferElemTime, xPos => {
						const pos = (drawLenX * (255 - bufferElem.value) + xPos) << 2;
						imageData.data[pos] = imageData.data[pos + 1] = imageData.data[pos + 2] = 255;
					});
				}
			}
			// put imageData
			this.canvasCtx.putImageData(imageData, imagePos, 0);
			if (endXPos >= width)
				this.canvasCtx.putImageData(imageData, imagePos - width, 0);
			else if (endXPos < 0)
				this.canvasCtx.putImageData(imageData, imagePos + width, 0);
			// write to drawImageData
			if (this.drawScale) { // full zoom can't have multiple samples on one pixel
				const x = playingForward ? drawLenX - 1 : 0;
				for (let y = 0; y < height; y++) {
					this.drawImageData.data[y << 2] = imageData.data[(drawLenX * y + x) << 2];
					this.drawImageData.data[(y << 2) + 1] = imageData.data[((drawLenX * y + x) << 2) + 1];
					this.drawImageData.data[(y << 2) + 2] = imageData.data[((drawLenX * y + x) << 2) + 2];
				}
			}
		}

		// cursor
		if (this.sampleRate >> this.drawScale < 3950) {
			if (playingForward)
				this.timeCursor.style.cssText = `display: block; left: ${fmod(Math.ceil(getXpos(endTime)), width) / width * 100}%;`;
			else
				this.timeCursor.style.cssText = `display: block; right: ${(1 - (fmod(Math.ceil(getXpos(endTime)), width) + 1) / width) * 100}%;`;
		} else
			this.timeCursor.style.cssText = `display: none;`;

		// clear buffer except last sample
		this.drawBuffer = [{ t: endTime, value: this.drawBuffer[bufferLen - 1].value }];
	}
	updateSampleRatio() {
		if (this.audioCtx) {
			let flooredTimeOffset = this.lastFlooredTime - Math.floor(this.sampleRatio * this.audioSample);
			this.sampleRatio = this.sampleRate * this.playSpeed / this.audioCtx.sampleRate;
			this.lastFlooredTime = Math.floor(this.sampleRatio * this.audioSample) - flooredTimeOffset;
			return this.sampleRatio;
		}
	}
	async initAudioContext() {
		this.audioCtx = new AudioContext();
		this.updateSampleRatio();

		await this.audioCtx.audioWorklet.addModule("audioWorklet.js");
		this.audioWorklet = new AudioWorkletNode(this.audioCtx, "bytebeat-processor");
		this.audioWorklet.port.postMessage("test");
		this.audioWorklet.port.onmessage = e => {
			console.info("recieved from processor:", e.data);
			if (e.data.drawBuffer)
				this.drawBuffer = e.data.drawBuffer;
			if (e.data.byteSample)
				this.byteSample = e.data.byteSample;
		};

		const audioGain = this.audioGain = this.audioCtx.createGain();
		this.changeVolume(this.controlVolume);
		this.audioWorklet.connect(audioGain);

		audioGain.connect(this.audioCtx.destination);

		const mediaDest = this.audioCtx.createMediaStreamDestination();
		const audioRecorder = this.audioRecorder = new MediaRecorder(mediaDest.stream);
		audioRecorder.ondataavailable = function (e) {
			this.recordChunks.push(e.data);
		}.bind(this);
		audioRecorder.onstop = function (e) {
			let file, type;
			const types = ["audio/webm", "audio/ogg"];
			const files = ["track.webm", "track.ogg"];
			while ((file = files.pop()) && !MediaRecorder.isTypeSupported(type = types.pop())) {
				if (types.length === 0) {
					console.error("Saving not supported in this browser!");
					break;
				}
			}
			this.saveData(new Blob(this.recordChunks, { type }), file);
		}.bind(this);
		audioGain.connect(mediaDest);
	}
	hideErrorMessage() {
		if (this.errorElem) {
			this.errorElem.innerText = "";

			this.nextErr = null;
			this.nextErrType = null;
			this.errorPriority = -Infinity;
		}
	}
	showErrorMessage(errType, err, priority = 0) {
		if (this.errorElem && priority > this.errorPriority) {
			this.errorElem.dataset.errType = errType;
			this.errorElem.innerText = err.toString();

			this.nextErr = null;
			this.nextErrType = null;
			this.errorPriority = priority;
		}
	}
	initCodeInput() {
		this.errorElem = document.getElementById("error");
		this.inputElem = document.getElementById("input-code");
		this.inputElem.addEventListener("input", this.refreshCalc.bind(this));
		this.inputElem.addEventListener("keydown", (function (e) {
			if (e.keyCode === 9 /* TAB */ && !e.shiftKey && !e.altKey && !e.ctrlKey) {
				e.preventDefault();
				let el = e.target;
				let selectionStart = el.selectionStart;
				el.value = `${el.value.slice(0, selectionStart)}\t${el.value.slice(el.selectionEnd)}`;
				el.setSelectionRange(selectionStart + 1, selectionStart + 1);
				this.refreshCalc();
			}
		}).bind(this));
		if (window.location.hash.startsWith("#v3b64")) {
			let pData;
			try {
				pData = JSON.parse(
					pako.inflateRaw(
						atob(decodeURIComponent(window.location.hash.substr(6))), { to: "string" }
					)
				);
			} catch (err) {
				console.error("Couldn't load data from url:", err);
				pData = null;
			}
			if (pData !== null)
				this.loadCode(pData, false);
		} else if (window.location.hash) {
			console.error("Unrecognized url data");
		}
	}
	initCanvas() {
		this.timeCursor = document.getElementById("canvas-timecursor");
		this.canvasElem = document.getElementById("canvas-main");
		this.canvasCtx = this.canvasElem.getContext("2d", { alpha: false });
	}
	initControls() {
		this.canvasTogglePlay = document.getElementById("canvas-toggleplay");
		this.controlScaleUp = document.getElementById("control-scaleup");
		this.controlScaleDown = document.getElementById("control-scaledown");
		this.controlCounter = document.getElementById("control-counter-value");
		this.controlVolume = document.getElementById("control-volume");
	}
	initLibrary() {
		for (let el of document.getElementsByClassName("toggle"))
			el.onclick = () => $toggle(el.nextElementSibling);
		const libraryElem = document.getElementById("library");
		libraryElem.onclick = function loadLibrary(e) {
			const el = e.target;
			if (el.tagName === "CODE")
				this.loadCode(Object.assign({ code: el.innerText }, el.hasAttribute("data-songdata") ? JSON.parse(el.dataset.songdata) : {}));
			else if (el.classList.contains("code-load")) {
				const xhr = new XMLHttpRequest();
				xhr.onreadystatechange = function () {
					if (xhr.readyState === 4 && xhr.status === 200)
						this.loadCode(Object.assign(JSON.parse(el.dataset.songdata), { code: xhr.responseText }));
				}.bind(this);
				xhr.open("GET", "library/" + el.dataset.codeFile, true);
				xhr.setRequestHeader("Cache-Control", "no-cache, no-store, must-revalidate");
				xhr.send(null);
			}
		}.bind(this);
		libraryElem.onmouseover = function (e) {
			const el = e.target;
			if (el.tagName === "CODE")
				el.title = "Click to play this code";
		};
	}
	loadCode({ code, sampleRate, mode }, start = true) {
		this.inputElem.value = code;
		this.applySampleRate(+sampleRate || 8000);
		this.applyMode(mode || "Bytebeat");
		this.refreshCalc();
		if (start) {
			this.resetTime();
			this.togglePlay(true);
		}
	}
	rec() {
		if (this.audioCtx && !this.isRecording) {
			this.audioRecorder.start();
			this.isRecording = true;
			this.recordChunks = [];
			if (!this.isPlaying)
				this.togglePlay(true);
		}
	}
	refreshCalc() {
		const oldFunc = this.func;
		const codeText = this.inputElem.value;

		// create shortened functions
		const params = Object.getOwnPropertyNames(Math);
		const values = params.map(k => Math[k]);
		params.push("int");
		values.push(Math.floor);

		// test bytebeat
		try {
			this.nextErrType = "compile";
			this.func = new Function(...params, "t", `return 0, ${codeText.trim() || "undefined"} \n;`).bind(window, ...values);
			this.nextErrType = "runtime";
			this.func(0);
		} catch (err) {
			this.func = oldFunc;
			this.showErrorMessage(this.nextErrType, err, 1);
			return;
		}
		this.hideErrorMessage();

		// delete single letter variables to prevent persistent variable errors (covers a good enough range)
		for (let i = 0; i < 26; i++)
			delete window[String.fromCharCode(65 + i)], window[String.fromCharCode(97 + i)];

		// generate url
		let pData = { code: codeText };
		if (this.sampleRate != 8000)
			pData.sampleRate = this.sampleRate;
		if (this.mode != "Bytebeat")
			pData.mode = this.mode;

		pData = JSON.stringify(pData);

		window.location.hash = "#v3b64" + btoa(pako.deflateRaw(pData, { to: "string" }));
	}
	resetTime() {
		this.setByteSample(0);
		this.clearCanvas();
		this.timeCursor.style.cssText = "display: none;";
		if (!this.isPlaying)
			this.canvasTogglePlay.classList.add("canvas-toggleplay-show");
	}
	setByteSample(value, jump = true) {
		this.controlCounter.placeholder = value;
		this.byteSample = value;
		if (jump) {
			this.drawBuffer = [];
			this.drawImageData = null;
			this.audioSample = 0;
			this.lastFlooredTime = -1;
			this.lastValue = NaN;
			this.lastByteValue = NaN;
			this.lastFuncValue = undefined;
		}
	}
	setPlaySpeed(speed) {
		this.playSpeed = speed;
		this.updateSampleRatio();
	}
	setSampleRate(rate) {
		this.sampleRate = rate;
		this.updateSampleRatio();
	}
	setSampleRateDivisor(div) {
		this.sampleRateDivisor = div;
		this.updateSampleRatio();
	}
	handleWindowResize(force = false) {
		let newWidth;
		if (document.body.clientWidth >= 768 + 4)
			newWidth = 1024;
		else
			newWidth = 512;
		if (newWidth != this.canvasElem.width || force) {
			this.canvasElem.width = newWidth;
			document.getElementById("content").style.maxWidth = (newWidth + 4) + "px";
		}
	}
	togglePlay(isPlay) {
		this.canvasTogglePlay.classList.toggle("canvas-toggleplay-stop", isPlay);
		if (isPlay) {
			// Play
			this.canvasTogglePlay.classList.remove("canvas-toggleplay-show");
			if (this.audioCtx?.resume)
				this.audioCtx.resume();
			window.requestAnimationFrame(this.animationFrame);
		} else {
			if (this.isRecording) {
				this.audioRecorder.stop();
				this.isRecording = false;
			}
		}
		this.isPlaying = isPlay;
	}
	animationFrame() {
		this.drawGraphics(this.byteSample);
		if (this.nextErr)
			this.showErrorMessage(this.nextErrType, this.nextErr);

		window.requestAnimationFrame(this.animationFrame);
	}
};

const bytebeat = new Bytebeat();