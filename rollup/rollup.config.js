import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import html from "@web/rollup-plugin-html";
import worker from "rollup-plugin-workers";
import hot_css from "rollup-plugin-hot-css";
import { terser } from "rollup-plugin-terser";

const config = {
	//input: [
		//"./src/index.html",
		//"./src/assets/bytebeat.js",
		//"./src/assets/audioWorklet.js",
		//"./src/assets/embed.js",
	//],
	output: {
		dir: "../dist",
		format: "es",
		entryFileNames: "assets/[name]-[hash].js",
		chunkFileNames: "assets/[name]-[hash].js",
		assetFileNames: "assets/[name]-[hash][extname]",
	},
	plugins: [
		html({
			input: "*.html",
			minify: process.env.NODE_ENV === "production",
			rootDir: "./src/",
			flattenOutput: false,
		}),
		//hot_css({
		//	file: "style.css",
		//}),
		json(),
		nodeResolve(),
		worker(), // breaks json when used before it, breaks noderesolve entirely
	],
};

if (process.env.NODE_ENV === "production") {
	config.plugins.push(
		terser(),
	);
}

export default config;