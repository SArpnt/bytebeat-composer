import { i as isPlainObject, b as bytebeat } from './bytebeat-494ffa8a.js';

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

		if (data.forceScopeWidth !== undefined && bytebeat.canvasElem) {
			if (typeof data.forceScopeWidth === "number") {
				bytebeat.canvasElem.dataset.forcedWidth = true;
				bytebeat.setCanvasWidth(data.forceScopeWidth);
			} else {
				delete bytebeat.canvasElem.dataset.forcedWidth;
				bytebeat.autoSizeCanvas();
			}
		}

		if (data.getSong)
			window.parent.postMessage({ song: bytebeat.getSong(true) }, "*");
		if (isPlainObject(data.setSong))
			bytebeat.setSong(data.setSong, false);
	}
}, false);
