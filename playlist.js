(function () {
	"use strict";
	function $id(id) {
		return document.getElementById(id);
	};

	function parseEntry(entry) {
		if (Array.isArray(entry.code))
			entry.code = entry.code.join('\n');

		return entry;
	}

	function stripEntryToSong({ code, sampleRate, mode }, includeCode = true) {
		if (includeCode)
			return { code, sampleRate, mode };
		else
			return { sampleRate, mode };
	}

	function createEntryElem(entry) {
		let entryElem = document.createElement("li");

		if (entry.description) {
			let descriptionElem;
			if (entry.url)
				descriptionElem = `<a href="${entry.url}" target="_blank">${entry.description}</a>`;
			else
				descriptionElem = entry.description;
			entryElem.innerHTML += descriptionElem;
		}
		if (entry.author) {
			let authorListElem = document.createElement("span");
			authorListElem.innerHTML += entry.description ? " (by " : "by ";
			if (!Array.isArray(entry.author))
				entry.author = [entry.author];

			for (let i in entry.author) {
				let author = entry.author[i];

				let authorElem;
				if (typeof author == "string")
					authorElem = author;
				else {
					authorElem = document.createElement("a");
					authorElem.innerHTML = author[0];
					authorElem.href = author[1];
					authorElem.target = "_blank";
					authorElem = authorElem.outerHTML;
				}
				authorListElem.innerHTML += authorElem;
				if (i < entry.author.length - 1)
					authorListElem.innerHTML += ", ";
			}
			if (entry.description)
				authorListElem.innerHTML += ")";

			authorListElem = authorListElem.outerHTML;

			entryElem.innerHTML += authorListElem;
		}

		if (entry.sampleRate)
			entryElem.innerHTML += ` <span class="samplerate">${entry.sampleRate.substring(0, entry.sampleRate.length - 3)}kHz</span>`;
		if (entry.mode)
			entryElem.innerHTML += ` <span class="samplerate">${entry.mode}</span>`;

		if (entry.starred) {
			let starElem = document.createElement("span");
			starElem.className = [
				"star-white",
				"star-yellow"
			][entry.starred];
			entryElem.append(" ", starElem);
		}

		if (entryElem.innerHTML)
			entryElem.innerHTML += "<br>\n";

		if (entry.codeFile) {
			entryElem.innerHTML += `<a class="code-load" data-code-file="${entry.codeFile}" data-songdata=${JSON.stringify(stripEntryToSong(entry))}>► Click to load pretty code</a>`;
		}
		if (entry.code) {
			let codeElem = document.createElement("code");
			codeElem.innerText = entry.code;
			codeElem.dataset.songdata = JSON.stringify(stripEntryToSong(entry));
			let pre = document.createElement("pre");
			pre.style.margin = "0";
			pre.style.whiteSpace = "pre-wrap";
			pre.append(codeElem);
			entryElem.append(pre);

			entryElem.innerHTML += `<span class="codelength">${entry.code.length}C</span>`;
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

	function addPlaylist(obj, id) {
		let playlist = obj.playlists[id];
		let playlistElem = document.createElement("ul");
		for (let i = 0, len = playlist.length; i < len; ++i) {
			let entry = parseEntry(playlist[i]);
			playlistElem.append(createEntryElem(entry));
		}
		$id(`library-${id}`).append(playlistElem);
	}

	document.addEventListener('DOMContentLoaded', function () {
		let xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function () {
			if (xhr.readyState === 4 && xhr.status === 200) {
				let obj = JSON.parse(xhr.responseText);
				for (let p in obj.playlists)
					addPlaylist(obj, p);
			}
		};
		xhr.open('GET', 'playlists.json', true);
		xhr.send(null);
	});
}());