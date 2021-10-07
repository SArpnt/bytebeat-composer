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
		el.style.removeProperty('display');
	else
		el.style.display = 'none';
}

function BytebeatClass() {
	this.audioCtx = null;
	this.audioGain = null;
	this.audioRecorder = null;
	this.bufferSize = 2048;
	this.canvCtx = null;
	this.canvEl = null;
	this.canvHeight = 0;
	this.canvWidth = 0;
	this.contFixedEl = null;
	this.contScrollEl = null;
	this.errorEl = null;
	this.imageData = null;
	this.isPlaying = false;
	this.isRecording = false;
	this.mode = "bytebeat";
	this.pageIdx = 0;
	this.recChunks = [];
	this.sampleRate = 8000;
	this.sampleRateDivisor = 1;
	this.sampleRatio = 1;
	this.scaleMax = 10;
	this.scale = 6;
	this.time = 0;
	document.addEventListener('DOMContentLoaded', function () {
		this.contScrollEl = $q('.container-scroll');
		this.contFixedEl = $q('.container-fixed');
		this.setScrollHeight();
		document.defaultView.addEventListener('resize', this.setScrollHeight);
		this.initLibrary();
		this.initCodeInput();
		this.initControls();
		this.initCanvas();
		this.refeshCalc();
		this.initAudioContext();
	}.bind(this));
}
BytebeatClass.prototype = {
	get saveData() {
		let a = document.createElement('a');
		document.body.appendChild(a);
		a.style.display = 'none';
		let fn = function fn(blob, fileName) {
			url = URL.createObjectURL(blob);
			a.href = url;
			a.download = fileName;
			a.click();
			setTimeout(function revokeSaveDataUrl() {
				window.URL.revokeObjectURL(url);
			});
		};
		Object.defineProperty(this, 'saveData', { value: fn });
		return fn;
	},
	applySampleRate: function (rate) {
		this.setSampleRate(rate);
		$id('samplerate-change').value = rate;
	},
	changeScale: function (isIncrement) {
		if (!isIncrement && this.scale > 0 || isIncrement && this.scale < this.scaleMax) {
			this.scale += isIncrement ? 1 : -1;
			this.pageIdx = 0;
			this.clearCanvas();
			if (this.scale === 0)
				this.controlScaleDown.setAttribute('disabled', true);
			else if (this.scale === this.scaleMax)
				this.controlScaleUp.setAttribute('disabled', true);
			else {
				this.controlScaleDown.removeAttribute('disabled');
				this.controlScaleUp.removeAttribute('disabled');
			}
			this.toggleCursor();
		}
	},
	changeVolume: function (el) {
		let fraction = parseInt(el.value) / parseInt(el.max);
		// Let's use an x * x curve (x-squared) instead of simple linear (x)
		this.audioGain.gain.value = fraction * fraction;
	},
	clearCanvas: function () {
		this.canvCtx.clearRect(0, 0, this.canvWidth, this.canvHeight);
		this.imageData = this.canvCtx.getImageData(0, 0, this.canvWidth, this.canvHeight);
	},
	// "| 0" is Math.floor but faster, ">> 2" is "/ 4", "<< 2" is "* 4"
	drawGraphics: function (buffer) {
		let width = this.canvWidth;
		let height = this.canvHeight;
		let scale = this.scale;
		let pageWidth = width >> scale;
		// let pageWidth = width * this.sampleRatio / (2 ** scale);
		let pageIdx = this.pageIdx;
		this.canvCtx.clearRect(pageWidth * pageIdx, 0, pageWidth, height);
		this.imageData = this.canvCtx.getImageData(0, 0, width, height);
		let imageData = this.imageData.data;
		let bufLen = buffer.length;
		for (let i = 0; i < bufLen; i++) {
			let pos = (width * (255 - buffer[i]) + pageWidth * (pageIdx + i / bufLen)) << 2;
			imageData[pos++] = imageData[pos++] = imageData[pos++] = imageData[pos] = 255;
		}
		this.canvCtx.putImageData(this.imageData, 0, 0);
		this.pageIdx = pageIdx === (1 << scale) - 1 ? 0 : pageIdx + 1;
		// this.pageIdx = pageIdx === (((2 ** scale) / this.sampleRatio) | 0) - 1 ? 0 : pageIdx + 1;
		if (this.scale > 3)
			this.timeCursor.style.left = pageWidth * this.pageIdx + 'px';
	},
	func: function () {
		return 0;
	},
	initAudioContext: function () {
		let audioCtx = this.audioCtx = new (window.AudioContext || window.webkitAudioContext ||
			window.mozAudioContext || window.oAudioContext || window.msAudioContext)();
		if (!audioCtx.createGain)
			audioCtx.createGain = audioCtx.createGainNode;
		if (!audioCtx.createDelay)
			audioCtx.createDelay = audioCtx.createDelayNode;
		if (!audioCtx.createScriptProcessor)
			audioCtx.createScriptProcessor = audioCtx.createJavaScriptNode;
		this.sampleRatio = this.sampleRate / this.sampleRateDivisor / audioCtx.sampleRate;
		let processor = audioCtx.createScriptProcessor(this.bufferSize, 1, 1);
		processor.onaudioprocess = function (e) {
			let chData = e.outputBuffer.getChannelData(0);
			let dataLen = chData.length;
			if (!dataLen)
				return;
			let lastValue, lastByteValue;
			let time = this.sampleRatio * this.time;
			let lastTime = -1;
			let drawBuffer = [];
			for (let i = 0; i < dataLen; ++i) {
				let flooredTime = time | 0;
				if (!this.isPlaying)
					lastValue = 0;
				else if (lastTime !== flooredTime) {
					if (this.mode == "floatbeat") {
						lastValue = this.func(flooredTime * this.sampleRateDivisor);
						lastByteValue = Math.round((lastValue + 1) * 127.5);
					} else {
						lastByteValue = this.func(flooredTime * this.sampleRateDivisor) & 255;
						lastValue = lastByteValue / 127.5 - 1;
					}
					lastTime = flooredTime;
				}
				chData[i] = lastValue;
				drawBuffer[i] = lastByteValue;
				time += this.sampleRatio;
			}
			if (this.isPlaying) {
				this.setTime(this.time + dataLen);
				this.drawGraphics(drawBuffer);
			}
		}.bind(this);
		let audioGain = this.audioGain = audioCtx.createGain();
		this.changeVolume(this.controlVolume);
		processor.connect(audioGain);
		audioGain.connect(audioCtx.destination);

		let mediaDest = audioCtx.createMediaStreamDestination();
		let audioRecorder = this.audioRecorder = new MediaRecorder(mediaDest.stream);
		audioRecorder.ondataavailable = function (e) {
			this.recChunks.push(e.data);
		}.bind(this);
		audioRecorder.onstop = function (e) {
			let file, type;
			let types = ['audio/webm', 'audio/ogg'];
			let files = ['track.webm', 'track.ogg'];
			let check = (MediaRecorder.isTypeSupported || function (type) {
				return MediaRecorder.canRecordMimeType && MediaRecordercanRecordMimeType(type) === 'probably';
			});
			while ((file = files.pop()) && !check(type = types.pop())) {
				if (types.length === 0) {
					console.error('Saving not supported in this browser!');
					break;
				}
			}
			this.saveData(new Blob(this.recChunks, { type: type }), file);
		}.bind(this);
		audioGain.connect(mediaDest);
	},
	initCodeInput: function () {
		this.errorEl = $id('error');
		this.inputEl = $id('input-code');
		this.inputEl.addEventListener('onchange', this.refeshCalc.bind(this));
		this.inputEl.addEventListener('onkeyup', this.refeshCalc.bind(this));
		this.inputEl.addEventListener('input', this.refeshCalc.bind(this));
		this.inputEl.addEventListener('keydown', function (e) {
			if (e.keyCode === 9 /* TAB */ && !e.shiftKey) {
				e.preventDefault();
				let el = e.target;
				let value = el.value;
				let selStart = el.selectionStart;
				el.value = value.slice(0, selStart) + '\t' + value.slice(el.selectionEnd);
				el.setSelectionRange(selStart + 1, selStart + 1);
			}
		});
		if (window.location.hash.indexOf('#b64') === 0) {
			this.inputEl.value = pako.inflateRaw(
				atob(decodeURIComponent(window.location.hash.substr(4))), { to: 'string' }
			) + ';';
		} else if (window.location.hash.indexOf('#v3b64') === 0) {
			let pData = pako.inflateRaw(
				atob(decodeURIComponent(window.location.hash.substr(6))), { to: 'string' }
			);
			if (pData.startsWith('{')) {
				try {
					pData = JSON.parse(pData);
					this.mode = pData.mode || "bytebeat";
					this.applySampleRate(+pData.sampleRate || 8000);
					this.inputEl.value = pData.formula;
				} catch (err) {
					console.error("Couldn't load data from url:", err);
				}
			} else
				this.inputEl.value = pData;
		}
	},
	initCanvas: function () {
		this.timeCursor = $id('canvas-timecursor');
		this.canvEl = $id('canvas-main');
		this.canvCtx = this.canvEl.getContext('2d');
		this.canvWidth = this.canvEl.width;
		this.canvHeight = this.canvEl.height;
		this.imageData = this.canvCtx.createImageData(this.canvWidth, this.canvHeight);
	},
	initControls: function () {
		this.canvasTogglePlay = $id('canvas-toggleplay');
		this.controlTogglePlay = $id('control-toggleplay');
		this.controlScaleUp = $id('control-scaleup');
		this.controlScaleDown = $id('control-scaledown');
		this.controlCounter = $id('control-counter-value');
		this.controlVolume = $id('control-volume');
	},
	initLibrary: function () {
		Array.prototype.forEach.call($Q('.button-toggle'), function (el) {
			el.onclick = function () {
				$toggle(el.nextElementSibling);
			};
		});
		let libraryEl = $q('.container-scroll');
		libraryEl.onclick = function (e) {
			let el = e.target;
			if (el.tagName === 'CODE')
				this.insertAndRunCode(el, el.textContent);
			else if (el.classList.contains('code-load')) {
				let xhr = new XMLHttpRequest();
				xhr.onreadystatechange = function () {
					if (xhr.readyState === 4 && xhr.status === 200) {
						this.insertAndRunCode(el, xhr.responseText);
					}
				}.bind(this);
				xhr.open('GET', 'library/' + el.getAttribute('loadcode'), true);
				xhr.setRequestHeader("Cache-Control", "no-cache, no-store, must-revalidate");
				xhr.send(null);
			}
		}.bind(this);
		libraryEl.onmouseover = function (e) {
			let el = e.target;
			if (el.tagName === 'CODE')
				el.title = 'Click to play this code';
		};
	},
	insertAndRunCode: function (codeEl, codeText) {
		this.inputEl.value = codeText;
		this.applySampleRate(+codeEl.getAttribute('samplerate') || 8000);
		this.refeshCalc();
		this.resetTime();
		this.togglePlay(true);
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
	refeshCalc: function () {
		let oldF = this.func;
		let codeText = this.inputEl.value;

		// create shortened functions
		let params = Object.getOwnPropertyNames(Math);
		let values = params.map(k => Math[k]);
		params.push("int");
		values.push(Math.floor);

		try {
			bytebeat.func = Function(...params, "t", `return ${codeText}\n;`).bind(window, ...values);
			bytebeat.func(0);
		} catch (err) {
			bytebeat.func = oldF;
			bytebeat.errorEl.innerText = err.toString();
			return;
		}
		// delete single letter variables to prevent persistent variable errors (covers a good enough range)
		for (i = 0; i < 26; i++)
			delete window[String.fromCharCode(65 + i)], window[String.fromCharCode(97 + i)]

		this.errorEl.innerText = '';

		let pData = { formula: codeText };
		if (this.sampleRate != 8000)
			pData.sampleRate = this.sampleRate;
		if (this.mode != "bytebeat")
			pData.mode = this.mode;

		if (Object.getOwnPropertyNames(pData).length == 1)
			pData = codeText;
		else
			pData = JSON.stringify(pData);

		window.location.hash = '#v3b64' + btoa(pako.deflateRaw(pData, { to: 'string' }));
		this.setScrollHeight();
		this.pageIdx = 0;
		this.clearCanvas();
	},
	resetTime: function () {
		this.controlCounter.textContent = this.time = 0;
		this.pageIdx = 0;
		this.clearCanvas();
		this.timeCursor.style.cssText = 'display: none; left: 0px;';
		if (!this.isPlaying)
			this.canvasTogglePlay.classList.add('canvas-toggleplay-show');
	},
	setTime: function (value) {
		this.controlCounter.textContent = this.time = value;
	},
	setSampleRate: function (rate) {
		this.sampleRate = rate;
		if (this.audioCtx)
			this.sampleRatio = this.sampleRate / this.sampleRateDivisor / this.audioCtx.sampleRate;
	},
	setSampleRateDivisor: function (div) {
		this.sampleRateDivisor = div;
		if (this.audioCtx)
			this.sampleRatio = this.sampleRate / this.sampleRateDivisor / this.audioCtx.sampleRate;
	},
	setScrollHeight: function () {
		if (this.contScrollEl)
			this.contScrollEl.style.maxHeight = (document.documentElement.clientHeight - this.contFixedEl.offsetHeight - 4) + 'px';
	},
	toggleCursor: function () {
		this.timeCursor.style.display = this.scale <= 3 ? 'none' : 'block';
	},
	togglePlay: function (isPlay) {
		this.controlTogglePlay.textContent = isPlay ? 'Stop' : 'Play';
		this.canvasTogglePlay.classList.toggle('canvas-toggleplay-stop', isPlay);
		if (isPlay) {
			// Play
			this.canvasTogglePlay.classList.remove('canvas-toggleplay-show');
			this.toggleCursor();
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