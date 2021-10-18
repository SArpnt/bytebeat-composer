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

		this.nextErrType = null;
		this.nextErr = null;
		this.errorPriority = -Infinity;

		this.canvasCtx = null;
		this.drawScale = 5;
		this.drawBuffer = [];
		this.byteSample = 0;
		this.drawImageData = null;

		this.isPlaying = false;
		this.isRecording = false;

		this.mode = "Bytebeat";
		this.sampleRate = 8000;
		this.playSpeed = 1;

		this.canvasElem = null;
		this.inputElem = null;
		this.errorElem = null;

		this.animationFrame = this.animationFrame.bind(this);
		document.addEventListener("DOMContentLoaded", async () => {
			const initAudioPromise = this.initAudioContext();
			this.initLibrary();
			let pData = this.initCodeInput();
			this.initControls();
			this.initCanvas();

			this.handleWindowResize(true);
			document.defaultView.addEventListener("resize", this.handleWindowResize.bind(this, false));

			await initAudioPromise;
			this.changeVolume(this.controlVolume);
			if (pData !== null)
				this.loadCode(pData, false, false);
			this.refreshCalc();
		});
	}

	async initAudioContext() {
		this.audioCtx = new AudioContext();

		const addModulePromise = this.audioCtx.audioWorklet.addModule("audioWorklet.js");

		this.audioGain = this.audioCtx.createGain();
		this.audioGain.connect(this.audioCtx.destination);

		const mediaDest = this.audioCtx.createMediaStreamDestination();
		this.audioRecorder = new MediaRecorder(mediaDest.stream);
		this.audioRecorder.ondataavailable = e => this.recordChunks.push(e.data);
		this.audioRecorder.onstop = (function saveRecording(e) {
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
		}).bind(this);
		this.audioGain.connect(mediaDest);

		await addModulePromise;
		this.audioWorklet = new AudioWorkletNode(this.audioCtx, "bytebeat-processor");
		this.audioWorklet.port.addEventListener("message", this.messageHandler.bind(this));
		this.audioWorklet.port.start();
		this.audioWorklet.connect(this.audioGain);
	}
	messageHandler(e) {
		const data = e.data;
		if (data.drawBuffer === undefined)
			console.info("worklet -> window:", data);
		if (data.clearCanvas) {
			this.drawBuffer = [];
			this.drawImageData = null;
		}

		if (data.drawBuffer !== undefined)
			this.drawBuffer = this.drawBuffer.concat(data.drawBuffer);
		if (data.byteSample !== undefined) {
			this.setByteSample(data.byteSample, false, false);
			this.byteSample = data.byteSample;
		}

		if (data.generateUrl)
			this.generateUrl();
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

	initLibrary() {
		for (let el of document.getElementsByClassName("toggle"))
			el.addEventListener("click", () => $toggle(el.nextElementSibling));
		const libraryElem = document.getElementById("library");
		libraryElem.addEventListener("click", e => {
			const el = e.target;
			if (el.tagName === "CODE")
				this.loadCode(Object.assign({ code: el.innerText }, el.hasAttribute("data-songdata") ? JSON.parse(el.dataset.songdata) : {}));
			else if (el.classList.contains("code-load")) {
				const xhr = new XMLHttpRequest();
				xhr.onreadystatechange = () => {
					if (xhr.readyState === 4 && xhr.status === 200)
						this.loadCode(Object.assign(JSON.parse(el.dataset.songdata), { code: xhr.responseText }));
				};
				xhr.open("GET", "library/" + el.dataset.codeFile, true);
				xhr.setRequestHeader("Cache-Control", "no-cache, no-store, must-revalidate");
				xhr.send(null);
			}
		});
		libraryElem.addEventListener("mouseover", e => {
			const el = e.target;
			if (el.tagName === "CODE")
				el.title = "Click to play this code";
		});
	}

	initCodeInput() {
		this.errorElem = document.getElementById("error");
		this.inputElem = document.getElementById("input-code");
		this.inputElem.addEventListener("input", this.refreshCalc.bind(this));
		this.inputElem.addEventListener("keydown", e => {
			if (e.code === 9 /* TAB */ && !e.shiftKey && !e.altKey && !e.ctrlKey) {
				e.preventDefault();
				let el = e.target;
				let selectionStart = el.selectionStart;
				el.value = `${el.value.slice(0, selectionStart)}\t${el.value.slice(el.selectionEnd)}`;
				el.setSelectionRange(selectionStart + 1, selectionStart + 1);
				this.refreshCalc();
			}
		});
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
			return pData;
		} else if (window.location.hash) {
			console.error("Unrecognized url data");
		}
		return null;
	}

	initControls() {
		this.controlScaleUp = document.getElementById("control-scaleup");
		this.controlScaleDown = document.getElementById("control-scaledown");
		this.controlCounter = document.getElementById("control-counter-value");
		this.controlVolume = document.getElementById("control-volume");

		this.canvasTogglePlay = document.getElementById("canvas-toggleplay");
	}
	initCanvas() {
		this.timeCursor = document.getElementById("canvas-timecursor");
		this.canvasElem = document.getElementById("canvas-main");
		this.canvasCtx = this.canvasElem.getContext("2d", { alpha: false });
	}

	refreshCalc() {
		const codeText = this.inputElem.value;

		this.audioWorklet.port.postMessage({
			codeText: codeText.trim(),
		});
	}
	generateUrl() {
		const codeText = this.inputElem.value;

		let pData = { code: codeText };
		if (this.sampleRate != 8000)
			pData.sampleRate = this.sampleRate;
		if (this.mode != "Bytebeat")
			pData.mode = this.mode;

		pData = JSON.stringify(pData);

		window.location.hash = "#v3b64" + btoa(pako.deflateRaw(pData, { to: "string" }));
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
	animationFrame() {
		this.drawGraphics(this.byteSample);
		if (this.nextErr)
			this.showErrorMessage(this.nextErrType, this.nextErr);

		window.requestAnimationFrame(this.animationFrame);
	}

	loadCode({ code, sampleRate, mode }, calc = true, play = true) {
		this.inputElem.value = code;
		this.applySampleRate(+sampleRate || 8000);
		this.applyMode(mode || "Bytebeat");
		if (calc)
			this.refreshCalc();
		if (play) {
			this.resetTime();
			this.togglePlay(true);
		}
	}
	applySampleRate(rate) {
		this.setSampleRate(rate);
		document.getElementById("control-samplerate").value = rate;
	}
	applyMode(mode) {
		this.mode = document.getElementById("control-mode").value = mode;
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
			const iterateOverLine = (bufferElem, nextBufferElemTime, callback) => {
				const startX = fmod(Math.floor(getXpos(playingForward ? bufferElem.t : nextBufferElemTime + 1)) - imagePos, width);
				const endX = fmod(Math.ceil(getXpos(playingForward ? nextBufferElemTime : bufferElem.t + 1)) - imagePos, width);
				for (let xPos = startX; xPos != endX; xPos = fmod(xPos + 1, width))
					callback(xPos);
			};

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

	resetTime() {
		this.setByteSample(0);
		this.clearCanvas();
		this.timeCursor.style.cssText = "display: none;";
		if (!this.isPlaying)
			this.canvasTogglePlay.classList.add("canvas-toggleplay-show");
	}
	setByteSample(value, send = true, jump = true) {
		this.controlCounter.placeholder = value;
		this.byteSample = value;
		if (send)
			this.audioWorklet.port.postMessage({ setByteSample: [value, jump] });
	}
	setPlaySpeed(playSpeed) {
		this.playSpeed = playSpeed;
		this.audioWorklet.port.postMessage({ playSpeed });
	}
	setSampleRate(sampleRate) {
		this.sampleRate = sampleRate;
		this.audioWorklet.port.postMessage({ sampleRate });
	}
	setSampleRateDivisor(sampleRateDivisor) {
		this.audioWorklet.port.postMessage({ sampleRateDivisor });
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
		this.audioWorklet.port.postMessage({ isPlaying: isPlay });
	}
};

const bytebeat = new Bytebeat();