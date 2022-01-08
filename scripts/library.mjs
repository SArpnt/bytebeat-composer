import domLoaded from "./domLoaded.mjs";

function parseEntry(entry) {
	if (Array.isArray(entry.codeOriginal))
		entry.codeOriginal = entry.codeOriginal.join("\n");

	return entry;
}
function stripEntryToSong(entry, codeType = undefined) {
	const { sampleRate, mode } = entry;
	let code = null;
	if (codeType)
		code = entry[codeType];
	if (code)
		return { code, sampleRate, mode };
	else
		return { sampleRate, mode };
}
function createEntryElem(entry) {
	const entryElem = document.createElement("li");

	if (entry.starred) {
		entryElem.classList.add([
			"star-white",
			"star-yellow",
		][entry.starred - 1]);
	}

	if (entry.description) {
		let descriptionElem;
		if (entry.url) {
			descriptionElem = document.createElement("a");
			descriptionElem.href = entry.url;
			descriptionElem.target = "_blank";
		} else
			descriptionElem = document.createElement("span");
		descriptionElem.innerHTML = entry.description;
		const songElems = Array.from(descriptionElem.querySelectorAll("code, [data-code-file], [data-song-data]"));
		if (songElems.length) {
			for (let elem of songElems) {
				const songData = elem.dataset.songData ? JSON.parse(elem.dataset.songData) : {};
				if (elem.dataset.hasOwnProperty("codeFile")) {
					elem.addEventListener("click", () =>
						fetch(`library/${elem.dataset.codeFile}`, { cache: "no-cache" })
							.then(response => response.text())
							.then(code => bytebeat.loadCode(Object.assign(
								songData,
								{ code },
							)))
					);
				} else {
					elem.addEventListener("click", () =>
						bytebeat.loadCode(Object.assign(
							{ code: elem.innerText },
							songData,
						))
					);
				}
			}
		}
		entryElem.append(descriptionElem);
	} else if (entry.url) {
		const descriptionElem = document.createElement("span");
		const sourceElem = document.createElement("a");
		sourceElem.href = entry.url;
		sourceElem.target = "_blank";
		sourceElem.innerText = "source";
		descriptionElem.append("(", sourceElem, ")");
		entryElem.append(descriptionElem);
	}
	if (entry.author) {
		const authorListElem = document.createElement("span");
		if (!Array.isArray(entry.author))
			entry.author = [entry.author];

		for (let i in entry.author) {
			let author = entry.author[i];

			if (typeof author == "string")
				authorListElem.append(author);
			else {
				const authorElem = document.createElement("a");
				authorElem.innerText = author[0];
				authorElem.href = author[1];
				authorElem.target = "_blank";
				authorListElem.append(authorElem);
			}
			if (i < entry.author.length - 1)
				authorListElem.append(", ");
		}
		if (entry.description || entry.url) {
			authorListElem.prepend(" (by ");
			authorListElem.append(")");
		} else
			authorListElem.prepend("by ");

		entryElem.append(authorListElem);
	}
	if (entry.remixed) {
		if (entryElem.innerHTML)
			entryElem.append(" ");

		const remixElem = document.createElement("span");
		remixElem.append("(");

		if (entry.remixed.url) {
			const urlElem = document.createElement("a");
			urlElem.href = entry.url;
			urlElem.target = "_blank";
			if (entry.description) {
				urlElem.innerHTML = entry.remixed.description;
				remixElem.append("remix of ", urlElem);
			} else if (entry.remixed.author) {
				urlElem.innerText = "song";
				remixElem.append("remix of ", urlElem);
			} else {
				urlElem.innerText = "remix";
				remixElem.append(urlElem);
			}
		} else {
			if (entry.description) {
				const descriptionElem = document.createElement("span");
				descriptionElem.innerHTML = entry.remixed.description;
				remixElem.append("remix of ", description);
			} else if (entry.author)
				remixElem.append("remix of song");
			else
				remixElem.append("remix");
		}

		if (entry.remixed.author)
			remixElem.append(` by ${entry.remixed.author}`);

		remixElem.append(")");
		entryElem.append(remixElem);
	}

	if (entry.date) {
		const dateElem = document.createElement("span");
		dateElem.className = "library-song-info";
		dateElem.innerText = `(${entry.date})`;

		entryElem.append(" ", dateElem);
	}
	if (entry.sampleRate) {
		const sampleRateElem = document.createElement("span");
		sampleRateElem.className = "library-song-info";
		if (entry.sampleRate % 1000 == 0)
			sampleRateElem.innerText = `${entry.sampleRate.toString().substring(0, entry.sampleRate.length - 3)}kHz`;
		else
			sampleRateElem.innerText = `${entry.sampleRate}Hz`;

		entryElem.append(" ", sampleRateElem);
	}
	if (entry.mode) {
		const modeElem = document.createElement("span");
		modeElem.className = "library-song-info";
		modeElem.innerText = entry.mode;

		entryElem.append(" ", modeElem);
	}

	if (entryElem.innerHTML)
		entryElem.append(document.createElement("br"));


	if (entry.file) {
		for (const fileType of [
			{ name: "formatted", prop: "fileFormatted" },
			{ name: "minified", prop: "fileMinified" },
			{ name: "original", prop: "fileOriginal" },
		]) {
			if (entry[fileType.prop]) {
				const codeFileElem = document.createElement("button");
				codeFileElem.className = "code-load-file";
				codeFileElem.innerText = `\u25b6 ${fileType.name}`;
				const songData = stripEntryToSong(entry);
				codeFileElem.addEventListener("click", () =>
					fetch(`library/${fileType.name}/${entry.file}`, { cache: "no-cache" })
						.then(response => response.text())
						.then(code => bytebeat.loadCode(Object.assign(songData, { code })))
				);
				entryElem.append(codeFileElem, " ");
			}
		}
		entryElem.append(document.createElement("br"));
	}

	{
		function createCodeTypeElem(name) {
			const codeTypeElem = document.createElement("span");
			codeTypeElem.className = `library-song-${name}`;

			const codeElem = document.createElement("code");
			codeElem.title = "Click to play this code";
			codeElem.innerText = entry[name];
			const fullSongData = stripEntryToSong(entry, name);
			codeElem.addEventListener("click", () => bytebeat.loadCode(fullSongData));
			codeTypeElem.append(codeElem);

			const codeLengthElem = document.createElement("span");
			codeLengthElem.className = "library-song-info";
			codeLengthElem.innerText = `${entry[name].length}C`;
			codeTypeElem.append(" ", codeLengthElem);

			return codeTypeElem;
		}
		let codeOriginalElem = null;
		if (entry.codeOriginal) {
			codeOriginalElem = createCodeTypeElem("codeOriginal");
			entryElem.append(codeOriginalElem);
		}
		if (entry.codeMinified) {
			const codeMinifiedElem = createCodeTypeElem("codeMinified");
			entryElem.append(codeMinifiedElem);

			const codeTypeToggleElem = document.createElement("button");
			codeTypeToggleElem.className = "code-type-toggle";
			codeTypeToggleElem.innerText = "minified";

			if (entry.codeOriginal) {
				codeOriginalElem.classList.add("disabled");
				codeTypeToggleElem.addEventListener("click", () => {
					if (codeTypeToggleElem.innerText === "minified") {
						codeTypeToggleElem.innerText = "original";
						codeOriginalElem.classList.remove("disabled");
						codeMinifiedElem.classList.add("disabled");
					} else {
						codeTypeToggleElem.innerText = "minified";
						codeMinifiedElem.classList.remove("disabled");
						codeOriginalElem.classList.add("disabled");
					}
				});
			} else {
				codeTypeToggleElem.disabled = "true";
			}

			entryElem.append(" ", codeTypeToggleElem);
		}
	}


	if (entry.children) {
		let childrenElem = document.createElement("ul");
		for (let i = 0, len = entry.children.length; i < len; ++i) {
			let childEntry = parseEntry(entry.children[i]);
			childrenElem.append(createEntryElem(childEntry));
		}
		entryElem.append(childrenElem);
	}

	return entryElem;
}

function addPlaylist(library, id) {
	const playlist = library[id];
	const playlistElem = document.createElement("ul");
	for (let i = 0, len = playlist.length; i < len; ++i) {
		let entry = parseEntry(playlist[i]);
		playlistElem.append(createEntryElem(entry));
	}
	document.getElementById(`library-${id}`).append(playlistElem);
}


function addLibrary(library) {
	for (let p in library)
		addPlaylist(library, p);
}

fetch("library/library.json", { cache: "no-cache" })
	.then(response => response.json())
	.then(library =>
		domLoaded.then(() => addLibrary(library))
	);