import { inflateRaw, deflateRaw } from "pako";
import { domLoaded, isPlainObject } from "./common.mjs";
import registerAudioWorklet from "web-worker:./audioWorklet.mjs";

const searchParams = new URLSearchParams(location.search);

const timeUnits = [
	"t",
	"s", // sec
];

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

		timeUnit: null,

		animationFrameId: null,

		canvasElem: null,
		codeEditor: null,
		errorElem: null,
		timeCursorElem: null,

		contentElem: null,

		controlTimeUnit: null,
		controlTimeUnitLabel: null,
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
				this.saveData = function saveData(blob, fileName) {
					const url = URL.createObjectURL(blob);
					a.href = url;
					a.download = fileName;
					a.click();
					setTimeout(() => window.URL.revokeObjectURL(url));
				};
			}

			await this.initAudioContext();

			await domLoaded;

			this.contentElem = document.getElementById("content");
			this.initControls();
			await this.initCodeEditor(document.getElementById("code-editor"));

			import("./fancyEditor.mjs");
			if (globalThis.loadLibrary !== false)
				import("./library.mjs");

			this.handleWindowResize(true);
			document.defaultView.addEventListener("resize", this.handleWindowResize.bind(this, false));

			this.loadSettings();
			const songData = this.getUrlData();
			this.setSong(songData, false);
			this.updateCounterValue();
		},

		async initAudioContext() {
			let audioContextSampleRate = Number(searchParams.get("audioContextSampleRate"));
			if (!(audioContextSampleRate > 0)) // also grabs NaN
				audioContextSampleRate = 48000; // forced samplerate is a hack for 48000 bytebeats since supersampling won't be ready for a while
			// this also makes audio quality consistant on different soundsystems, but not always the best it could be

			this.audioCtx = new AudioContext({
				latencyHint: searchParams.get("audioContextLatencyHint") ?? "balanced",
				sampleRate: audioContextSampleRate,
			});

			this.audioGain = new GainNode(this.audioCtx);
			this.audioGain.connect(this.audioCtx.destination);

			registerAudioWorklet(this.audioCtx);
			class BytebeatProcessor extends AudioWorkletNode {
				constructor(audioContext) {
					super(audioContext, "bytebeatProcessor");
				}
			}
			//await this.audioCtx.audioWorklet.addModule("assets/audioWorklet.mjs");
			//this.audioWorklet = new AudioWorkletNode(this.audioCtx, "bytebeatProcessor", { outputChannelCount: [2] });
			this.audioWorklet.port.addEventListener("message", this.handleMessage.bind(this));
			this.audioWorklet.port.start();
			this.audioWorklet.connect(this.audioGain);
			
			const mediaDest = this.audioCtx.createMediaStreamDestination();
			this.audioRecorder = new MediaRecorder(mediaDest.stream);
			this.audioRecorder.ondataavailable = e => this.recordChunks.push(e.data);
			this.audioRecorder.addEventListener("stop", e => {
				let file, type;
				const types = ["audio/webm", "audio/ogg"];
				const files = ["track.webm", "track.ogg"];
				while ((file = files.pop()) && !MediaRecorder.isTypeSupported(type = types.pop())) {
					if (types.length === 0) {
						alert("Recording not supported in this browser!");
						break;
					}
				}
				this.saveData(new Blob(this.recordChunks, { type }), file);
			});
			this.audioGain.connect(mediaDest);

			console.info(`started audio with latency ${this.audioCtx.baseLatency * this.audioCtx.sampleRate} at ${this.audioCtx.sampleRate}Hz`);
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
		initCodeEditor(codeEditor) {
			if (codeEditor instanceof Element) {
				if (codeEditor.tagName === "TEXTAREA") {
					// textarea
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
				} else {
					throw new Error("code editor is element but not textarea");
				}
			} else if (codeEditor.hasOwnProperty("dom")) {
				// codemirror from fancyeditor.mjs
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
				return this.refreshCode.bind(this);
			} else {
				throw new Error("code editor isn't element or codemirror");
			}
		},
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
				const hash = window.location.hash;
				const version =
					hash.startsWith("#v4") ? 4 :
						hash.startsWith("#v3b64") ? 3 :
							null;
				if (version === 4 || version === 3) {
					let dataString;
					try {
						dataString = atob(hash.substring(version === 4 ? 3 : 6));
					} catch (err) {
						console.error("Couldn't load data from url:", err);
						return null;
					}

					const dataBuffer = new Uint8Array(dataString.length);
					for (const i in dataString)
						dataBuffer[i] = dataString.charCodeAt(i);

					let songData;
					try {
						const songDataString = inflateRaw(dataBuffer, { to: "string" });
						songData = JSON.parse(songDataString);
					} catch (err) {
						console.error("Couldn't load data from url:", err);
						return null;
					}

					return songData;
				} else
					console.error("Unrecognized url data");
			}
			return null;
		},
		setUrlData() {
			if (globalThis.useUrlData !== false) {
				const dataBuffer = deflateRaw(JSON.stringify(this.getSong()));
				const dataString = String.fromCharCode.apply(undefined, dataBuffer);
				window.location.hash = `#v4${btoa(dataString).replaceAll("=", "")}`;
			}
		},
		initControls() {
			this.controlTimeUnit = document.getElementById("control-time-unit");
			this.controlTimeUnitLabel = document.getElementById("control-time-unit-label");
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
				const innerWidth = window.innerWidth;
				if (innerWidth >= 772) { // 768 is halfway between 512 and 1024, 3 added for outline
					let width = 1024;
					while (innerWidth - 516 >= width * 2) // 516px = 4px (outline) + 512px (library)
						width *= 2;
					this.setCanvasWidth(width, innerWidth >= 1540, force); // see media queries in css
				} else
					this.setCanvasWidth(512, false, force);
			}
		},
		setCanvasWidth(width, horiz, force = false) {
			if (this.canvasElem) {
				if (width !== this.canvasElem.width || force) {
					this.canvasElem.width = width;
					// TODO: see if it's possible to get rid of this
					this.contentElem.style.maxWidth = `${width + 4}px`;
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
					if (isNaN(bufferElem.value[0]) || isNaN(bufferElem.value[1]))
						iterateOverHorizontalLine(bufferElem, nextBufferElemTime, xPos => {
							for (let h = 0; h < 256; h++) {
								const pos = (drawLenX * h + xPos) << 2;
								imageData.data[pos] = 96;
							}
						});
					for (let c = 0; c < 2; c++)
						if (bufferElem.value[c] >= 0 && bufferElem.value[c] < 256) { // NaN check is implicit here
							iterateOverHorizontalLine(
								bufferElem,
								nextBufferElemTime,
								xPos => {
									const pos = (drawLenX * (255 - bufferElem.value[c]) + xPos) << 2;
									if (c)
										imageData.data[pos] = imageData.data[pos + 2] = 255;
									else {
										imageData.data[pos] = 0; // clear out NaN red
										imageData.data[pos + 1] = 255;
									}
								},
								// Waveform draw mode connectors
								isWaveform && lastBufferElem && !isNaN(lastBufferElem.value[c]) &&
								(xPos => {
									const dir = lastBufferElem.value[c] < bufferElem.value[c] ? -1 : 1;
									for (let h = 255 - lastBufferElem.value[c]; h !== 255 - bufferElem.value[c]; h += dir) {
										const pos = (drawLenX * h + xPos) << 2;
										if (imageData.data[pos] === 0) { // don't overwrite filled cells
											if (c)
												imageData.data[pos] = imageData.data[pos + 2] = 150;
											else {
												imageData.data[pos] = 0; // clear out NaN red
												imageData.data[pos + 1] = 150;
											}
										}
									}
								})
							);
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
			if (this.errorElem && (this.errorPriority < 2 || priority > 0)) {
				this.errorElem.dataset.errType = errType;
				this.errorElem.innerText = err.toString();

				this.nextErr = null;
				this.nextErrType = null;
				this.nextErrPriority = undefined;
				this.errorPriority = priority;

				if (this.audioWorklet)
					this.audioWorklet.port.postMessage({ displayedError: true });
			}
		},

		resetTime() {
			this.setByteSample(0, true, true);
			if (!this.isPlaying)
				this.canvasTogglePlay.classList.add("canvas-toggleplay-show");
		},
		setByteSample(value, send = true, clear = false) {
			if (this.audioWorklet && isFinite(value)) {
				this.byteSample = value;
				this.updateCounterValue();
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

		updateCounterValue() {
			this.controlTimeValue.placeholder = this.convertToUnit(this.byteSample);
		},
		convertFromUnit(value, unit = this.timeUnit) {
			switch (unit) {
				case "t": return value;
				case "s": return value * this.songData.sampleRate;
			}
		},
		// IMPORTANT: this function is ONLY used for text formatting, does not work for many conversions, and is inaccurate.
		convertToUnit(value, unit = this.timeUnit) {
			switch (unit) {
				case "t": return value;
				case "s": return (value / this.songData.sampleRate).toFixed(3);
			}
		},
		setTimeUnit(value, updateCounter = true) {
			if (value !== undefined) {
				if (typeof value === "number")
					value = timeUnits[value];
				this.timeUnit = value;
				this.controlTimeUnitLabel.innerText = this.timeUnit;
			} else
				this.timeUnit = this.controlTimeUnitLabel.innerText;

			if (updateCounter)
				this.updateCounterValue();
			this.saveSettings();
		},
		changeTimeUnit() {
			this.timeUnit = timeUnits[(timeUnits.indexOf(this.timeUnit) + 1) % timeUnits.length];
			this.controlTimeUnitLabel.innerText = this.timeUnit;

			this.updateCounterValue();
			this.saveSettings();
		},
		saveSettings() {
			if (globalThis.useLocalStorage !== false)
				localStorage.settings = JSON.stringify({ drawSettings: this.drawSettings, volume: this.volume, timeUnit: this.timeUnit });
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
				} else {
					this.setDrawMode(undefined, false);
					this.drawSettings.scale = 5;
				}

				if (Object.hasOwnProperty.call(settings, "volume"))
					this.setVolume(false, settings.volume);
				else
					this.setVolume(false);

				if (Object.hasOwnProperty.call(settings, "timeUnit"))
					this.setTimeUnit(settings.timeUnit, false);
				else
					this.setTimeUnit(undefined, false);
			} else
				this.loadDefaultSettings();
		},
		loadDefaultSettings() {
			this.setDrawMode(undefined, false);
			this.drawSettings.scale = 5;
			this.setVolume(false);
			this.setTimeUnit(undefined, false);
		}
	})
});

bytebeat.init();