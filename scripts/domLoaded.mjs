export default new Promise(resolve => {
	if (["interactive", "loaded", "complete"].includes(document.readyState))
		resolve();
	else
		document.addEventListener("DOMContentLoaded", () => resolve());
});