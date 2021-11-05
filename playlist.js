(function () {
	"use strict";

<<<<<<< HEAD
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
=======
	let cachedElemParent, cachedTextNode;

	function escapeHTML(text) {
		cachedTextNode.nodeValue = text;
		return cachedElemParent.innerHTML;
	}

	function createEntryElem({ author, children, code, codeFile, description, mode, sampleRate, starred, url }) {
		let entry = '';
		if(description) {
			entry += !url ? description : `<a href="${ url }" target="_blank">${ description }</a>`;
		}
		if(author) {
			let authorsList = '';
			const authorsArr = Array.isArray(author) ? author : [author];
			for(let i = 0, len = authorsArr.length; i < len; ++i) {
				const authorElem = authorsArr[i];
				if(typeof authorElem === 'string') {
					authorsList += description || !url ? authorElem :
						`<a href="${ url }" target="_blank">${ authorElem }</a>`;
				} else {
					authorsList += `<a href="${ authorElem[1] }" target="_blank">${ authorElem[0] }</a>`;
>>>>>>> 54c7adabbc48945e063081839fcbb960cd399332
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
				"star-yellow",
			][entry.starred - 1];
			entryElem.append(" ", starElem);
		}

		if (entryElem.innerHTML)
			entryElem.innerHTML += "<br>\n";

		if (entry.codeFile) {
			let codeFileElem = document.createElement("a");
			codeFileElem.className = "code-load";
			codeFileElem.dataset.codeFile = entry.codeFile;
			codeFileElem.dataset.songdata = JSON.stringify(stripEntryToSong(entry));
			codeFileElem.innerText = "► Click to load pretty code";
			entryElem.append(codeFileElem);
			if (entry.code)
				entryElem.append(" ");
		}
		if (entry.code) {
			let codeElem = document.createElement("code");
			codeElem.innerText = entry.code;
			codeElem.dataset.songdata = JSON.stringify(stripEntryToSong(entry));
			let pre = document.createElement("pre");
			pre.style.margin = "0";
			pre.style.whiteSpace = "pre-wrap";
			pre.style.display = "inline";
			pre.append(codeElem);
			entryElem.append(pre);

			entryElem.innerHTML += ` <span class="codelength">${entry.code.length}C</span>`;
		}

		if (entry.children) {
			let childrenElem = document.createElement("ul");
			for (let i = 0, len = entry.children.length; i < len; ++i) {
				let childEntry = parseEntry(entry.children[i]);
				childrenElem.append(createEntryElem(childEntry));
			}
			entryElem.append(childrenElem);
		}
<<<<<<< HEAD

		return entryElem;
	}

	function addPlaylist(obj, id) {
		let playlist = obj.playlists[id];
		let playlistElem = document.createElement("ul");
		for (let i = 0, len = playlist.length; i < len; ++i) {
			let entry = parseEntry(playlist[i]);
			playlistElem.append(createEntryElem(entry));
		}
		document.getElementById(`library-${id}`).append(playlistElem);
	}


	function addAllPlaylists(obj) {
		for (let p in obj.playlists)
			addPlaylist(obj, p);
	}

	fetch("playlists.json", { cache: "no-cache" })
		.then(response => response.json())
		.then(obj => {
			if (["interactive", "loaded", "complete"].includes(document.readyState))
				addAllPlaylists(obj);
			else
				document.addEventListener("DOMContentLoaded", () => addAllPlaylists(obj));
		});
=======
			entry += `<span>${ description ? ` (by ${ authorsList })` : `by ${ authorsList }` }</span>`;
		}
		if(url && !description && !author) {
			entry += `(<a href="${ url }" target="_blank">source</a>)`;
		}
		if(sampleRate) {
			entry += ` <span class="code-samplerate">${
				sampleRate.substring(0, sampleRate.length - 3) }kHz</span>`;
		}
		if(mode) {
			entry += ` <span class="code-samplerate">${ mode }</span>`;
		}
		let starClass = '';
		if(starred) {
			starClass = ' ' + ['star-white', 'star-yellow'][starred - 1];
		}
		if(code && Array.isArray(code)) {
			code = code.join('\n');
		}
		const songData = code || codeFile ? JSON.stringify({ sampleRate, mode }) : '';
		if(codeFile) {
			entry += ` <a class="code-load" data-songdata='${ songData }' data-code-file="${
				codeFile }" title="Click to load the pretty code">► pretty code</a>`;
		}
		if(entry.length) {
			entry += '<br>\n';
		}
		if(code) {
			entry += `<code data-songdata='${ songData }'>${
				escapeHTML(code) }</code> <span class="code-length">${ code.length }c</span>`;
		}
		if(children) {
			let childrenStr = '';
			for(let i = 0, len = children.length; i < len; ++i) {
				childrenStr += createEntryElem(children[i]);
			}
			entry += `<div class="entry-children">${ childrenStr }</div>`;
		}
		return `<div class="${ code || codeFile || children ? 'entry' : 'entry-text' }${ starClass || '' }">${
			entry }</div>`;
	}
	
	function addPlaylist({ playlists }, id) {
		let playlist = '';
		const playlistArr = playlists[id];
		for(let i = 0, len = playlistArr.length; i < len; ++i) {
			playlist += `<div class="entry-top">${ createEntryElem(playlistArr[i]) }</div>`;
		}
		document.getElementById(`library-${ id }`).insertAdjacentHTML('beforeend', playlist);
	}
	
	document.addEventListener('DOMContentLoaded', () => {
		cachedElemParent = document.createElement('div');
		cachedTextNode = document.createTextNode('');
		cachedElemParent.appendChild(cachedTextNode);
		const xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function() {
			if(xhr.readyState === 4 && xhr.status === 200) {
				const obj = JSON.parse(xhr.responseText);
				for(const p in obj.playlists) {
					addPlaylist(obj, p);
				}
			}
		};
		xhr.open('GET', 'playlists.json', true);
		xhr.setRequestHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
		xhr.send(null);
	});
>>>>>>> 54c7adabbc48945e063081839fcbb960cd399332
})();