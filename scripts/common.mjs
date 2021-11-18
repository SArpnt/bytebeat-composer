function whenDomContentLoaded() {
	return new Promise((resolve, reject) => {
		if (["interactive", "loaded", "complete"].includes(document.readyState))
			resolve();
		else
			document.addEventListener("DOMContentLoaded", () => resolve());
	});
}

export { whenDomContentLoaded };