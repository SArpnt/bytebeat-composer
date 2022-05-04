import { defaultKeymap, insertNewline, indentLess } from "@codemirror/commands";
import { commentKeymap } from "@codemirror/comment";
import { classHighlightStyle } from "@codemirror/highlight";
import { history, historyKeymap } from "@codemirror/history";
import { javascript } from "@codemirror/lang-javascript";
import { indentUnit } from "@codemirror/language";
import { bracketMatching } from "@codemirror/matchbrackets";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, highlightSpecialChars } from "@codemirror/view";

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
codeEditor.dom.ariaLabel = "Code editor";

// bytebeat should already exist when this script is ran
inputListener = globalThis.bytebeat.initCodeEditor(codeEditor);