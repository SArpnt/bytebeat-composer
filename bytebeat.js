class Bytebeat {
	constructor() {
		this.audioCtx = null;
		this.audioWorklet = null;
		this.audioGain = null;
		this.audioRecorder = null;
<<<<<<< HEAD
		this.recordChunks = [];
		this.bufferSize = 0;

		this.nextErrType = null;
		this.nextErr = null;
		this.nextErrPriority = undefined;
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

		this.contentElem = null;

		this.animationFrameId = null;


		this.animationFrame = this.animationFrame.bind(this);

		const initAudioPromise = this.initAudioContext();
		const onDomLoaded = async () => {
			this.contentElem = document.getElementById("content");
			this.initLibrary();
			let pData = this.initCodeInput();
			this.initControls();
			this.initCanvas();

			this.handleWindowResize(true);
			document.defaultView.addEventListener("resize", this.handleWindowResize.bind(this, false));

			await initAudioPromise;
			this.setVolume(this.controlVolume);
			this.loadCode(pData, false, false);
			this.refreshCalc();
		};
		if (["interactive", "loaded", "complete"].includes(document.readyState))
			onDomLoaded();
		else
			document.addEventListener("DOMContentLoaded", onDomLoaded);
	}

	async initAudioContext() {
		this.audioCtx = new AudioContext();

		// fetch and Blob are done to prevent caching
		const addModulePromise =
			fetch("audioWorklet.js", { cache: "no-cache" })
				.then(response => response.blob())
				.then(async blob => {
					await this.audioCtx.audioWorklet.addModule(URL.createObjectURL(blob));
				});

		this.audioGain = this.audioCtx.createGain();
		this.audioGain.connect(this.audioCtx.destination);

		const mediaDest = this.audioCtx.createMediaStreamDestination();
		this.audioRecorder = new MediaRecorder(mediaDest.stream);
		this.audioRecorder.ondataavailable = e => this.recordChunks.push(e.data);
		this.audioRecorder.onstop = e => {
=======
		this.audioWorkletNode = null;
		this.byteSample = 0;
		this.canvasCtx = null;
		this.canvasElem = null;
		this.canvasTogglePlay = null;
		this.containerFixed = null;
		this.controlTimeUnits = null;
		this.controlTimeValue = null;
		this.controlMode = null;
		this.controlSampleRate = null;
		this.controlScaleDown = null;
		this.controlTogglePlay = null;
		this.controlVolume = null;
		this.drawBuffer = [];
		this.drawEndBuffer = [];
		this.editorElem = null;
		this.errorElem = null;
		this.getX = t => t / (1 << this.settings.drawScale);
		this.isPlaying = false;
		this.isRecording = false;
		this.mod = (a, b) => ((a % b) + b) % b;
		this.mode = 'Bytebeat';
		this.recordChunks = [];
		this.sampleRate = 8000;
		this.settings = { drawMode: 'Points', drawScale: 5, isSeconds: false };
		this.timeCursor = null;
		document.addEventListener('DOMContentLoaded', async () => {
			this.initControls();
			this.initSettings();
			await this.initAudioContext();
			this.initLibraryEvents();
			this.initEditor();
		});
	}
	get saveData() {
		const a = document.body.appendChild(document.createElement('a'));
		a.style.display = 'none';
		const saveData = function(blob, fileName) {
			const url = URL.createObjectURL(blob);
			a.href = url;
			a.download = fileName;
			a.click();
			setTimeout(() => window.URL.revokeObjectURL(url));
		};
		Object.defineProperty(this, 'saveData', { value: saveData });
		return saveData;
	}
	get timeCursorEnabled() {
		return this.sampleRate >> this.settings.drawScale < 3950;
	}
	animationFrame() {
		this.drawGraphics(this.byteSample);
		if(this.isPlaying) {
			window.requestAnimationFrame(() => this.animationFrame());
		}
	}
	clearCanvas() {
		this.canvasCtx.clearRect(0, 0, this.canvasElem.width, this.canvasElem.height);
	}
	drawGraphics(endTime) {
		if(!isFinite(endTime)) {
			this.resetTime();
			return;
		}
		const buffer = this.drawBuffer;
		const bufferLen = buffer.length;
		if(!bufferLen) {
			return;
		}
		const { width, height } = this.canvasElem;
		const startTime = buffer[0].t;
		let startX = this.mod(this.getX(startTime), width);
		const endX = Math.floor(startX + this.getX(endTime - startTime));
		startX = Math.floor(startX);
		const drawWidth = Math.min(Math.abs(endX - startX) + 1, 1024);
		// Restoring the last points of a previous segment
		const imageData = this.canvasCtx.createImageData(drawWidth, height);
		if(this.settings.drawScale) {
			for(let y = 0; y < height; ++y) {
				this.drawPoint(imageData, drawWidth, 0, y, this.drawEndBuffer[y]);
			}
		}
		// Drawing on a segment
		const isWaveform = this.settings.drawMode === 'Waveform';
		let prevY = buffer[0].value;
		for(let i = 0; i < bufferLen; ++i) {
			const { t, value: curY } = buffer[i];
			const curX = this.mod(Math.floor(this.getX(t)) - startX, width);
			if(isWaveform && curY !== prevY) {
				for(let y = prevY, dy = prevY < curY ? 1 : -1; y !== curY; y += dy) {
					this.drawPoint(imageData, drawWidth, curX, y, 255);
				}
				prevY = curY;
			}
			const nextElem = buffer[i + 1];
			const nextX = this.mod(Math.ceil(this.getX(nextElem ? nextElem.t : endTime)) - startX, width);
			for(let x = curX; x !== nextX; x = this.mod(x + 1, width)) {
				this.drawPoint(imageData, drawWidth, x, curY, 255);
			}
		}
		// Saving the last points of a segment
		if(this.settings.drawScale) {
			for(let y = 0; y < height; ++y) {
				this.drawEndBuffer[y] = imageData.data[(drawWidth * (255 - y) + drawWidth - 1) << 2];
			}
		}
		// Placing a segment on the canvas
		this.canvasCtx.putImageData(imageData, startX, 0);
		if(endX > width) {
			this.canvasCtx.putImageData(imageData, startX - width, 0);
		}
		// Move the cursor to the end of the segment
		if(this.timeCursorEnabled) {
			this.timeCursor.style.left = endX / width * 100 + '%';
		}
		// Clear buffer
		this.drawBuffer = [{ t: endTime, value: buffer[bufferLen - 1].value }];
	}
	drawPoint(imageData, width, x, y, value) {
		let idx = (width * (255 - y) + x) << 2;
		imageData.data[idx++] = imageData.data[idx++] = imageData.data[idx++] = imageData.data[idx] = value;
	}
	expandEditor() {
		this.containerFixed.classList.toggle('container-expanded');
	}
	async initAudioContext() {
		this.audioCtx = new (window.AudioContext || window.webkitAudioContext || window.mozAudioContext)();
		await this.audioCtx.audioWorklet.addModule('audioProcessor.js');
		if(!this.audioCtx.createGain) {
			this.audioCtx.createGain = this.audioCtx.createGainNode;
		}
		this.audioGain = this.audioCtx.createGain();
		this.setVolume(this.controlVolume);
		this.audioWorkletNode = new AudioWorkletNode(this.audioCtx, 'audioProcessor');
		this.audioWorkletNode.port.onmessage = ({ data }) => this.receiveData(data);
		this.audioWorkletNode.connect(this.audioGain);
		this.audioGain.connect(this.audioCtx.destination);
		const mediaDest = this.audioCtx.createMediaStreamDestination();
		const audioRecorder = this.audioRecorder = new MediaRecorder(mediaDest.stream);
		audioRecorder.ondataavailable = e => this.recordChunks.push(e.data);
		audioRecorder.onstop = e => {
>>>>>>> 54c7adabbc48945e063081839fcbb960cd399332
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
		};
		this.audioGain.connect(mediaDest);
<<<<<<< HEAD

		await addModulePromise;
		this.audioWorklet = new AudioWorkletNode(this.audioCtx, "bytebeatProcessor");
		this.audioWorklet.port.addEventListener("message", this.handleMessage.bind(this));
		this.audioWorklet.port.start();
		this.audioWorklet.connect(this.audioGain);
	}
	handleMessage(e) {
		const data = e.data;
		if (data.clearCanvas)
			this.clearCanvas();
		else if (data.clearDrawBuffer)
			this.clearDrawBuffer();

		if (data.byteSample !== undefined)
			this.setByteSample(data.byteSample, false);
		if (data.drawBuffer !== undefined)
			this.drawBuffer = this.drawBuffer.concat(data.drawBuffer);

		if (data.generateUrl)
			this.generateUrl();

		if (data.errorMessage !== undefined) {
			if (data.errorMessage === null)
				this.hideErrorMessage();
			else if (this.isPlaying) {
				this.nextErrType = data.errorMessage.type;
				this.nextErr = data.errorMessage.err;
				this.nextErrPriority = data.errorMessage.priority;
			} else
				this.showErrorMessage(data.errorMessage.type, data.errorMessage.err, data.errorMessage.priority);
		}
	}
	get saveData() {
		const a = document.createElement("a");
		document.documentElement.appendChild(a);
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
		// TODO: all this stuff in playlist.js
		const libraryElem = document.getElementById("library");
		libraryElem.addEventListener("click", e => {
			const el = e.target;
			// TODO: create individual click event with stored info after first click
			if (el.tagName === "CODE")
				this.loadCode(Object.assign({ code: el.innerText }, el.hasAttribute("data-songdata") ? JSON.parse(el.dataset.songdata) : {}));
			else if (el.classList.contains("code-load"))
				fetch(`library/${el.dataset.codeFile}`, { cache: "no-cache" })
					.then(response => response.text())
					.then(code => {
						this.loadCode(Object.assign(JSON.parse(el.dataset.songdata), { code }));
					});
		});

		// TODO: DEFINETLY this in playlist.js, this is horrible
		libraryElem.addEventListener("mouseover", e => {
			const el = e.target;
			if (el.tagName === "CODE")
				el.title = "Click to play this code";
		});
	}

	initCodeInput() {
		this.errorElem = document.getElementById("error");
		this.inputElem = document.getElementById("code-editor");
		this.inputElem.addEventListener("input", this.refreshCalc.bind(this));
		this.inputElem.addEventListener("keydown", e => {
			if (e.key === "Tab" && !e.altKey && !e.ctrlKey) {
				// TODO: undo/redo text
				e.preventDefault();
				let el = e.target;
				let
					selectionStart = el.selectionStart,
					selectionEnd = el.selectionEnd;
				if (e.shiftKey) {
					// remove indentation on all selected lines
					let lines = el.value.split("\n");

					let getLine = char => {
						let line = 0;
						for (let c = 0; ; line++) {
							c += lines[line].length;
							if (c > char)
								break;
						}
						return line;
					};
					let
						startLine = getLine(selectionStart),
						endLine = getLine(selectionEnd),
						newSelectionStart = selectionStart,
						newSelectionEnd = selectionEnd;
					for (let i = startLine; i <= endLine; i++) {
						if (lines[i][0] == "\t") {
							lines[i] = lines[i].slice(1);
							if (i == startLine)
								newSelectionStart--;
							newSelectionEnd--;
						}
					}

					el.value = lines.join("\n");
					el.setSelectionRange(newSelectionStart, newSelectionEnd);
				} else {
					// add tab character
					el.value = `${el.value.slice(0, selectionStart)}\t${el.value.slice(selectionEnd)}`;
					el.setSelectionRange(selectionStart + 1, selectionStart + 1);
				}
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
=======
	}
	initControls() {
		this.canvasElem = document.getElementById('canvas-main');
		this.canvasCtx = this.canvasElem.getContext('2d');
		this.canvasTogglePlay = document.getElementById('canvas-toggleplay');
		this.containerFixed = document.getElementById('container-fixed');
		this.controlTimeValue = document.getElementById('control-time-value');
		this.controlTimeUnits = document.getElementById('control-time-units');
		this.controlDrawMode = document.getElementById('control-drawmode');
		this.controlMode = document.getElementById('control-mode');
		this.controlSampleRate = document.getElementById('control-samplerate');
		this.controlScaleDown = document.getElementById('control-scaledown');
		this.controlTogglePlay = document.getElementById('control-toggleplay');
		this.controlVolume = document.getElementById('control-volume');
		this.timeCursor = document.getElementById('canvas-timecursor');
		this.controlTimeValue.oninput = this.controlTimeValue.onkeydown = e => {
			if(e.key === "Enter") {
				this.controlTimeValue.blur();
				this.togglePlay(true);
				return;
			}
			const { value } = this.controlTimeValue;
			const byteSample = this.settings.isSeconds ? Math.round(value * this.sampleRate) : value;
			this.setByteSample(byteSample);
			this.sendData({ byteSample });
		};
	}
	initEditor() {
		this.errorElem = document.getElementById('error');
		this.editorElem = document.getElementById('editor');
		this.editorElem.oninput = () => this.setFunction();
		this.editorElem.onkeydown = e => {
			if(e.keyCode === 9 /* TAB */ && !e.shiftKey && !e.altKey && !e.ctrlKey) {
				e.preventDefault();
				const el = e.target;
				const { value, selectionStart } = el;
				el.value = value.slice(0, selectionStart) + '\t' + value.slice(el.selectionEnd);
				el.setSelectionRange(selectionStart + 1, selectionStart + 1);
				this.setFunction();
			}
		};
		/* global pako */
		let { hash } = window.location;
		if(!hash) {
			this.updateLocation();
			({ hash } = window.location);
		}
		if(!hash.startsWith('#v3b64')) {
			console.error('Unrecognized url data');
			return;
		}
		let pData = pako.inflateRaw(
			atob(decodeURIComponent(hash.substr(6))), { to: 'string' }
		);
		if(!pData.startsWith('{')) { // XXX: old format
			pData = { code: pData, sampleRate: 8000, mode: 'Bytebeat' };
		} else {
			try {
				pData = JSON.parse(pData);
				if(pData.formula) { // XXX: old format
					pData.code = pData.formula;
				}
			} catch(err) {
				console.error("Couldn't load data from url:", err);
				pData = null;
			}
		}
		if(pData !== null) {
			this.loadCode(pData, false);
>>>>>>> 54c7adabbc48945e063081839fcbb960cd399332
		}
		return null;
	}

	initControls() {
		this.controlTimeUnit = document.getElementById("control-time-unit");
		this.controlTimeValue = document.getElementById("control-time-value");

		this.controlScaleUp = document.getElementById("control-scaleup");
		this.controlScaleDown = document.getElementById("control-scaledown");

		this.controlMode = document.getElementById("control-mode");
		this.controlSampleRate = document.getElementById("control-samplerate");
		this.controlVolume = document.getElementById("control-volume");

		this.canvasTogglePlay = document.getElementById("canvas-toggleplay");
	}
<<<<<<< HEAD
	initCanvas() {
		this.timeCursor = document.getElementById("canvas-timecursor");
		this.canvasElem = document.getElementById("canvas-main");
		this.canvasCtx = this.canvasElem.getContext("2d", { alpha: false });
	}

	refreshCalc() {
		const codeText = this.inputElem.value;

		this.audioWorklet.port.postMessage({ codeText: codeText.trim() });
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
			this.contentElem.style.maxWidth = (newWidth + 4) + "px";
		}
	}
	animationFrame() {
		this.drawGraphics(this.byteSample);
		if (this.nextErr)
			this.showErrorMessage(this.nextErrType, this.nextErr, this.nextErrPriority);

		if (this.isPlaying)
			this.animationFrameId = window.requestAnimationFrame(this.animationFrame);
		else
			this.animationFrameId = null;
	}

	loadCode(pData, calc = true, play = true) {
		if (pData != null) {
			let { code, sampleRate, mode } = pData;
			this.inputElem.value = code;
			this.applySampleRate(+sampleRate || 8000);
			this.applyMode(mode || "Bytebeat");
		}
		if (calc)
			this.refreshCalc();
		if (play) {
			this.resetTime();
			this.togglePlay(true);
		}
	}
=======
	initLibraryEvents() {
		document.body.querySelectorAll('.library-header').forEach(el =>
			(el.onclick = () => el.nextElementSibling.classList.toggle('disabled')));
		const libraryElem = document.getElementById('container-scroll');
		libraryElem.onclick = e => {
			const el = e.target;
			if(el.tagName === 'CODE') {
				this.loadCode(Object.assign({ code: el.innerText },
					el.hasAttribute('data-songdata') ? JSON.parse(el.dataset.songdata) : {}));
			} else if(el.classList.contains('code-load')) {
				const xhr = new XMLHttpRequest();
				xhr.onreadystatechange = () => {
					if(xhr.readyState === 4 && xhr.status === 200) {
						this.loadCode(Object.assign(JSON.parse(el.dataset.songdata),
							{ code: xhr.responseText }));
					}
				};
				xhr.open('GET', 'library/' + el.dataset.codeFile, true);
				xhr.setRequestHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
				xhr.send(null);
			}
		};
		libraryElem.onmouseover = function(e) {
			const el = e.target;
			if(el.tagName === 'CODE') {
				el.title = 'Click to play this code';
			}
		};
	}
	initSettings() {
		try {
			this.settings = JSON.parse(localStorage.settings);
		} catch(err) {
			this.saveSettings();
		}
		this.setScale(0);
		this.setCounterUnits();
		this.controlDrawMode.value = this.settings.drawMode;
	}
	loadCode({ code, sampleRate, mode }, isPlay = true) {
		this.mode = this.controlMode.value = mode = mode || 'Bytebeat';
		this.editorElem.value = code;
		this.setSampleRate(this.controlSampleRate.value = +sampleRate || 8000, false);
		const sampleRatio = this.sampleRate / this.audioCtx.sampleRate;
		const data = { mode, sampleRatio, setFunction: code };
		if(isPlay) {
			this.togglePlay(true, false);
			data.isPlaying = isPlay;
			data.resetTime = true;
		}
		this.sendData(data);
	}
>>>>>>> 54c7adabbc48945e063081839fcbb960cd399332
	applySampleRate(rate) {
		this.setSampleRate(rate);
		this.controlSampleRate.value = rate;
	}
	applyMode(mode) {
		this.setMode(mode);
		this.controlMode.value = mode;
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
<<<<<<< HEAD
	changeScale(amount) {
		if (amount) {
			this.drawScale = Math.max(this.drawScale + amount, 0);
			this.clearCanvas();
			if (this.drawScale <= 0)
				this.controlScaleDown.setAttribute("disabled", true);
			else
				this.controlScaleDown.removeAttribute("disabled");
			this.toggleTimeCursor();
		}
	}
	setVolume({ value, max }) {
		const fraction = parseInt(value) / parseInt(max);
		this.audioGain.gain.value = fraction * fraction;
	}

	clearCanvas() {
		this.canvasCtx.fillRect(0, 0, this.canvasElem.width, this.canvasElem.height);
		this.clearDrawBuffer();
	}
	clearDrawBuffer() {
		this.drawBuffer = [];
		this.drawImageData = null;
	}
	drawGraphics(endTime) {
		const
			width = this.canvasElem.width,
			height = this.canvasElem.height;

		const
			fmod = (a, b) => ((a % b) + b) % b,
			getXpos = t => t / (1 << this.drawScale),
			getTimeFromXpos = x => x * (1 << this.drawScale),
			playingForward = this.playSpeed > 0;

		// quick buffer reduction for massive lag spikes (switching tab causes animationFrame to wait)
		this.drawBuffer = this.drawBuffer.slice(-getTimeFromXpos(width));

		const bufferLen = this.drawBuffer.length;
		if (!bufferLen)
			return;

		let
			startTime = this.drawBuffer[0].t,
			lenTime = endTime - startTime,
			startXPos = fmod(getXpos(startTime), width),
			endXPos = startXPos + getXpos(lenTime);

		{
			let drawStartX = Math.floor(startXPos);
			let drawEndX = Math.floor(endXPos);
			let drawLenX = Math.abs(drawEndX - drawStartX) + 1;
			let drawOverflow = false;
			// clip draw area if too large
			if (drawLenX > width) { // TODO: put this into a better section so the variables don't all have to be set again
				startTime = getTimeFromXpos(getXpos(endTime) - width);
				let sliceIndex = 0;
				for (let i in this.drawBuffer) { // TODO: replace this with binary search
					if ((this.drawBuffer[i + 1]?.t ?? endTime) <= startTime)
						sliceIndex += 1;
					else {
						this.drawBuffer[i].t = startTime;
						this.drawBuffer = this.drawBuffer.slice(sliceIndex);
						break;
					}
				}
				lenTime = endTime - startTime;
				startXPos = fmod(getXpos(startTime), width);
				endXPos = startXPos + getXpos(lenTime);
				drawStartX = Math.ceil(startXPos); // this is a bit of a hack, variables won't have normal expected behavior
				// i can only get away with this because the other vars aren't used
				// the proper solution would be to somehow round up startTime by a pixel
				drawEndX = Math.floor(endXPos);
				drawLenX = Math.abs(drawEndX - drawStartX) + 1;
				drawOverflow = true;
			}

			const imagePos = Math.min(drawStartX, drawEndX);
			// create imageData
			let imageData = this.canvasCtx.createImageData(drawLenX, height);
			// create / add drawimageData
			if (this.drawScale) { // full zoom can't have multiple samples on one pixel
				if (this.drawImageData) {
					if (!drawOverflow) {
						let x = playingForward ? 0 : drawLenX - 1;
						for (let y = 0; y < height; y++) {
							imageData.data[(drawLenX * y + x) << 2] = this.drawImageData.data[y << 2];
							imageData.data[((drawLenX * y + x) << 2) + 1] = this.drawImageData.data[(y << 2) + 1];
							imageData.data[((drawLenX * y + x) << 2) + 2] = this.drawImageData.data[(y << 2) + 2];
						}
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
		if (this.timeCursorVisible()) {
			if (playingForward) {
				this.timeCursor.style.removeProperty("right");
				this.timeCursor.style.left = `${fmod(Math.ceil(getXpos(endTime)), width) / width * 100}%`;
			} else {
				this.timeCursor.style.removeProperty("left");
				this.timeCursor.style.right = `${(1 - (fmod(Math.ceil(getXpos(endTime)), width) + 1) / width) * 100}%`;
			}
		}

		// clear buffer except last sample
		this.drawBuffer = [{ t: endTime, value: this.drawBuffer[bufferLen - 1].value }];
	}


	hideErrorMessage() {
		if (this.errorElem) {
			this.errorElem.innerText = "";

			this.nextErr = null;
			this.nextErrType = null;
			this.nextErrPriority = undefined;
			this.errorPriority = -Infinity;
		}
	}
	showErrorMessage(errType, err, priority = 0) {
		if (this.errorElem && priority > this.errorPriority) {
			this.errorElem.dataset.errType = errType;
			this.errorElem.innerText = err.toString();

			this.nextErr = null;
			this.nextErrType = null;
			this.nextErrPriority = undefined;
			this.errorPriority = priority;
=======
	receiveData(data) {
		const { byteSample } = data;
		if(byteSample !== undefined) {
			this.setCounterValue(byteSample);
			this.setByteSample(byteSample);
		}
		if(data.drawBuffer !== undefined) {
			this.drawBuffer = this.drawBuffer.concat(data.drawBuffer);
		}
		if(data.error !== undefined) {
			this.errorElem.innerText = data.error;
		}
		if(data.updateLocation === true) {
			this.updateLocation();
>>>>>>> 54c7adabbc48945e063081839fcbb960cd399332
		}
	}

	resetTime() {
<<<<<<< HEAD
		this.setByteSample(0, true, true);
		this.timeCursor.cssText = ""; // TODO: remove this after "update cursor position"
		if (!this.isPlaying)
			this.canvasTogglePlay.classList.add("canvas-toggleplay-show");
	}
	setByteSample(value, send = true, clear = false) {
		this.controlTimeValue.placeholder = value;
		this.byteSample = value;
		if (send)
			this.audioWorklet.port.postMessage({ setByteSample: [value, clear] });
		// TODO: update cursor position
	}
	setMode(mode) {
		this.mode = mode;
		this.audioWorklet.port.postMessage({ mode });
	}
	setSampleRate(sampleRate) {
		this.sampleRate = sampleRate;
		this.audioWorklet.port.postMessage({ sampleRate, updateSampleRatio: true });
		this.toggleTimeCursor();
	}
	setSampleRateDivisor(sampleRateDivisor) {
		this.audioWorklet.port.postMessage({ sampleRateDivisor, updateSampleRatio: true });
	}
	setPlaySpeed(playSpeed) {
		if (this.playSpeed != playSpeed) {
			this.playSpeed = playSpeed;
			this.audioWorklet.port.postMessage({ playSpeed, updateSampleRatio: true });
		}
	}

	toggleTimeCursor() {
		this.timeCursor.classList.toggle('disabled', !this.timeCursorVisible());
	}
	timeCursorVisible() {
		return this.sampleRate >> this.drawScale < 3950;
	}
	togglePlay(isPlay) {
		this.canvasTogglePlay.classList.toggle("canvas-toggleplay-stop", isPlay);
		if (isPlay) {
			// Play
			this.canvasTogglePlay.classList.remove("canvas-toggleplay-show");
			if (this.audioCtx?.resume)
				this.audioCtx.resume();
			this.animationFrameId = window.requestAnimationFrame(this.animationFrame);
		} else {
			if (this.isRecording) {
				this.audioRecorder.stop();
				this.isRecording = false;
			}
			window.cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
		}
		this.isPlaying = isPlay;
		this.audioWorklet.port.postMessage({ isPlaying: isPlay });
	}
};
=======
		this.sendData({ resetTime: true });
	}
	saveSettings() {
		localStorage.settings = JSON.stringify(this.settings);
	}
	sendData(data) {
		this.audioWorkletNode.port.postMessage(data);
	}
	setByteSample(value) {
		this.byteSample = +value || 0;
		if(value === 0) {
			this.drawBuffer = [];
			this.clearCanvas();
			this.timeCursor.style.left = 0;
			if(!this.isPlaying) {
				this.canvasTogglePlay.classList.add('canvas-initial');
			}
		}
	}
	setCounterUnits() {
		this.controlTimeUnit.textContent = this.settings.isSeconds ? 'sec' : 't';
		this.setCounterValue(this.byteSample);
	}
	setCounterValue(value) {
		this.controlTimeValue.value = this.settings.isSeconds ? (value / this.sampleRate).toFixed(2) : value;
	}
	setDrawMode() {
		this.settings.drawMode = this.controlDrawMode.value;
		this.saveSettings();
	}
	setFunction() {
		this.sendData({ setFunction: this.editorElem.value });
	}
	setMode(mode) {
		this.mode = mode;
		this.updateLocation();
		this.sendData({ mode });
	}
	setSampleRate(sampleRate, isSendData = true) {
		this.sampleRate = sampleRate;
		this.toggleTimeCursor();
		if(isSendData) {
			this.sendData({ sampleRatio: this.sampleRate / this.audioCtx.sampleRate });
		}
	}
	setScale(amount) {
		this.settings.drawScale = Math.max(this.settings.drawScale + amount, 0);
		this.saveSettings();
		this.clearCanvas();
		this.toggleTimeCursor();
		if(this.settings.drawScale <= 0) {
			this.controlScaleDown.setAttribute('disabled', true);
		} else {
			this.controlScaleDown.removeAttribute('disabled');
		}
	}
	setVolume({ value, max }) {
		const fraction = parseInt(value) / parseInt(max);
		this.audioGain.gain.value = fraction * fraction;
	}
	stopPlay() {
		this.togglePlay(false, false);
		this.sendData({ isPlaying: false, resetTime: true });
	}
	toggleCounterUnits() {
		this.settings.isSeconds = !this.settings.isSeconds;
		this.saveSettings();
		this.setCounterUnits();
	}
	togglePlay(isPlaying, isSendData = true) {
		this.controlTogglePlay.title = isPlaying ? 'Pause' : 'Play';
		this.controlTogglePlay.classList.toggle('control-play', !isPlaying);
		this.controlTogglePlay.classList.toggle('control-pause', isPlaying);
		this.canvasTogglePlay.classList.toggle('canvas-play', !isPlaying);
		this.canvasTogglePlay.classList.toggle('canvas-pause', isPlaying);
		if(isPlaying) {
			this.canvasTogglePlay.classList.remove('canvas-initial');
			if(this.audioCtx.resume) {
				this.audioCtx.resume();
				window.requestAnimationFrame(() => this.animationFrame());
			}
		} else if(this.isRecording) {
			this.audioRecorder.stop();
			this.isRecording = false;
		}
		this.isPlaying = isPlaying;
		if(isSendData) {
			this.sendData({ isPlaying });
		}
	}
	toggleTimeCursor() {
		this.timeCursor.classList.toggle('disabled', !this.timeCursorEnabled);
	}
	updateLocation() {
		const pData = { code: this.editorElem.value };
		if(this.sampleRate !== 8000) {
			pData.sampleRate = this.sampleRate;
		}
		if(this.mode !== 'Bytebeat') {
			pData.mode = this.mode;
		}
		window.location.hash = '#v3b64' + btoa(pako.deflateRaw(JSON.stringify(pData), { to: 'string' }));
	}
}();
>>>>>>> 54c7adabbc48945e063081839fcbb960cd399332

const bytebeat = new Bytebeat();