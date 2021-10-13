function $toggle(el) {
	if (el.style.display)
		el.style.removeProperty("display");
	else
		el.style.display = "none";
}

function Bytebeat() {
	this.audioCtx = null;
	this.audioGain = null;
	this.audioRecorder = null;
	this.recChunks = [];
	this.bufferSize = 2048;

	this.audioSample = 0;
	this.lastFlooredTime = -1;
	this.byteSample = 0;
	this.drawBuffer = [];
	this.lastValue = NaN;
	this.lastByteValue = NaN;
	this.lastFuncValue = null;
	this.func = () => 0;
	this.audioAnimationFrame = null;

	this.canvasCtx = null;
	this.drawScale = 5;

	this.isPlaying = false;
	this.isRecording = false;

	this.mode = "Bytebeat";
	this.sampleRate = 8000;
	this.sampleRateDivisor = 1;
	this.playSpeed = 1;
	this.sampleRatio = 1;

	this.canvasElem = null;
	this.contFixedElem = null;
	this.contScrollElem = null;
	this.inputElem = null;
	this.errorElem = null;

	document.addEventListener("DOMContentLoaded", function () {
		this.contFixedElem = $q(".container-fixed");
		this.contScrollElem = $q(".container-scroll");

		this.initLibrary();
		this.initCodeInput();
		this.initControls();
		this.initCanvas();
		this.refreshCalc();
		this.initAudioContext();

		this.handleWindowResize(true);
		document.defaultView.addEventListener("resize", this.handleWindowResize.bind(this, false));
	}.bind(this));
}
Bytebeat.prototype = {
	get saveData() {
		let a = document.createElement("a");
		document.body.appendChild(a);
		a.style.display = "none";
		let fn = function fn(blob, fileName) {
			url = URL.createObjectURL(blob);
			a.href = url;
			a.download = fileName;
			a.click();
			setTimeout(() => window.URL.revokeObjectURL(url));
		};
		Object.defineProperty(this, "saveData", { value: fn });
		return fn;
	},
	applySampleRate(rate) {
		this.setSampleRate(rate);
		$id("samplerate-change").value = rate;
	},
	applyMode(mode) {
		this.mode = mode;
		$id("mode-change").value = mode;
	},
	changeScale(amount) {
		if (amount) {
			this.drawScale = Math.max(this.drawScale + amount, 0);
			this.clearCanvas();
			if (this.drawScale === 0)
				this.controlScaleDown.setAttribute("disabled", true);
			else
				this.controlScaleDown.removeAttribute("disabled");
		}
	},
	changeVolume(el) {
		let fraction = parseInt(el.value) / parseInt(el.max);
		this.audioGain.gain.value = fraction * fraction;
	},
	clearCanvas() {
		this.canvasCtx.fillRect(0, 0, this.canvasElem.width, this.canvasElem.height);
	},
	drawGraphics(endTime) {
		let bufferLen = this.drawBuffer.length;
		if (!bufferLen)
			return;
		performance.mark('init');
		//let playDir = this.playSpeed > 0 ? 1 : -1;
		let
			width = this.canvasElem.width,
			height = this.canvasElem.height;
		let
			startTime = this.drawBuffer[0].t,
			lenTime = endTime - startTime;

		const
			fmod = (a, b) => ((a % b) + b) % b,
			getXpos = t => t / (1 << this.drawScale),
			roundForward = (this.playSpeed > 0 ? Math.ceil : Math.floor);
			//roundBackward = (this.playSpeed > 0 ? Math.floor : Math.ceil);

		let startXPos = fmod(getXpos(startTime), width); // in canvas bounds
		let endXPos = startXPos + getXpos(lenTime); // relative to startXPos, can be outside canvas bounds

		// clear canvas
		performance.mark('clear');
		if (lenTime >> this.drawScale > width)
			this.canvasCtx.fillRect(0, 0, width, height);
		else {
			let clearStartX = roundForward(startXPos);
			let clearEndX = roundForward(endXPos);
			this.canvasCtx.fillRect(
				clearStartX,
				0,
				(clearEndX > 0) ? // if equal default to overflow, since it's faster to calculate
					(clearEndX < width) ?
					clearEndX - clearStartX :
						width - clearStartX :
					-clearStartX,
				height
			);
			if (clearEndX < 0 || clearEndX >= width) {
				let drawStartX = this.playSpeed > 0 ? 0 : width;
				this.canvasCtx.fillRect(
					drawStartX,
					0,
					fmod(clearEndX, width) - drawStartX,
					height
				);
			}
		}

		{
			let drawStartX = Math.floor(startXPos);
			let drawEndX = Math.floor(endXPos);
			let drawLenX = Math.abs(drawEndX - drawStartX) + 1;
			let imagePos = Math.min(drawStartX, drawEndX);
			// create imageData
			performance.mark('createData');
			let dataCanvas = new OffscreenCanvas(drawLenX, height); // TODO: store column of imageData instead of relying on transparency
			let dataContext = dataCanvas.getContext('2d');
			let imageData = dataContext.createImageData(drawLenX, height);
			// draw
			performance.mark('draw');
			for (let i = 0; i < bufferLen; i++) {
				let bufferElem = this.drawBuffer[i];
				let nextBufferElemTime = this.drawBuffer[i + 1]?.t || endTime;
				if (isNaN(bufferElem.value)) {
					let startX = fmod(Math.floor(getXpos(bufferElem.t) - imagePos), width);
					let endX = fmod(Math.floor(getXpos(nextBufferElemTime) - imagePos + 1), width);
					for (let xPos = startX; xPos != endX; xPos = fmod(xPos + 1, width))
						for (let h = 0; h < 256; h++) {
							let pos = (drawLenX * h + xPos) << 2;
							imageData.data[pos] = 128;
							imageData.data[pos + 3] = 255;
						}
				} else if (bufferElem.value >= 0 && bufferElem.value < 256) {
					let startX = fmod(Math.floor(getXpos(bufferElem.t) - imagePos), width);
					let endX = fmod(Math.floor(getXpos(nextBufferElemTime) - imagePos + 1), width);
					for (let xPos = startX; xPos != endX; xPos = fmod(xPos + 1, width)) {
						let pos = (drawLenX * (255 - bufferElem.value) + xPos) << 2;
						imageData.data[pos++] = imageData.data[pos++] = imageData.data[pos++] = imageData.data[pos] = 255;
					}
				}
			}
			// put imageData
			performance.mark('putData');
			dataContext.putImageData(imageData, 0, 0);
			this.canvasCtx.drawImage(dataCanvas, imagePos, 0);
			if (endXPos < 0 || endXPos >= width)
				this.canvasCtx.drawImage(dataCanvas, imagePos - width, 0);
		}

		// cursor
		performance.mark('cursor');
		if (this.sampleRate >> this.drawScale < 3950) {
			if (this.playSpeed > 0)
				this.timeCursor.style.cssText = `display: block; left: ${fmod(Math.ceil(getXpos(endTime)), width) / width * 100}%;`;
			else
				this.timeCursor.style.cssText = `display: block; right: ${(1 - (fmod(Math.ceil(getXpos(endTime)), width) + 1) / width) * 100}%;`;
		} else
			this.timeCursor.style.cssText = `display: none;`;

		// clear buffer except last sample
		performance.mark('clearBuffer');
		this.drawBuffer = [{ t: endTime, value: this.drawBuffer[bufferLen - 1].value }];
		performance.mark('finish');

		performance.measure('init', 'init', 'clear');
		performance.measure('clear', 'clear', 'createData');
		performance.measure('createData', 'createData', 'draw');
		performance.measure('draw', 'draw', 'putData');
		performance.measure('putData', 'putData', 'cursor');
		performance.measure('cursor', 'cursor', 'clearBuffer');
		performance.measure('clearBuffer', 'clearBuffer', 'finish');
		performance.measure('total', 'init', 'finish');
	},
	updateSampleRatio() {
		if (this.audioCtx) {
			let flooredTimeOffset = this.lastFlooredTime - Math.floor(this.sampleRatio * this.audioSample);
			this.sampleRatio = this.sampleRate * this.playSpeed / this.audioCtx.sampleRate;
			this.lastFlooredTime = Math.floor(this.sampleRatio * this.audioSample) - flooredTimeOffset;
			return this.sampleRatio;
		}
	},
	initAudioContext() {
		this.audioCtx = new (window.AudioContext || window.webkitAudioContext ||
			window.mozAudioContext || window.oAudioContext || window.msAudioContext)();
		if (!this.audioCtx.createGain)
			this.audioCtx.createGain = this.audioCtx.createGainNode;
		if (!this.audioCtx.createDelay)
			this.audioCtx.createDelay = this.audioCtx.createDelayNode;
		if (!this.audioCtx.createScriptProcessor)
			this.audioCtx.createScriptProcessor = this.audioCtx.createJavaScriptNode;
		this.updateSampleRatio();
		let processor = this.audioCtx.createScriptProcessor(this.bufferSize, 1, 1);
		processor.onaudioprocess = function (e) {
			let chData = e.outputBuffer.getChannelData(0);
			let chDataLen = chData.length; // for performance
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
				let flooredTime = Math.floor(time);
				if (this.lastFlooredTime != flooredTime) {
					if (flooredTime % this.sampleRateDivisor == 0 || isNaN(this.lastValue)) { // TODO: proper sampleRateDivisor check for when skipping over values (check if range between lastFlooredTime and flooredTime contains correct value)
						let roundSample = Math.floor(byteSample / this.sampleRateDivisor) * this.sampleRateDivisor;
						let funcValue;
						try {
							funcValue = this.func(roundSample);
						} catch (err) {
							if (!this.audioAnimationFrame) {
								this.audioAnimationFrame = window.requestAnimationFrame(function showRuntimeErr() {
									this.errorElem.dataset.errType = "runtime";
									this.errorElem.innerText = err.toString();
									this.audioAnimationFrame = null;
								}.bind(this));
								this.lastByteValue = this.lastValue = funcValue = NaN;
							}
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
				}
				chData[i] = this.lastValue;
			}
			this.audioSample += chDataLen;
			this.setByteSample(byteSample, false);
			this.drawGraphics(byteSample);
		}.bind(this);
		let audioGain = this.audioGain = this.audioCtx.createGain();
		this.changeVolume(this.controlVolume);
		processor.connect(audioGain);
		audioGain.connect(this.audioCtx.destination);

		let mediaDest = this.audioCtx.createMediaStreamDestination();
		let audioRecorder = this.audioRecorder = new MediaRecorder(mediaDest.stream);
		audioRecorder.ondataavailable = function (e) {
			this.recChunks.push(e.data);
		}.bind(this);
		audioRecorder.onstop = function (e) {
			let file, type;
			let types = ["audio/webm", "audio/ogg"];
			let files = ["track.webm", "track.ogg"];
			while ((file = files.pop()) && !MediaRecorder.isTypeSupported(type = types.pop())) {
				if (types.length === 0) {
					console.error("Saving not supported in this browser!");
					break;
				}
			}
			this.saveData(new Blob(this.recChunks, { type }), file);
		}.bind(this);
		audioGain.connect(mediaDest);
	},
	initCodeInput() {
		this.errorElem = $id("error");
		this.inputElem = $id("input-code");
		this.inputElem.addEventListener("onchange", this.refreshCalc.bind(this));
		this.inputElem.addEventListener("onkeyup", this.refreshCalc.bind(this));
		this.inputElem.addEventListener("input", this.refreshCalc.bind(this));
		this.inputElem.addEventListener("keydown", function (e) {
			if (e.keyCode === 9 /* TAB */ && !e.shiftKey) {
				e.preventDefault();
				let el = e.target;
				el.value = `${el.value.slice(0, el.selectionStart)}\t${el.value.slice(el.selectionEnd)}`;
				el.setSelectionRange(el.selectionStart + 1, el.selectionStart + 1);
			}
		});
		if (window.location.hash.indexOf("#b64") === 0) {
			this.inputElem.value = pako.inflateRaw(
				atob(decodeURIComponent(window.location.hash.substr(4))), { to: "string" }
			) + ";";
		} else if (window.location.hash.indexOf("#v3b64") === 0) {
			let pData = pako.inflateRaw(
				atob(decodeURIComponent(window.location.hash.substr(6))), { to: "string" }
			);
			try {
				pData = JSON.parse(pData);
			} catch (err) {
				console.error("Couldn't load data from url:", err);
			}
			this.loadCode(pData, false);
		}
	},
	initCanvas() {
		this.timeCursor = $id("canvas-timecursor");
		this.canvasElem = $id("canvas-main");
		this.canvasCtx = this.canvasElem.getContext("2d", { alpha: false });
	},
	initControls() {
		this.canvasTogglePlay = $id("canvas-toggleplay");
		this.controlScaleUp = $id("control-scaleup");
		this.controlScaleDown = $id("control-scaledown");
		this.controlCounter = $id("control-counter-value");
		this.controlVolume = $id("control-volume");
	},
	initLibrary() {
		$Q(".button-toggle").forEach(el => (el.onclick = () => $toggle(el.nextElementSibling)));
		let libraryEl = $q(".container-scroll");
		libraryEl.onclick = function loadLibrary(e) {
			let el = e.target;
			if (el.tagName === "CODE")
				this.loadCode(Object.assign({ code: el.innerText }, JSON.parse(el.dataset.songdata)));
			else if (el.classList.contains("code-load")) {
				let xhr = new XMLHttpRequest();
				xhr.onreadystatechange = function () {
					if (xhr.readyState === 4 && xhr.status === 200)
						this.loadCode(Object.assign(JSON.parse(el.dataset.songdata), { code: xhr.responseText }));
				}.bind(this);
				xhr.open("GET", "library/" + el.dataset.codeFile, true);
				xhr.setRequestHeader("Cache-Control", "no-cache, no-store, must-revalidate");
				xhr.send(null);
			}
		}.bind(this);
		libraryEl.onmouseover = function (e) {
			let el = e.target;
			if (el.tagName === "CODE")
				el.title = "Click to play this code";
		};
	},
	loadCode({ code, sampleRate, mode }, start = true) {
		this.inputElem.value = code;
		this.applySampleRate(+sampleRate || 8000);
		this.applyMode(mode || "Bytebeat");
		if (start) {
			this.refreshCalc();
			this.resetTime();
			this.togglePlay(true);
		}
	},
	rec() {
		if (this.audioCtx && !this.isRecording) {
			this.audioRecorder.start();
			this.isRecording = true;
			this.recChunks = [];
			if (!this.isPlaying)
				this.togglePlay(true);
		}
	},
	refreshCalc() {
		let oldFunc = this.func;
		let codeText = this.inputElem.value;

		// create shortened functions
		let params = Object.getOwnPropertyNames(Math);
		let values = params.map(k => Math[k]);
		params.push("int");
		values.push(Math.floor);

		try {
			this.errorElem.dataset.errType = "compile";
			this.func = new Function(...params, "t", `return ${codeText.trim()}\n;`).bind(window, ...values);
			this.errorElem.dataset.errType = "runtime";
			this.func(0);
		} catch (err) {
			this.func = oldFunc;
			this.errorElem.innerText = err.toString();
			return;
		}
		cancelAnimationFrame(this.audioAnimationFrame);
		this.audioAnimationFrame = null;
		if (this.errorElem)
			this.errorElem.innerText = "";

		// delete single letter variables to prevent persistent variable errors (covers a good enough range)
		for (i = 0; i < 26; i++)
			delete window[String.fromCharCode(65 + i)], window[String.fromCharCode(97 + i)];

		let pData = { code: codeText };
		if (this.sampleRate != 8000)
			pData.sampleRate = this.sampleRate;
		if (this.mode != "Bytebeat")
			pData.mode = this.mode;

		pData = JSON.stringify(pData);

		window.location.hash = "#v3b64" + btoa(pako.deflateRaw(pData, { to: "string" }));
	},
	resetTime() {
		this.setByteSample(0);
		this.clearCanvas();
		this.timeCursor.style.cssText = "display: none;";
		if (!this.isPlaying)
			this.canvasTogglePlay.classList.add("canvas-toggleplay-show");
	},
	setByteSample(value, jump = true) {
		this.controlCounter.placeholder = value;
		this.byteSample = value;
		if (jump) {
			this.drawBuffer = [];
			this.audioSample = 0;
			this.lastFlooredTime = -1;
			this.lastValue = NaN;
			this.lastByteValue = NaN;
			this.lastFuncValue = undefined;
		}
	},
	setPlaySpeed(speed) {
		this.playSpeed = speed;
		this.updateSampleRatio();
	},
	setSampleRate(rate) {
		this.sampleRate = rate;
		this.updateSampleRatio();
	},
	setSampleRateDivisor(div) {
		this.sampleRateDivisor = div;
		this.updateSampleRatio();
	},
	handleWindowResize(force = false) {
		let newWidth;
		if (document.body.clientWidth >= 768 + 4)
			newWidth = 1024;
		else
			newWidth = 512;
		if (newWidth != this.canvasElem.width || force) {
			this.canvasElem.width = newWidth;
			this.canvasElem.style.maxWidth = newWidth + "px";
			$q(".content").style.maxWidth = (newWidth + 4) + "px";
		}

		if (this.contScrollElem)
			this.contScrollElem.style.height = (document.body.clientHeight - this.contFixedElem.offsetHeight) + "px";
	},
	togglePlay(isPlay) {
		this.canvasTogglePlay.classList.toggle("canvas-toggleplay-stop", isPlay);
		if (isPlay) {
			// Play
			this.canvasTogglePlay.classList.remove("canvas-toggleplay-show");
			if (this.audioCtx.resume)
				this.audioCtx.resume();
			if (!this.isPlaying)
				this.isPlaying = true;
			return;
		}
		// Stop
		if (this.isRecording) {
			this.audioRecorder.stop();
			this.isRecording = false;
		}
		this.isPlaying = false;
	}
};

const bytebeat = new Bytebeat();