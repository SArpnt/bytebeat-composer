(function () {
	'use strict';
	function $id(id) {
		return document.getElementById(id);
	};

	function processCodeHTML(code, sRate) {
		if (typeof code !== 'string')
			code = code.join('@!@LINE_BREAK@!@');
		return '<code' + (sRate ? ' samplerate="' + sRate + '"' : '') + '>' +
			code.replace(/&/g, '&amp;')
				.replace(/>/g, '&gt;')
				.replace(/</g, '&lt;')
				.replace(/ /g, '&#xA0;')
				.replace(/@!@LINE_BREAK@!@/g, '<br>\r\n') +
			'</code>';
	}

	function getEntryHTML(entry, isChildren) {
		let descr = entry.description;
		let author = entry.author;
		let url = entry.url;
		let authorHTML = '';
		if (author) {
			if (typeof author === 'string') {
				authorHTML = !url ? author : '<a href="' + url + '" target="_blank">' + author + '</a>';
			} else {
				let authorsArr = [];
				for (let j = 0, aLen = author.length; j < aLen; ++j) {
					authorsArr.push('<a href="' + author[j][1] + '" target="_blank">' + author[j][0] + '</a>');
				}
				authorHTML = authorsArr.join(', ');
			}
			authorHTML = descr ? ' (by ' + authorHTML + ')' : 'by ' + authorHTML;
		}
		let descrHTML = '';
		if (descr)
			descrHTML = author || !url ? descr : '<a href="' + url + '" target="_blank">' + descr + '</a>';
		descrHTML += authorHTML;
		let code = entry.code;
		let lCode = entry.loadcode;
		let sRate = entry.samplerate;
		let starHTML = sRate ? ' <span class="samplerate">' + sRate.substr(0, 2) + 'kHz</span>' : '';
		switch (entry.starred) {
			case 1: starHTML += ' <span class="star-white"></span>'; break;
			case 2: starHTML += ' <span class="star-yellow"></span>';
		}
		let descr2HTML = entry.description2 ? ' - ' + entry.description2 : '';
		let codeLen = !code ? 0 : '<span class="codelength">' +
			(code instanceof Array ? code.join('').length : code.length) + 'B</span>';
		let codeHTML = !code && !lCode ? '' :
			(lCode ? '<a class="code-load" loadcode="' + lCode + '"' +
				(sRate ? ' samplerate="' + sRate + '"' : '') +
				'>&#9658; Click to load  pretty code</a>' + (code ? '</br>' : '') : '') +
			(code ? processCodeHTML(code, sRate) + ' ' + codeLen : '');
		return isChildren ?
			codeHTML + (descrHTML ? starHTML + ' ' + descrHTML : starHTML) + descr2HTML :
			descrHTML + (code || lCode ? starHTML + '<br>\r\n' + codeHTML + descr2HTML : '');
	}

	function addPlaylist(obj, id) {
		let html = [];
		let arr = obj.playlist[id];
		for (let i = 0, len = arr.length; i < len; ++i) {
			let entry = arr[i];
			let entryHTML = [getEntryHTML(entry, false)];
			let children = entry.children;
			if (children)
				for (let j = 0, cLen = children.length; j < cLen; ++j)
					entryHTML.push(getEntryHTML(children[j], true));
			html.push(entryHTML.join('<br>\r\n'));
		}
		$id('library-' + id).innerHTML = '<ul><li>' + html.join('</li>\r\n<li>') + '</li></ul>';
	}

	document.addEventListener('DOMContentLoaded', function () {
		let xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function () {
			if (xhr.readyState === 4 && xhr.status === 200) {
				let obj = JSON.parse(xhr.responseText);
				addPlaylist(obj, 'classic8khz');
				addPlaylist(obj, 'js8khz');
				addPlaylist(obj, 'highrate1k');
				addPlaylist(obj, 'bigcode');
				addPlaylist(obj, 'sthephanshi');
			}
		};
		xhr.open('GET', 'playlist.json', true);
		xhr.send(null);
	});
}());