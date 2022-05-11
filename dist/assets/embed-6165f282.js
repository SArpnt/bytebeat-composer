import { i as isPlainObject } from './common-aa272e82.js';

window.addEventListener("message", e => {
	console.info("recieved message", e);
	if (isPlainObject(e.data)) {
		const data = e.data;
		// show/hide elements
		if (isPlainObject(data.show)) {
			for (const [name, ...ids] of [
				["codeEditor", "code-editor-container"],
				["timeControls", show => document.getElementById("controls").dataset.timeControlsDisabled = !show, "canvas-toggleplay", show => document.getElementById("canvas-container").dataset.disabled = !show],
				["playbackControls", show => document.getElementById("controls").dataset.playbackControlsDisabled = !show],
				["viewControls", show => document.getElementById("controls").dataset.viewControlsDisabled = !show,],
				["songControls", show => document.getElementById("controls").dataset.songControlsDisabled = !show,],
				["error", "error"],
				["scope", "canvas-container"],
			])
				if (data.show[name] !== undefined) {
					if (data.show[name])
						for (const id of ids) {
							if (typeof id === "function")
								id(true);
							else
								document.getElementById(id).classList.remove("disabled");
						}
					else
						for (const id of ids) {
							if (typeof id === "function")
								id(false);
							else
								document.getElementById(id).classList.add("disabled");
						}
				}
		}

		if (data.forceScopeWidth !== undefined && globalThis.bytebeat.canvasElem) {
			if (typeof data.forceScopeWidth === "number") {
				globalThis.bytebeat.canvasElem.dataset.forcedWidth = true;
				globalThis.bytebeat.setCanvasWidth(data.forceScopeWidth);
			} else {
				delete bytebeat.canvasElem.dataset.forcedWidth;
				globalThis.bytebeat.autoSizeCanvas();
			}
		}

		if (data.getSong) {
			window.parent.postMessage({ song: globalThis.bytebeat.getSong(true) }, "*");
		}
		if (isPlainObject(data.setSong)) {
			globalThis.bytebeat.setSong(data.setSong, false);
		}
	}
}, false);
