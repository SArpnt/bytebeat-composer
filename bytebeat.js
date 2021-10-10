function $q(path, root = document.body) {
	return root.querySelector(path);
}

function $Q(path, root = document.body) {
	return root.querySelectorAll(path);
}

function $id(id) {
	return document.getElementById(id);
}

function $toggle(el) {
	if (el.style.display)
		el.style.removeProperty("display");
	else
		el.style.display = "none";
}

function BytebeatClass() {
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
		document.defaultView.addEventListener("resize", this.handleWindowResize.bind(this));
	}.bind(this));
}
BytebeatClass.prototype = {
	get saveData() {
		let a = document.createElement("a");
		document.body.appendChild(a);
		a.style.display = "none";
		let fn = function fn(blob, fileName) {
			url = URL.createObjectURL(blob);
			a.href = url;
			a.download = fileName;
			a.click();
			setTimeout(function revokeSaveDataUrl() {
				window.URL.revokeObjectURL(url);
			});
		};
		Object.defineProperty(this, "saveData", { value: fn });
		return fn;
	},
	applySampleRate: function (rate) {
		this.setSampleRate(rate);
		$id("samplerate-change").value = rate;
	},
	applyMode: function (mode) {
		this.mode = mode;
		$id("mode-change").value = mode;
	},
	changeScale: function (amount) {
		if (amount) {
			this.drawScale = Math.max(this.drawScale + amount, 0);
			this.clearCanvas();
			if (this.drawScale === 0)
				this.controlScaleDown.setAttribute("disabled", true);
			else
				this.controlScaleDown.removeAttribute("disabled");
		}
	},
	changeVolume: function (el) {
		let fraction = parseInt(el.value) / parseInt(el.max);
		// Let's use an x * x curve (x-squared) instead of simple linear (x)
		this.audioGain.gain.value = fraction * fraction;
	},
	clearCanvas: function () {
		this.canvasCtx.clearRect(0, 0, this.canvasElem.width, this.canvasElem.height);
	},
	drawGraphics: function (buffer) {
		if (!buffer.length)
			return;
		let width = this.canvasElem.width;
		let height = this.canvasElem.height;
		let playDir = this.playSpeed > 0 ? 1 : -1;
		let drawArea = playDir * buffer.length;
		
		let mod = (a, b) => ((a % b) + b) % b;
		let drawX = (i = 0, j = 0) => mod(((this.byteSample + i) / (1 << this.drawScale)) + j, width);
		let drawLen = (i = 0, j = 0) => i / (1 << this.drawScale) + j;

		// clear canvas
		if (drawArea >> this.drawScale > width)
			this.canvasCtx.clearRect(0, 0, width, height);
		else {
			let startX = drawX();
			let lenX = drawLen(drawArea);
			let endX = startX + playDir * lenX;
			this.canvasCtx.clearRect(
				(this.playSpeed > 0 ? Math.ceil : Math.floor)(startX),
				0,
				(endX >= 0 && endX < width) ?
					playDir * (Math.ceil(endX) - (this.playSpeed > 0 ? Math.ceil : Math.floor)(startX)) :
					width - Math.floor(startX),
				height
			);
			if (endX < 0 || endX >= width) {
				let startX = this.playSpeed > 0 ? 0 : width;
				this.canvasCtx.clearRect(startX, 0, Math.floor(mod(Math.ceil(endX), width)), height);
			}
		}

		// draw
		let imageData = this.canvasCtx.getImageData(0, 0, width, height);
		for (let i = 0; i < buffer.length; i++) {
			let pos = (width * (255 - buffer[i]) + drawX(playDir * i)) << 2;
			imageData.data[pos++] = imageData.data[pos++] = imageData.data[pos++] = imageData.data[pos] = 255;
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
	func: function () {
		return 0;
	},
	updateSampleRatio: function () {
		if (this.audioCtx) {
			let flooredTimeOffset = this.lastFlooredTime - Math.floor(this.sampleRatio * this.audioSample);
			this.sampleRatio = this.sampleRate * this.playSpeed / this.audioCtx.sampleRate;
			this.lastFlooredTime = Math.floor(this.sampleRatio * this.audioSample) - flooredTimeOffset;
			return this.sampleRatio;
		}
	},
	initAudioContext: function () {
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
			if (!chData.length)
				return;
			let time = this.sampleRatio * this.audioSample;
			let startFlooredTime = this.lastFlooredTime;
			let drawBuffer = [];
			let byteSample = this.byteSample;
			for (let i = 0; i < chData.length; i++) {
				time += this.sampleRatio;
				let flooredTime = Math.floor(time);
				if (!this.isPlaying)
					this.lastValue = 0;
				else if (this.lastFlooredTime != flooredTime) {
					if (flooredTime % this.sampleRateDivisor == 0 || isNaN(this.lastValue)) {
						let roundSample = Math.floor(byteSample / this.sampleRateDivisor) * this.sampleRateDivisor;
						if (this.mode == "Bytebeat") {
							this.lastByteValue = this.func(roundSample) & 255;
							this.lastValue = this.lastByteValue / 127.5 - 1;
						} else if (this.mode == "Signed Bytebeat") {
							this.lastByteValue = (this.func(roundSample) + 128) & 255;
							this.lastValue = this.lastByteValue / 127.5 - 1;
						} else if (this.mode == "Floatbeat") {
							this.lastValue = this.func(roundSample);
							this.lastByteValue = Math.round((this.lastValue + 1) * 127.5);
						}
					}
					drawBuffer.length = Math.abs(flooredTime - startFlooredTime); // TODO: reduce samples added when using sampleRateDivisor
					drawBuffer.fill(this.lastByteValue, Math.abs(this.lastFlooredTime - startFlooredTime));
					byteSample += flooredTime - this.lastFlooredTime;
					this.lastFlooredTime = flooredTime;
				}
				chData[i] = this.lastValue;
			}
			if (this.isPlaying) {
				this.audioSample += chData.length;
				this.drawGraphics(drawBuffer);
				this.setTime(byteSample, false);
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
			let check = (MediaRecorder.isTypeSupported || function (type) {
				return MediaRecorder.canRecordMimeType && MediaRecordercanRecordMimeType(type) === "probably";
			});
			while ((file = files.pop()) && !check(type = types.pop())) {
				if (types.length === 0) {
					console.error("Saving not supported in this browser!");
					break;
				}
			}
			this.saveData(new Blob(this.recChunks, { type: type }), file);
		}.bind(this);
		audioGain.connect(mediaDest);
	},
	initCodeInput: function () {
		this.errorElem = $id("error");
		this.inputElem = $id("input-code");
		this.inputElem.addEventListener("onchange", this.refreshCalc.bind(this));
		this.inputElem.addEventListener("onkeyup", this.refreshCalc.bind(this));
		this.inputElem.addEventListener("input", this.refreshCalc.bind(this));
		this.inputElem.addEventListener("keydown", function (e) {
			if (e.keyCode === 9 /* TAB */ && !e.shiftKey) {
				e.preventDefault();
				let el = e.target;
				let value = el.value;
				let selStart = el.selectionStart;
				el.value = `${value.slice(0, selStart)}\t${value.slice(el.selectionEnd)}`;
				el.setSelectionRange(selStart + 1, selStart + 1);
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
	initCanvas: function () {
		this.timeCursor = $id("canvas-timecursor");
		this.canvasElem = $id("canvas-main");
		this.canvasCtx = this.canvasElem.getContext("2d");
	},
	initControls: function () {
		this.canvasTogglePlay = $id("canvas-toggleplay");
		this.controlScaleUp = $id("control-scaleup");
		this.controlScaleDown = $id("control-scaledown");
		this.controlCounter = $id("control-counter-value");
		this.controlVolume = $id("control-volume");
	},
	initLibrary: function () {
		Array.prototype.forEach.call($Q(".button-toggle"), function (el) {
			el.onclick = function () {
				$toggle(el.nextElementSibling);
			};
		});
		let libraryEl = $q(".container-scroll");
		libraryEl.onclick = function (e) {
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
	loadCode: function ({ code, sampleRate, mode }, start = true) {
		this.inputElem.value = code;
		this.applySampleRate(+sampleRate || 8000);
		this.applyMode(mode || "Bytebeat");
		if (start) {
			this.refreshCalc();
			this.resetTime();
			this.togglePlay(true);
		}
	},
	rec: function () {
		if (this.audioCtx && !this.isRecording) {
			this.audioRecorder.start();
			this.isRecording = true;
			this.recChunks = [];
			if (!this.isPlaying)
				this.togglePlay(true);
		}
	},
	refreshCalc: function () {
		let oldFunc = this.func;
		let codeText = this.inputElem.value;

		// create shortened functions
		let params = Object.getOwnPropertyNames(Math);
		let values = params.map(k => Math[k]);
		params.push("int");
		values.push(Math.floor);

		try {
			bytebeat.func = Function(...params, "t", `return ${codeText}\n;`).bind(window, ...values);
			bytebeat.func(0);
		} catch (err) {
			bytebeat.func = oldFunc;
			bytebeat.errorElem.innerText = err.toString();
			return;
		}
		// delete single letter variables to prevent persistent variable errors (covers a good enough range)
		for (i = 0; i < 26; i++)
			delete window[String.fromCharCode(65 + i)], window[String.fromCharCode(97 + i)];

		this.errorElem.innerText = "";

		let pData = { code: codeText };
		if (this.sampleRate != 8000)
			pData.sampleRate = this.sampleRate;
		if (this.mode != "Bytebeat")
			pData.mode = this.mode;

		pData = JSON.stringify(pData);

		window.location.hash = "#v3b64" + btoa(pako.deflateRaw(pData, { to: "string" }));
	},
	resetTime: function () {
		this.setTime(0);
		this.clearCanvas();
		this.timeCursor.style.cssText = "display: none; left: 0px;";
		if (!this.isPlaying)
			this.canvasTogglePlay.classList.add("canvas-toggleplay-show");
	},
	setTime: function (value, resetAudio = true) {
		this.controlCounter.placeholder = value;
		this.byteSample = value;
		if (resetAudio) {
			this.audioSample = 0;
			this.lastFlooredTime = -1;
			this.lastValue = NaN;
			this.lastByteValue = NaN;
		}
	},
	setPlaySpeed: function (speed) {
		this.playSpeed = speed;
		this.updateSampleRatio();
	},
	setSampleRate: function (rate) {
		this.sampleRate = rate;
		this.updateSampleRatio();
	},
	setSampleRateDivisor: function (div) {
		this.sampleRateDivisor = div;
		this.updateSampleRatio();
	},
	handleWindowResize: function (force = false) {
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
	togglePlay: function (isPlay) {
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

let bytebeat = new BytebeatClass();