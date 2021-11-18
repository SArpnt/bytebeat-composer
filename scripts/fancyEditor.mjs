import { EditorState, EditorView, basicSetup, javascript } from "./codemirror.bundle.min.mjs";
import { whenDomContentLoaded } from "./common.mjs"

const codeEditor = new EditorView({
	state: EditorState.create({
		extensions: [basicSetup, javascript()],
	}),
	doc: document.getElementById("code-editor").value,
});

globalThis.codeEditor = codeEditor; // TODO: temporary
codeEditor.dom.id = "code-editor";

await whenDomContentLoaded();
document.getElementById("code-editor").replaceWith(codeEditor.dom);

bytebeat.initCodeEditor(codeEditor); // TODO: handle if bytebeat not defined