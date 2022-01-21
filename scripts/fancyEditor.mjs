import {
	EditorState, EditorView,
	keymap, insertTab, indentLess, defaultKeymap, insertNewline, highlightSpecialChars, history, historyKeymap, classHighlightStyle, bracketMatching, highlightSelectionMatches, searchKeymap, commentKeymap,
	javascript,
} from "./codemirror.min.mjs";
import domLoaded from "./domLoaded.mjs";

let inputListener = null;
const codeEditor = new EditorView({
	state: EditorState.create({
		extensions: [
			keymap.of([
				{ key: "Enter", run: insertNewline },
				{ key: "Tab", run: insertTab },
				{ key: "Shift-Tab", run: indentLess },
				...searchKeymap,
				...commentKeymap,
				...historyKeymap,
				...defaultKeymap,
			]),
			EditorView.lineWrapping,
			highlightSpecialChars(),
			history(),
			classHighlightStyle,
			bracketMatching(),
			highlightSelectionMatches(),
			javascript(),
			EditorView.updateListener.of(v => {
				if (v.docChanged && inputListener)
					inputListener();
			}),
		],
	}),
});

codeEditor.dom.id = "code-editor";

domLoaded.then(async () => {
	if (!globalThis.hasOwnProperty("bytebeat")) // TODO: all the resolve stuff is a horrible hack
		await new Promise(resolve => globalThis.bytebeat = resolve);

	inputListener = globalThis.bytebeat.initCodeEditor(codeEditor);
});