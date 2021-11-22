import { EditorView } from "./codemirror.bundle.min.mjs"; // TODO: remove this
import "https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.3/pako.min.js";
import domLoaded from "./domLoaded.mjs";

let resolve = globalThis.bytebeat ?? null;

Object.defineProperty(globalThis, "bytebeat", {
	value: Object.seal({
		audioCtx: null,
		audioWorklet: null,
		audioGain: null,
		audioRecorder: null,
		recordChunks: [],

		nextErrType: null,
		nextErr: null,
		nextErrPriority: undefined,
		errorPriority: -Infinity,

		canvasCtx: null,
		//drawSettings: { mode: "Points", scale: 5 },
		drawMode: "Points",
		drawScale: 5,
		drawBuffer: [],
		drawImageData: null,
		byteSample: 0,

		isPlaying: false,
		isRecording: false,

		//songData: { sampleRate: 8000, mode: "Bytebeat" };
		playbackMode: "Bytebeat",
		sampleRate: 8000,
		playSpeed: 1,

		canvasElem: null,
		codeEditor: null,
		errorElem: null,
		timeCursorElem: null,

		contentElem: null,

		animationFrameId: null,

		controlTimeUnit: null,
		controlTimeValue: null,
		controlScaleUp: null,
		controlScaleDown: null,
		controlPlaybackMode: null,
		controlSampleRate: null,
		controlVolume: null,
		canvasTogglePlay: null,

		async init() {
			this.animationFrame = this.animationFrame.bind(this);
			{
				const a = document.createElement("a");
				//document.head.appendChild(a); // TODO: is this needed on any browser? doesn't seem neccecary on chrome or firefox
				this.saveData = function saveData(blob, fileName) {
					const url = URL.createObjectURL(blob);
					a.href = url;
					a.download = fileName;
					a.click();
					setTimeout(() => window.URL.revokeObjectURL(url));
				};
			}

			const initAudioPromise = this.initAudioContext();

			await domLoaded;

			this.contentElem = document.getElementById("content");
			let pData = this.getUrlData();
			this.initControls();
			const codeEditorPromise = this.initCodeEditor(document.getElementById("code-editor"));

			this.handleWindowResize(true);
			document.defaultView.addEventListener("resize", this.handleWindowResize.bind(this, false));

			await initAudioPromise;
			this.setVolume();
			await codeEditorPromise;
			this.loadCode(pData, false, false);
			this.refreshCode();
		},

		async initAudioContext() {
			this.audioCtx = new AudioContext();

			// fetch and Blob are done to prevent caching
			const addModulePromise =
				fetch("scripts/audioWorklet.mjs", { type: "module", cache: "no-cache" })
					.then(response => response.blob())
					.then(async blob => {
						await this.audioCtx.audioWorklet.addModule(URL.createObjectURL(blob));
					});

			this.audioGain = new GainNode(this.audioCtx);
			this.audioGain.connect(this.audioCtx.destination);

			const mediaDest = this.audioCtx.createMediaStreamDestination();
			this.audioRecorder = new MediaRecorder(mediaDest.stream);
			this.audioRecorder.ondataavailable = e => this.recordChunks.push(e.data);
			this.audioRecorder.addEventListener("stop", e => {
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
			});
			this.audioGain.connect(mediaDest);

			await addModulePromise;
			this.audioWorklet = new AudioWorkletNode(this.audioCtx, "bytebeatProcessor");
			this.audioWorklet.port.addEventListener("message", this.handleMessage.bind(this));
			this.audioWorklet.port.start();
			this.audioWorklet.connect(this.audioGain);
		},
		handleMessage(e) {
			const data = e.data;
			if (data.clearCanvas)
				this.clearCanvas();
			else if (data.clearDrawBuffer)
				this.clearDrawBuffer();

			if (data.byteSample !== undefined)
				this.setByteSample(data.byteSample, false);
			if (data.drawBuffer !== undefined) {
				this.drawBuffer = this.drawBuffer.concat(data.drawBuffer);
				// prevent buffer accumulation when tab inactive
				// TODO: get function from drawGraphics
				if (this.drawBuffer.length > this.canvasElem.width)
					this.drawBuffer = this.drawBuffer.slice(this.canvasElem.width);
			}

			if (data.updateUrl)
				this.updateUrl();

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
		},
		saveData: null,
		initCodeEditor: (function () {
			let resolve = null; // TODO: all the resolve stuff is a horrible hack
			return function initCodeEditor(codeEditor) {
				if (codeEditor instanceof Element) {
					if (codeEditor.tagName == "TEXTAREA") {
						codeEditor.addEventListener("input", this.refreshCode.bind(this));
						{
							let keyTrap = true;
							codeEditor.addEventListener("keydown", e => {
								if (!e.altKey && !e.ctrlKey) {
									if (e.key === "Escape") {
										if (keyTrap) {
											e.preventDefault();
											keyTrap = false;
										}
									} else if (e.key === "Tab" && keyTrap) {
										// TODO: undo/redo text
										e.preventDefault();
										const el = e.target;
										const { selectionStart, selectionEnd } = el;
										if (e.shiftKey) {
											// remove indentation on all selected lines
											let lines = el.value.split("\n");

											let getLine = char => {
												let line = 0;
												for (let c = 0; ; line++) {
													c += lines[line].length;
													if (c > char) 1;
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
										this.refreshCode();
									} else
										keyTrap = false;
								}
							});
						}
						this.codeEditor = codeEditor;
					} else if (codeEditor.classList.contains("cm-editor")) {
						if (!(this.codeEditor instanceof EditorView) || codeEditor !== this.codeEditor.dom)
							return new Promise(r => resolve = r);
					}
				} else if (codeEditor instanceof EditorView) {
					if (this.codeEditor)
						codeEditor.dispatch({ changes: { from: 0, insert: this.codeEditor.value } });
					this.codeEditor = codeEditor;
					if (resolve) {
						resolve();
						resolve = null;
					}
					return this.refreshCode.bind(this);
				}
			};
		})(),
		get codeEditorText() {
			if (this.codeEditor instanceof Element)
				return this.codeEditor.value;
			else
				return this.codeEditor.state.doc.toString();
		},
		set codeEditorText(value) {
			if (this.codeEditor instanceof Element)
				this.codeEditor.value = value;
			else
				this.codeEditor.dispatch({ changes: { from: 0, to: this.codeEditor.state.doc.length, insert: value } });
		},
		getUrlData() {
			if (window.location.hash) {
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
				} else
					console.error("Unrecognized url data");
			}
			return null;
		},
		initControls() {
			this.controlTimeUnit = document.getElementById("control-time-unit");
			this.controlTimeValue = document.getElementById("control-time-value");

			this.controlScaleDown = document.getElementById("control-scaledown");
			this.controlScaleUp = document.getElementById("control-scaleup");

			//this.controlDrawMode = document.getElementById("control-draw-mode");
			this.controlPlaybackMode = document.getElementById("control-playback-mode");
			this.controlSampleRate = document.getElementById("control-samplerate");
			this.controlVolume = document.getElementById("control-volume");

			this.errorElem = document.getElementById("error");
			this.canvasTogglePlay = document.getElementById("canvas-toggleplay");
			this.timeCursorElem = document.getElementById("canvas-timecursor");
			this.canvasElem = document.getElementById("canvas-main");
			this.canvasCtx = this.canvasElem.getContext("2d", { alpha: false });
		},
		// TODO
		initSettings() {
			/*try {
				this.settings = JSON.parse(localStorage.settings);
			} catch(err) {
				this.saveSettings();
			}
			this.setScale(0);
			this.setCounterUnits();
			this.controlDrawMode.value = this.settings.drawMode;*/
		},
		refreshCode() {
			this.audioWorklet.port.postMessage({ code: this.codeEditorText.trim() });
		},
		updateUrl() {
			let pData = { code: this.codeEditorText };
			if (this.sampleRate != 8000)
				pData.sampleRate = this.sampleRate;
			if (this.playbackMode != "Bytebeat")
				pData.mode = this.playbackMode;

			pData = JSON.stringify(pData);

			window.location.hash = "#v3b64" + btoa(pako.deflateRaw(pData, { to: "string" }));
		},
		handleWindowResize(force = false) {
			let newWidth;
			if (window.innerWidth >= 768 + 4) // 768 is halfway between 512 and 1024
				newWidth = 1024;
			else
				newWidth = 512;
			if (newWidth != this.canvasElem.width || force) {
				this.canvasElem.width = newWidth;
				this.contentElem.style.maxWidth = (newWidth + 4) + "px"; // TODO: see if it's possible to get rid of this at some point
			}
		},
		animationFrame() {
			this.drawGraphics();
			if (this.nextErr)
				this.showErrorMessage(this.nextErrType, this.nextErr, this.nextErrPriority);

			if (this.isPlaying)
				this.animationFrameId = window.requestAnimationFrame(this.animationFrame);
			else
				this.animationFrameId = null;
		},

		loadCode(pData, refreshCode = true, play = true) {
			if (pData != null) {
				let { code, sampleRate, mode: playbackMode } = pData;
				this.codeEditorText = code;
				this.applySampleRate(+sampleRate || 8000);
				this.applyPlaybackMode(playbackMode || "Bytebeat");
			}
			if (refreshCode)
				this.refreshCode();
			if (play) {
				this.resetTime();
				this.togglePlay(true);
			}
		},
		applySampleRate(rate) {
			this.setSampleRate(rate);
			this.controlSampleRate.value = rate;
		},
		applyPlaybackMode(playbackMode) {
			this.setPlaybackMode(playbackMode);
			this.controlPlaybackMode.value = playbackMode;
		},

		rec() {
			if (this.audioCtx && !this.isRecording) {
				this.audioRecorder.start();
				this.isRecording = true;
				this.recordChunks = [];
				if (!this.isPlaying)
					this.togglePlay(true);
			}
		},
		changeScale(amount) {
			if (amount) {
				this.drawScale = Math.max(this.drawScale + amount, 0);
				this.clearCanvas();
				if (this.drawScale <= 0)
					this.controlScaleDown.setAttribute("disabled", true);
				else
					this.controlScaleDown.removeAttribute("disabled");
				this.toggleTimeCursor();
				this.moveTimeCursor();
			}
		},
		setDrawMode(drawMode = this.controlDrawMode.value) { // TODO
			//this.settings.drawMode = drawMode;
			//this.saveSettings();
		},
		setVolume() {
			const fraction = parseInt(this.controlVolume.value) / parseInt(this.controlVolume.max);
			this.audioGain.gain.value = fraction * fraction;
		},

		clearCanvas() {
			this.canvasCtx.fillRect(0, 0, this.canvasElem.width, this.canvasElem.height);
			this.clearDrawBuffer();
		},
		clearDrawBuffer() {
			this.drawBuffer = [];
			this.drawImageData = null;
		},
		fmod(a, b) { return ((a % b) + b) % b; },
		getXpos(t) { return t / (1 << this.drawScale); },
		getTimeFromXpos(x) { return x * (1 << this.drawScale); },
		drawGraphics() {
			const { width, height } = this.canvasElem;

			// quick buffer reduction for massive lag spikes (switching tab causes animationFrame to wait)
			// TODO: move to handleMessage
			this.drawBuffer = this.drawBuffer.slice(-this.getTimeFromXpos(width));

			const bufferLen = this.drawBuffer.length;
			if (!bufferLen)
				return;

			const playingForward = this.playSpeed > 0;

			let
				startTime = this.drawBuffer[0].t,
				endTime = this.byteSample,
				lenTime = endTime - startTime,
				startXPos = this.fmod(this.getXpos(startTime), width),
				endXPos = startXPos + this.getXpos(lenTime);

			{
				let drawStartX = Math.floor(startXPos);
				let drawEndX = Math.floor(endXPos);
				let drawLenX = Math.abs(drawEndX - drawStartX) + 1;
				let drawOverflow = false;
				// clip draw area if too large
				if (drawLenX > width) { // TODO: put this into a better section so the variables don't all have to be set again
					startTime = this.getTimeFromXpos(this.getXpos(endTime) - width);
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
					startXPos = this.fmod(this.getXpos(startTime), width);
					endXPos = startXPos + this.getXpos(lenTime);
					drawStartX = Math.ceil(startXPos); // this is a bit of a hack, since this doesn't relate to the other variables properly
					// i can only get away with this because the other vars like startTime and such aren't used
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
					const startX = this.fmod(Math.floor(this.getXpos(playingForward ? bufferElem.t : nextBufferElemTime + 1)) - imagePos, width);
					const endX = this.fmod(Math.ceil(this.getXpos(playingForward ? nextBufferElemTime : bufferElem.t + 1)) - imagePos, width);
					for (let xPos = startX; xPos != endX; xPos = this.fmod(xPos + 1, width))
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
			this.moveTimeCursor(endTime);

			// clear buffer except last sample
			this.drawBuffer = [{ t: endTime, value: this.drawBuffer[bufferLen - 1].value }];
		},
		moveTimeCursor(time = this.byteSample) {
			const width = this.canvasElem.width;
			if (this.timeCursorVisible()) {
				if (this.playSpeed > 0) {
					this.timeCursorElem.style.removeProperty("right");
					this.timeCursorElem.style.left = `${this.fmod(Math.ceil(this.getXpos(time)), width) / width * 100}%`;
				} else {
					this.timeCursorElem.style.removeProperty("left");
					this.timeCursorElem.style.right = `${(1 - (this.fmod(Math.ceil(this.getXpos(time)), width) + 1) / width) * 100}%`;
				}
			}
		},
		hideErrorMessage() {
			if (this.errorElem) {
				this.errorElem.innerText = "";

				this.nextErr = null;
				this.nextErrType = null;
				this.nextErrPriority = undefined;
				this.errorPriority = -Infinity;
			}
		},
		showErrorMessage(errType, err, priority = 0) {
			if (this.errorElem && priority > this.errorPriority) {
				this.errorElem.dataset.errType = errType;
				this.errorElem.innerText = err.toString();

				this.nextErr = null;
				this.nextErrType = null;
				this.nextErrPriority = undefined;
				this.errorPriority = priority;
			}
		},

		convertUnit(value, from, to) {
			return value; // TODO
		},
		resetTime() {
			this.setByteSample(0, true, true);
			if (!this.isPlaying)
				this.canvasTogglePlay.classList.add("canvas-toggleplay-show");
		},
		setByteSample(value, send = true, clear = false) {
			if (isFinite(value)) {
				this.controlTimeValue.placeholder = this.convertUnit(value, /* TODO */);
				this.byteSample = value;
				if (send)
					this.audioWorklet.port.postMessage({ setByteSample: [value, clear] });
				this.moveTimeCursor();
			}
		},
		setPlaybackMode(playbackMode) {
			this.playbackMode = playbackMode;
			this.updateUrl();
			this.audioWorklet.port.postMessage({ playbackMode });
		},
		setSampleRate(sampleRate) {
			this.sampleRate = sampleRate;
			this.audioWorklet.port.postMessage({ sampleRate, updateSampleRatio: true });
			this.toggleTimeCursor();
		},
		setSampleRateDivisor(sampleRateDivisor) {
			this.audioWorklet.port.postMessage({ sampleRateDivisor, updateSampleRatio: true });
		},
		setPlaySpeed(playSpeed) {
			if (this.playSpeed != playSpeed) {
				this.playSpeed = playSpeed;
				this.audioWorklet.port.postMessage({ playSpeed, updateSampleRatio: true });
			}
		},
		toggleTimeCursor() {
			this.timeCursorElem.classList.toggle('disabled', !this.timeCursorVisible());
		},
		timeCursorVisible() {
			return this.sampleRate >> this.drawScale < 3950;
		},
		togglePlay(isPlaying) {
			if (isPlaying != this.isPlaying) {
				this.canvasTogglePlay.classList.toggle("canvas-toggleplay-pause", isPlaying);
				if (isPlaying) {
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
				this.isPlaying = isPlaying;
				this.audioWorklet.port.postMessage({ isPlaying });
			}
		},/* TODO
	setCounterUnits() {
		this.controlTimeUnit.textContent = this.settings.isSeconds ? 'sec' : 't';
		this.setCounterValue(this.byteSample);
	},

	changeCounterUnits() {
		this.settings.isSeconds = !this.settings.isSeconds;
		this.saveSettings();
		this.setCounterUnits();
	},
	saveSettings() {
		localStorage.settings = JSON.stringify(this.settings);
	},*/
	})
});

bytebeat.init();
if (resolve)
	resolve();