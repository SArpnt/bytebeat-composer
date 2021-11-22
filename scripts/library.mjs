import domLoaded from "./domLoaded.mjs";

function parseEntry(entry) {
	if (Array.isArray(entry.code))
		entry.code = entry.code.join("\n");

	return entry;
}
function stripEntryToSong({ code, sampleRate, mode }, includeCode = false) {
	if (includeCode)
		return { code, sampleRate, mode };
	else
		return { sampleRate, mode };
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
		descriptionElem.append(document.createTextNode("("), sourceElem, document.createTextNode(")"));
		entryElem.append(descriptionElem);
	}
	if (entry.author) {
		const authorListElem = document.createElement("span");
		if (!Array.isArray(entry.author))
			entry.author = [entry.author];

		for (let i in entry.author) {
			let author = entry.author[i];

			let authorElem;
			if (typeof author == "string")
				authorElem = document.createTextNode(author);
			else {
				authorElem = document.createElement("a");
				authorElem.innerText = author[0];
				authorElem.href = author[1];
				authorElem.target = "_blank";
			}
			authorListElem.append(authorElem);
			if (i < entry.author.length - 1)
				authorListElem.append(document.createTextNode(", "));
		}
		if (entry.description || entry.url) {
			authorListElem.prepend(document.createTextNode(" (by "));
			authorListElem.append(document.createTextNode(")"));
		} else
			authorListElem.prepend(document.createTextNode("by "));

		entryElem.append(authorListElem);
	}

	if (entry.sampleRate) {
		const sampleRateElem = document.createElement("span");
		sampleRateElem.classList = "library-song-info";
		if (entry.sampleRate % 1000 == 0)
			sampleRateElem.innerText = `${entry.sampleRate.substring(0, entry.sampleRate.length - 3)}kHz`;
		else
			sampleRateElem.innerText = `${entry.sampleRate}Hz`;

		entryElem.append(document.createTextNode(" "), sampleRateElem);
	}
	if (entry.mode) {
		const modeElem = document.createElement("span");
		modeElem.classList = "library-song-info";
		modeElem.innerText = entry.mode;

		entryElem.append(document.createTextNode(" "), modeElem);
	}

	if (entry.starred) {
		let starElem = document.createElement("span");
		starElem.className = [
			"star-white",
			"star-yellow",
		][entry.starred - 1];
		entryElem.append(" ", starElem);
	}

	if (entryElem.innerHTML)
		entryElem.append(document.createElement("br"));

	if (entry.codeFile) {
		let codeFileElem = document.createElement("a"); // TODO: make this a button
		codeFileElem.className = "code-load";
		codeFileElem.innerText = "► Click to load pretty code";
		codeFileElem.href = "#";
		const songData = stripEntryToSong(entry);
		codeFileElem.addEventListener("click", () =>
			fetch(`library/${entry.codeFile}`, { cache: "no-cache" })
				.then(response => response.text())
				.then(code => bytebeat.loadCode(Object.assign(songData, { code })))
		);
		entryElem.append(codeFileElem);
		if (entry.code)
			entryElem.append(" ");
	}
	if (entry.code) {
		const codeElem = document.createElement("code");
		codeElem.title = "Click to play this code";
		codeElem.innerText = entry.code;
		const fullSongData = stripEntryToSong(entry, true);
		codeElem.addEventListener("click", () => bytebeat.loadCode(fullSongData));

		const pre = document.createElement("pre");
		pre.style.margin = "0";
		pre.style.whiteSpace = "pre-wrap";
		pre.style.display = "inline";
		pre.append(codeElem);
		entryElem.append(pre);

		const codeLengthElem = document.createElement("span");
		codeLengthElem.classList = "library-song-info";
		codeLengthElem.innerText = `${entry.code.length}C`;
		entryElem.append(document.createTextNode(" "), codeLengthElem);
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
	const playlist = library.playlists[id];
	const playlistElem = document.createElement("ul");
	for (let i = 0, len = playlist.length; i < len; ++i) {
		let entry = parseEntry(playlist[i]);
		playlistElem.append(createEntryElem(entry));
	}
	document.getElementById(`library-${id}`).append(playlistElem);
}


function addAllPlaylists(library) {
	for (let p in library.playlists)
		addPlaylist(library, p);
}

fetch("library.json", { cache: "no-cache" })
	.then(response => response.json())
	.then(library =>
		domLoaded.then(() => addAllPlaylists(library))
	);