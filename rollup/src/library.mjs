import bytebeat from "./bytebeat.mjs";

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
function createByteSnippet(text, onclick) {
	const interactElem = document.createElement("button");
	const codeElem = document.createElement("code");
	interactElem.title = "Click to play this code";
	interactElem.classList = "code-button";
	codeElem.innerText = text;
	interactElem.addEventListener("click", onclick);
	interactElem.append(codeElem);
	return interactElem;
}
function createCodeTypeElem(entry, name) {
	const codeTypeElem = document.createElement("span");
	codeTypeElem.className = `library-song-${name}`;

	const fullSongData = stripEntryToSong(entry, name);
	codeTypeElem.append(createByteSnippet(entry[name], () => bytebeat.setSong(fullSongData)));

	const codeLengthElem = document.createElement("span");
	codeLengthElem.className = "library-song-info";
	codeLengthElem.innerText = `${entry[name].length}C`;
	codeTypeElem.append(" ", codeLengthElem);

	return codeTypeElem;
}
function createEntryElem(entry) {
	const entryElem = document.createElement("li");

	if (entry.description) {
		let descriptionElem;
		if (entry.url) {
			descriptionElem = document.createElement("a");
			descriptionElem.href = entry.url;
			descriptionElem.target = "_blank";
		} else
			descriptionElem = document.createElement("span");
		descriptionElem.innerHTML = entry.description;
		const songElems = Array.from(descriptionElem.getElementsByTagName("byte-snippet"));
		if (songElems.length) {
			for (const elem of songElems) {
				const songData = elem.dataset.songData ? JSON.parse(elem.dataset.songData) : {};
				
				const onclick =
					elem.dataset.hasOwnProperty("codeFile") ?
						() =>
							fetch(`library/${elem.dataset.codeFile}`)
								.then(response => response.text())
								.then(code => bytebeat.setSong(Object.assign(
									songData,
									{ code },
								)))
					:
						() =>
							bytebeat.setSong(Object.assign(
								{ code: elem.innerText },
								songData,
							));

				const snippetElem = createByteSnippet(elem.innerText, onclick);
				elem.replaceWith(snippetElem);
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

			if (typeof author === "string")
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
			if (entry.remixed.description)
				remixElem.append("remix of ", entry.remixed.description);
			else if (entry.author)
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
		/*
		 * TODO: change library format for this to:
		 * "fileCategories": ["minified", "original"]
		 */
		for (const fileType of [
			{ name: "formatted", prop: "fileFormatted" },
			{ name: "minified", prop: "fileMinified" },
			{ name: "optimized", prop: "fileOptimized" },
			{ name: "original", prop: "fileOriginal" },
		]) {
			if (entry[fileType.prop]) {
				const codeFileElem = document.createElement("button");
				codeFileElem.className = "code-load-file";
				codeFileElem.innerText = `\u25b6 ${fileType.name}`;
				const songData = stripEntryToSong(entry);
				codeFileElem.addEventListener("click", () =>
					fetch(`assets/library/${fileType.name}/${entry.file}`)
						.then(response => response.text())
						.then(code => bytebeat.setSong(Object.assign(songData, { code })))
				);
				entryElem.append(codeFileElem, " ");
			}
		}
		entryElem.append(document.createElement("br"));
	}

	{
		let codeOriginalElem = null;
		if (entry.codeOriginal) {
			codeOriginalElem = createCodeTypeElem(entry, "codeOriginal");
			entryElem.append(codeOriginalElem);
		}
		if (entry.codeMinified) {
			const codeMinifiedElem = createCodeTypeElem(entry, "codeMinified");

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
				entryElem.insertBefore(codeTypeToggleElem, codeOriginalElem);
				entryElem.insertBefore(document.createTextNode(" "), codeOriginalElem);
			} else {
				codeTypeToggleElem.disabled = "true";
				entryElem.append(codeTypeToggleElem, " ");
			}

			entryElem.append(codeMinifiedElem);
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

// note: dom is already loaded when this script is ran
wasm.then(e => addLibrary(e.instance.loadLibrary()));
