import {
	EditorState, EditorView,
	indentUnit, keymap, indentLess, defaultKeymap, insertNewline, highlightSpecialChars, history, historyKeymap, classHighlightStyle, bracketMatching, highlightSelectionMatches, searchKeymap, commentKeymap,
	javascript,
} from "./codemirror.min.mjs";

let inputListener = null;
const codeEditor = new EditorView({
	state: EditorState.create({
		extensions: [
			keymap.of([
				{ key: "Enter", run: insertNewline },
				{ key: "Tab", run: ({ state, dispatch }) => (dispatch(state.replaceSelection("\t")), true), shift: indentLess },
				...searchKeymap,
				...commentKeymap,
				...historyKeymap,
				...defaultKeymap,
			]),
			EditorView.lineWrapping,
			highlightSpecialChars(),
			history(),
			indentUnit.of("\t"),
			EditorState.tabSize.of(3),
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

// bytebeat should already exist when this script is ran
inputListener = globalThis.bytebeat.initCodeEditor(codeEditor);