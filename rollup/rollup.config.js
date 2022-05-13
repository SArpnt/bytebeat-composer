import json from "@rollup/plugin-json";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import html from "@web/rollup-plugin-html";
import worker from "rollup-plugin-workers";
import { terser } from "rollup-plugin-terser";
import CleanCSS from "clean-css";

// TODO preload
// TODO prevent moving script tag to end of body
// TODO prevent generating file just to export to html (this does nothing)
// TODO html plugin doesnt grab css file

// rollup-plugin-modulepreload makes preload tags for everything and doesn't replace existing tags
// it can't glob input files
// it replaces the source html instead of modifying the output like it should

const PROD = process.env.NODE_ENV === "production";

const cleanCSS = new CleanCSS({
	level: {
		2: {
			all: true,
		},
	},
});

const config = {
	output: {
		dir: "../dist",
		format: "es",
		entryFileNames: "[name]-[hash].js",
		chunkFileNames: "[name]-[hash].js",
		assetFileNames: "[name]-[hash][extname]",
	},
	plugins: [
		html({
			input: "*.html",
			minify: PROD,
			rootDir: "./src/",
			flattenOutput: false,
			transformAsset: (content, filePath) => {
				if (PROD) {
					if (filePath.endsWith(".css")) {
						const min = cleanCSS.minify(content.toString("utf-8"));
						min.errors.forEach(e => console.error(e)); 
						min.warnings.forEach(w => console.warn(w)); 
						return min.styles;
					}
				}
			},
		}),
		json(),
		nodeResolve(),
		worker(),
	],
};

if (PROD) {
	config.plugins.push(
		terser(),
	);
}

export default config;