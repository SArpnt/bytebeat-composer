"use strict";

// this is currently unused because https://www.html5rocks.com/en/tutorials/speed/script-loading/
// currently this one function is just spliced into both scripts once
// this is just here for reference because of that
// could be worse i guess

function whenDomContentLoaded() {
	return new Promise((resolve, reject) => {
		if (["interactive", "loaded", "complete"].includes(document.readyState))
			resolve();
		else
			document.addEventListener("DOMContentLoaded", () => resolve());
	});
}