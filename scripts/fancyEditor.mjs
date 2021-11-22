import { EditorState, EditorView, basicSetup, javascript } from "./codemirror.bundle.min.mjs";
import domLoaded from "./domLoaded.mjs";

let inputListener = null;
const codeEditor = new EditorView({
	state: EditorState.create({
		extensions: [
			basicSetup,
			javascript(),
			EditorView.updateListener.of(v => {
				if (v.docChanged && inputListener)
					inputListener();
			}),
		],
	}),
});

codeEditor.dom.id = "code-editor";

await domLoaded;
document.getElementById("code-editor").replaceWith(codeEditor.dom);

if (!globalThis.hasOwnProperty("bytebeat")) // TODO: all the resolve stuff is a horrible hack
	await new Promise(resolve => globalThis.bytebeat = resolve);

inputListener = globalThis.bytebeat.initCodeEditor(codeEditor);