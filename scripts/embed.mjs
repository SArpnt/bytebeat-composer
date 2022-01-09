function isPlainObject(value) {
	if (value && typeof value === "object") {
		const proto = Object.getPrototypeOf(value);
		if (proto && !Object.getPrototypeOf(proto))
			return true;
	}
	return false;
}

globalThis.useLocalStorage = false;
globalThis.useUrlData = false;

window.addEventListener("message", e => {
	console.info("recieved message", e.data);
	if (isPlainObject(e.data)) {
		// show/hide elements
		if (isPlainObject(e.data.show)) {
			for (const [name, ...ids] of [
				["codeEditor", "code-editor-container"],
				["controls", "controls", "canvas-toggleplay", show => document.getElementById("canvas-container").dataset.disabled = !show],
				["error", "error"],
				["scope", "canvas-container"],
			])
				if (e.data.show[name] !== undefined) {
					console.info(name, ids);
					if (e.data.show[name])
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

		if (e.data.forceScopeWidth !== undefined && bytebeat.canvasElem) {
			if (typeof e.data.forceScopeWidth === "number") {
				bytebeat.canvasElem.dataset.forcedWidth = true;
				bytebeat.setCanvasWidth(e.data.forceScopeWidth);
			} else {
				delete bytebeat.canvasElem.dataset.forcedWidth;
				bytebeat.autoSizeCanvas();
			}
		}

		if (e.data.getSong) {
			window.parent.postMessage({ song: bytebeat.getSong(true) });
		}
		if (isPlainObject(e.data.setSong)) {
			bytebeat.setSong(e.data.setSong);
		}
	}
}, false);