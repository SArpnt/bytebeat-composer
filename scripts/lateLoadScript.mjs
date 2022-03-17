import domLoaded from "./domLoaded.mjs";

export default function lateLoadScript(src) {
	const e = document.createElement("script");
	e.type = "module";
	e.async = "";
	e.src = src;
	domLoaded.then(() => document.head.append(e));
}