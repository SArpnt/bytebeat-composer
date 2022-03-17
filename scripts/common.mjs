const domLoaded = new Promise(resolve => {
	if (document.readyState === "loading")
		document.addEventListener("DOMContentLoaded", () => resolve());
	else
		resolve();
});

function isPlainObject(value) {
	if (value && typeof value === "object") {
		const proto = Object.getPrototypeOf(value);
		if (proto && !Object.getPrototypeOf(proto))
			return true;
	}
	return false;
}

function loadScriptLate(src) {
	const e = document.createElement("script");
	e.type = "module";
	e.async = "";
	e.src = src;
	domLoaded.then(() => document.head.append(e));
}

export { domLoaded, isPlainObject, loadScriptLate };