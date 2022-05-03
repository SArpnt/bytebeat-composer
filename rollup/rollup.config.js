import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { terser } from "rollup-plugin-terser";

export default {
	input: [
		"./src/scripts/bytebeat.mjs",
		"./src/scripts/audioWorklet.mjs",
		"./src/scripts/embed.mjs",
	],
	output: {
		dir: "../dist/",
		entryFileNames: "[name].mjs",
		format: "es",
	},
	plugins: [json(), nodeResolve(), terser()],
};