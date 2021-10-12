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
	this.lastValue = NaN;
	this.lastByteValue = NaN;
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
		this.canvasCtx.clearRect(0, 0, this.canvasElem.width, this.canvasElem.height);
	},
	drawGraphics(buffer) {
		let bufferLen = buffer.length;
		if (!bufferLen)
			return;
		buffer.push({ t: buffer.samples });
		let width = this.canvasElem.width;
		let height = this.canvasElem.height;
		let playDir = this.playSpeed > 0 ? 1 : -1;
		let drawArea = playDir * buffer.samples;

		let mod = (a, b) => ((a % b) + b) % b;
		let drawX = (i = 0, j = 0) => mod(((this.byteSample + i) / (1 << this.drawScale)) + j, width);
		let drawLen = (i = 0, j = 0) => i / (1 << this.drawScale) + j;

		// clear canvas
		if (drawArea >> this.drawScale > width)
			this.canvasCtx.clearRect(0, 0, width, height);
		else {
			let startX = drawX();
			let lenX = drawLen(drawArea);
			let endX = startX + lenX;
			let drawStartX = (this.playSpeed > 0 ? Math.ceil : Math.floor)(startX);
			if (endX < 0 || endX >= width) {
				let a = () => 0;
				a();
			}
			this.canvasCtx.clearRect(
				drawStartX,
				0,
				(endX >= 0) ?
					(endX < width) ?
						Math.ceil(endX) - drawStartX :
						width - Math.floor(startX) :
					-Math.floor(startX),
				height
			);
			if (endX < 0 || endX >= width) {
				let drawStartX = this.playSpeed > 0 ? 0 : width;
				this.canvasCtx.clearRect(
					drawStartX,
					0,
					Math.floor(mod(Math.ceil(endX), width)) - drawStartX,
					height
				);
			}
		}

		// draw
		let imageData = this.canvasCtx.getImageData(0, 0, width, height);
		for (let i = 0; i < bufferLen; i++) {
			if (isNaN(buffer[i].value)) {
				let endX = Math.ceil(drawX(playDir * (buffer[i + 1].t - this.byteSample))) % width;
				for (let xPos = Math.floor(drawX(playDir * (buffer[i].t - this.byteSample))); xPos < endX; xPos = (xPos + 1) % width)
					for (let h = 0; h < 256; h++) {
						let pos = (width * h + xPos) << 2;
						imageData.data[pos] = 128;
						imageData.data[pos + 3] = 255;
					}
			} else if (buffer[i].value >= 0 && buffer[i].value < 256) {
				let endX = Math.ceil(drawX(playDir * (buffer[i + 1].t - this.byteSample))) % width;
				for (let xPos = Math.floor(drawX(playDir * (buffer[i].t - this.byteSample))); xPos != endX; xPos = (xPos + 1) % width) {
					let pos = (width * (255 - buffer[i].value) + xPos) << 2;
					imageData.data[pos++] = imageData.data[pos++] = imageData.data[pos++] = imageData.data[pos] = 255;
				}
			}
		}
		this.canvasCtx.putImageData(imageData, 0, 0);

		// cursor
		if (this.sampleRate >> this.drawScale < 3950) {
			if (this.playSpeed > 0) {
				this.timeCursor.style.left = Math.ceil(drawX(drawArea)) / width * 100 + "%";
				this.timeCursor.style.removeProperty("right");
			} else {
				this.timeCursor.style.removeProperty("left");
				this.timeCursor.style.right = (1 - Math.ceil(drawX(drawArea, 1)) / width) * 100 + "%";
			}
			this.timeCursor.style.display = "block";
		} else
			this.timeCursor.style.display = "none";
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
			performance.clearMarks();
			window.performance.mark("start stuff");
			let time = this.sampleRatio * this.audioSample;
			//let startFlooredTime = this.lastFlooredTime;
			let drawBuffer = []; // TODO: reduce samples added when using sampleRateDivisor
			drawBuffer.samples = this.sampleRatio * chDataLen;
			let byteSample = this.byteSample;
			for (let i = 0; i < chDataLen; i++) {
				window.performance.mark("startLoop");
				time += this.sampleRatio;
				let flooredTime = Math.floor(time);
				if (this.lastFlooredTime != flooredTime) {
					if (flooredTime % this.sampleRateDivisor == 0 || isNaN(this.lastValue)) { // TODO: proper sampleRateDivisor check for when skipping over values (check if range between lastFlooredTime and flooredTime contains correct value)
						let roundSample = Math.floor(byteSample / this.sampleRateDivisor) * this.sampleRateDivisor;
						let funcValue;
						window.performance.mark("calcFuncValue");
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
						window.performance.mark("calculateValues");
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
						window.performance.mark("startDrawBuffer");
						drawBuffer.push({ t: flooredTime, value: this.lastByteValue });
						window.performance.mark("finishDrawBuffer");
						byteSample += flooredTime - this.lastFlooredTime;
						this.lastFlooredTime = flooredTime;
					}
				}
				chData[i] = this.lastValue;
				window.performance.mark("endLoop");
			}
			if (this.isPlaying) {
				this.audioSample += chDataLen;
				window.performance.mark("start graphics");
				this.drawGraphics(drawBuffer);
				window.performance.mark("finish graphics");
				this.setByteSample(byteSample, false);
			}
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
		this.canvasCtx = this.canvasElem.getContext("2d");
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
		this.timeCursor.style.cssText = "display: none; left: 0px;";
		if (!this.isPlaying)
			this.canvasTogglePlay.classList.add("canvas-toggleplay-show");
	},
	setByteSample(value, resetAudio = true) {
		this.controlCounter.placeholder = value;
		this.byteSample = value;
		if (resetAudio) {
			this.audioSample = 0;
			this.lastFlooredTime = -1;
			this.lastValue = NaN;
			this.lastByteValue = NaN;
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