import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import html from "@web/rollup-plugin-html";
import webWorkerLoader from "rollup-plugin-web-worker-loader";
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
		webWorkerLoader({
			targetPlatform: "browser",
			inline: false,
			extensions: [],

			webWorkerPattern: /a/,
		}),
		/*html({
			rootDir: "src",
			flatten: false,
		}),*/
		//hot_css({
		//	file: "style.css",
		//}),
		json(),
		nodeResolve(),
	],
};

if (process.env.NODE_ENV === "production") {
	config.plugins.push(
		terser(),
	);
}

export default config;