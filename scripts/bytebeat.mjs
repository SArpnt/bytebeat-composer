import { EditorView } from "./codemirror.min.mjs"; // TODO: remove this
import "https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.3/pako.min.js";
import isPlainObject from "./isPlainObject.mjs";
import domLoaded from "./domLoaded.mjs";

const resolve = globalThis.bytebeat ?? null;

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
		drawSettings: { mode: null, scale: null },
		drawBuffer: [],
		drawImageData: null,
		byteSample: 0,

		isPlaying: false,
		isRecording: false,

		songData: { sampleRate: null, mode: null },
		playSpeed: 1,
		volume: null,

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
		controlDrawMode: null,
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
			let songData = this.getUrlData();
			this.initControls();
			const codeEditorPromise = this.initCodeEditor(document.getElementById("code-editor"));

			this.handleWindowResize(true);
			document.defaultView.addEventListener("resize", this.handleWindowResize.bind(this, false));

			this.loadSettings();

			await initAudioPromise;
			await codeEditorPromise;
			this.setSong(songData, false);
		},

		async initAudioContext() {
			this.audioCtx = new AudioContext();

			const addModulePromise = await this.audioCtx.audioWorklet.addModule("scripts/audioWorklet.mjs");

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
			if (isPlainObject(e.data)) {
				const data = e.data;
				if (data.clearCanvas)
					this.clearCanvas();
				else if (data.clearDrawBuffer)
					this.clearDrawBuffer();

				if (typeof data.byteSample === "number")
					this.setByteSample(data.byteSample, false);
				if (Array.isArray(data.drawBuffer)) {
					this.drawBuffer = this.drawBuffer.concat(data.drawBuffer);
					// prevent buffer accumulation when tab inactive
					const maxDrawBufferSize = this.getTimeFromXpos(this.canvasElem.width) - 1;
					if (this.byteSample - this.drawBuffer[this.drawBuffer.length >> 1].t > maxDrawBufferSize) // reasonable lazy cap
						this.drawBuffer = this.drawBuffer.slice(this.drawBuffer.length >> 1);
					else if (this.drawBuffer.length > maxDrawBufferSize) // emergency cap
						this.drawBuffer = this.drawBuffer.slice(-maxDrawBufferSize);
				}

				if (data.updateUrl)
					this.setUrlData();

				if (data.errorMessage !== undefined) {
					if (isPlainObject(data.errorMessage)) {
						if (
							typeof data.errorMessage.type === "string" &&
							typeof data.errorMessage.err === "string" &&
							typeof (data.errorMessage.priority ?? 0) === "number"
						) {
							if (this.isPlaying) {
								this.nextErrType = data.errorMessage.type;
								this.nextErr = data.errorMessage.err;
								this.nextErrPriority = data.errorMessage.priority;
							} else
								this.showErrorMessage(data.errorMessage.type, data.errorMessage.err, data.errorMessage.priority);
						}
					} else
						this.hideErrorMessage();
				}
			}
		},
		saveData: null,
		initCodeEditor: (function () {
			let resolve = null; // TODO: all the resolve stuff is a horrible hack
			return function initCodeEditor(codeEditor) {
				if (codeEditor instanceof Element) {
					if (codeEditor.tagName === "TEXTAREA") {
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
												if (lines[i][0] === "\t") {
													lines[i] = lines[i].slice(1);
													if (i === startLine)
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
					let selection = null;
					if (this.codeEditor) {
						codeEditor.dispatch({ changes: { from: 0, insert: this.codeEditor.value } });
						if (document.activeElement === this.codeEditor)
							selection = { anchor: this.codeEditor.selectionStart, head: this.codeEditor.selectionEnd };
					}
					(this.codeEditor ?? document.getElementById("code-editor")).replaceWith(codeEditor.dom);
					if (selection) {
						codeEditor.focus();
						codeEditor.dispatch({ selection });
					}
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
			if (window.location.hash && globalThis.useUrlData !== false) {
				if (window.location.hash.startsWith("#v3b64")) {
					let songData;
					try {
						songData = JSON.parse(
							pako.inflateRaw(
								atob(decodeURIComponent(window.location.hash.substr(6))), { to: "string" }
							)
						);
					} catch (err) {
						console.error("Couldn't load data from url:", err);
						songData = null;
					}
					return songData;
				} else
					console.error("Unrecognized url data");
			}
			return null;
		},
		setUrlData() {
			if (globalThis.useUrlData !== false) {
				window.location.hash = "#v3b64" + btoa(pako.deflateRaw(JSON.stringify(this.getSong()), { to: "string" }));
			}
		},
		initControls() {
			this.controlTimeUnit = document.getElementById("control-time-unit");
			this.controlTimeValue = document.getElementById("control-time-value");

			this.controlScaleDown = document.getElementById("control-scaledown");
			this.controlScaleUp = document.getElementById("control-scaleup");

			this.controlDrawMode = document.getElementById("control-draw-mode");
			this.controlPlaybackMode = document.getElementById("control-song-mode");
			this.controlSampleRate = document.getElementById("control-samplerate");
			this.controlVolume = document.getElementById("control-volume");

			this.errorElem = document.getElementById("error");
			this.canvasTogglePlay = document.getElementById("canvas-toggleplay");
			this.timeCursorElem = document.getElementById("canvas-timecursor");
			this.canvasElem = document.getElementById("canvas-main");
			this.canvasCtx = this.canvasElem.getContext("2d", { alpha: false });
		},
		refreshCode() {
			if (this.audioWorklet)
				this.audioWorklet.port.postMessage({ code: this.codeEditorText.trim() });
		},
		handleWindowResize(force) {
			this.autoSizeCanvas(force);
		},
		autoSizeCanvas(force) {
			if (!this.canvasElem.dataset.forcedWidth) {
				if (window.innerWidth >= 768 + 4) // 768 is halfway between 512 and 1024
					this.setCanvasWidth(1024, force);
				else
					this.setCanvasWidth(512, force);
			}
		},
		setCanvasWidth(width, force = false) {
			if (this.canvasElem) {
				if (width !== this.canvasElem.width || force) {
					this.canvasElem.width = width;
					this.contentElem.style.maxWidth = `${width + 4}px`; // TODO: see if it's possible to get rid of this
				}
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

		getSong(includeDefault = false) {
			let songData = { code: this.codeEditorText };
			if (includeDefault || this.songData.sampleRate !== 8000)
				songData.sampleRate = this.songData.sampleRate;
			if (includeDefault || this.songData.mode !== "Bytebeat")
				songData.mode = this.songData.mode;

			return songData;
		},
		setSong(songData, play = true) {
			let code, sampleRate, mode;
			if (songData !== null) {
				({ code, sampleRate, mode } = songData);
				this.codeEditorText = code;
			}
			this.applySampleRate(sampleRate ?? 8000);
			this.applyPlaybackMode(mode ?? "Bytebeat");
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
				this.drawSettings.scale = Math.max(this.drawSettings.scale + amount, 0);
				this.clearCanvas(false);
				if (this.drawSettings.scale <= 0)
					this.controlScaleDown.setAttribute("disabled", true);
				else
					this.controlScaleDown.removeAttribute("disabled");

				this.toggleTimeCursor();
				this.moveTimeCursor();
				this.saveSettings();
			}
		},
		updateDrawMode() {
			this.controlDrawMode.value = this.drawSettings.mode;
		},
		setDrawMode(drawMode = this.controlDrawMode.value, save = true) {
			this.drawSettings.mode = drawMode;
			if (save)
				this.saveSettings();
		},
		setVolume(save = true, volume) {
			if (volume !== undefined) {
				this.volume = volume;
				this.controlVolume.value = volume;
			} else
				this.volume = this.controlVolume.valueAsNumber;

			if (this.audioGain !== null)
				this.audioGain.gain.value = this.volume * this.volume;

			if (save)
				this.saveSettings();
		},

		clearCanvas(clearDrawBuffer = true) {
			if (this.canvasCtx) {
				this.canvasCtx.fillRect(0, 0, this.canvasElem.width, this.canvasElem.height);
				if (clearDrawBuffer)
					this.clearDrawBuffer();
			}
		},
		clearDrawBuffer() {
			this.drawBuffer = [];
			this.drawImageData = null;
		},
		fmod(a, b) { return ((a % b) + b) % b; },
		getXpos(t) { return t / (1 << this.drawSettings.scale); },
		getTimeFromXpos(x) { return x * (1 << this.drawSettings.scale); },
		drawGraphics() {
			const { width, height } = this.canvasElem;

			const bufferLen = this.drawBuffer.length;
			if (!bufferLen)
				return;

			const isWaveform = this.drawSettings.mode === "Waveform";
			const playingForward = this.playSpeed > 0;

			let
				startTime = this.drawBuffer[0].t + (this.drawBuffer.carry ? 1 : 0),
				endTime = this.byteSample,
				lenTime = endTime - startTime,
				startXPos = this.fmod(this.getXpos(startTime), width),
				endXPos = startXPos + this.getXpos(lenTime);

			{
				let
					drawStartX = Math.floor(startXPos),
					drawEndX = Math.floor(endXPos),
					drawLenX = Math.abs(drawEndX - drawStartX) + 1,
					drawOverflow = false;
				// clip draw area if too large
				if (drawLenX > width) { // TODO: put this into a better section so the variables don't all have to be set again
					startTime = this.getTimeFromXpos(this.getXpos(endTime) - width);
					let sliceIndex = 0;
					for (let i in this.drawBuffer) { // TODO: replace this with binary search
						if ((this.drawBuffer[i + 1]?.t ?? endTime) <= startTime - 1)
							sliceIndex += 1;
						else {
							this.drawBuffer[i].t = startTime - 1;
							this.drawBuffer[i].carry = true;
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
				if (this.drawSettings.scale) { // full zoom can't have multiple samples on one pixel
					if (this.drawImageData) {
						if (!drawOverflow) {
							// fill in starting area of image data with previously drawn samples
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
				const iterateOverHorizontalLine = (bufferElem, nextBufferElemTime, callback, initCallback) => {
					const startX = this.fmod(Math.floor(this.getXpos(playingForward ? bufferElem.t : nextBufferElemTime + 1)) - imagePos, width);
					const endX = this.fmod(Math.ceil(this.getXpos(playingForward ? nextBufferElemTime : bufferElem.t + 1)) - imagePos, width);
					if (initCallback)
						initCallback(startX);
					for (let xPos = startX; xPos !== endX; xPos = this.fmod(xPos + 1, width))
						callback(xPos, false);
				};

				for (let i = this.drawBuffer[0].t < startTime ? 1 : 0; i < bufferLen; i++) {
					let lastBufferElem = this.drawBuffer[i - 1] ?? null;
					let bufferElem = this.drawBuffer[i];
					let nextBufferElemTime = this.drawBuffer[i + 1]?.t ?? endTime;
					if (isNaN(bufferElem.value)) {
						iterateOverHorizontalLine(bufferElem, nextBufferElemTime, xPos => {
							for (let h = 0; h < 256; h++) {
								const pos = (drawLenX * h + xPos) << 2;
								imageData.data[pos] = 128;
							}
						});
					} else if (bufferElem.value >= 0 && bufferElem.value < 256) {
						iterateOverHorizontalLine(bufferElem, nextBufferElemTime, xPos => {
							const pos = (drawLenX * (255 - bufferElem.value) + xPos) << 2;
							imageData.data[pos] = imageData.data[pos + 1] = imageData.data[pos + 2] = 255;
						},
							// Waveform draw mode
							isWaveform && lastBufferElem && !isNaN(lastBufferElem.value) &&
							(xPos => {
								const dir = lastBufferElem.value < bufferElem.value ? -1 : 1;
								for (let h = 255 - lastBufferElem.value; h !== 255 - bufferElem.value; h += dir) {
									const pos = (drawLenX * h + xPos) << 2;
									if (imageData.data[pos] === 0) // don't overwrite filled cells
										imageData.data[pos] = imageData.data[pos + 1] = imageData.data[pos + 2] = 150;
								}
							}));
					}
				}
				// put imageData
				this.canvasCtx.putImageData(imageData, imagePos, 0);
				if (endXPos >= width)
					this.canvasCtx.putImageData(imageData, imagePos - width, 0);
				else if (endXPos < 0)
					this.canvasCtx.putImageData(imageData, imagePos + width, 0);
				// write to drawImageData
				if (this.drawSettings.scale) { // full zoom can't have multiple samples on one pixel
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
			this.drawBuffer = [{ t: endTime, value: this.drawBuffer[bufferLen - 1].value, carry: true }];
		},
		moveTimeCursor(time = this.byteSample) {
			if (this.timeCursorElem && this.timeCursorVisible()) {
				const width = this.canvasElem.width;
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
			if (this.errorElem && priority >= this.errorPriority) {
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
			if (this.audioWorklet && isFinite(value)) {
				this.controlTimeValue.placeholder = this.convertUnit(value, /* TODO */);
				this.byteSample = value;
				if (send)
					this.audioWorklet.port.postMessage({ setByteSample: [value, clear] });
				this.moveTimeCursor();
			}
		},
		setPlaybackMode(playbackMode) {
			if (this.audioWorklet) {
				this.songData.mode = playbackMode;
				this.setUrlData();
				this.audioWorklet.port.postMessage({ songData: this.songData });
			}
		},
		setSampleRate(sampleRate) {
			if (this.audioWorklet) {
				this.songData.sampleRate = sampleRate;
				this.audioWorklet.port.postMessage({ songData: this.songData, updateSampleRatio: true });
				this.toggleTimeCursor();
			}
		},
		setSampleRateDivisor(sampleRateDivisor) {
			if (this.audioWorklet)
				this.audioWorklet.port.postMessage({ sampleRateDivisor, updateSampleRatio: true });
		},
		setPlaySpeed(playSpeed) {
			if (this.audioWorklet && this.playSpeed !== playSpeed) {
				this.playSpeed = playSpeed;
				this.audioWorklet.port.postMessage({ playSpeed, updateSampleRatio: true });
			}
		},
		toggleTimeCursor() {
			if (this.timeCursorElem)
				this.timeCursorElem.classList.toggle("disabled", !this.timeCursorVisible());
		},
		timeCursorVisible() {
			return this.songData.sampleRate >> this.drawSettings.scale < 3950;
		},
		togglePlay(isPlaying) {
			if (this.audioWorklet && isPlaying !== this.isPlaying) {
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
					this.animationFrameId = null;
				}
				this.isPlaying = isPlaying;
				this.audioWorklet.port.postMessage({ isPlaying });
			}
		},

		/* TODO
		setTimeUnit() {
			this.controlTimeUnit.textContent = this.settings.isSeconds ? "sec" : "t";
			this.setCounterValue(this.byteSample);

			this.saveSettings();
		},
		changeTimeUnit() {
			this.settings.isSeconds = !this.settings.isSeconds;
			
			this.setCounterUnits();

			this.saveSettings();
		},*/
		saveSettings() {
			if (globalThis.useLocalStorage !== false)
				localStorage.settings = JSON.stringify({ drawSettings: this.drawSettings, volume: this.volume/*, timeUnit: this.timeUnit*/ });
		},
		loadSettings() {
			if (localStorage.settings && globalThis.useLocalStorage !== false) {
				let settings;
				try {
					settings = JSON.parse(localStorage.settings);
				} catch (err) {
					console.error("Couldn't load settings!", localStorage.settings);
					localStorage.clear();
					this.loadDefaultSettings();
					return;
				}
				if (Object.hasOwnProperty.call(settings, "drawSettings")) {
					this.drawSettings = settings.drawSettings;
					this.updateDrawMode();
				}
				if (Object.hasOwnProperty.call(settings, "volume"))
					this.setVolume(false, settings.volume);
				//if (Object.hasOwnProperty.call(settings, "timeUnit"))
				//	this.setTimeUnit(settings.timeUnit);
			} else
				this.loadDefaultSettings();
		},
		loadDefaultSettings() {
			this.setDrawMode(undefined, false);
			this.drawSettings.scale = 5;
			this.setVolume(false);
		}
	})
});

bytebeat.init();
if (resolve)
	resolve();