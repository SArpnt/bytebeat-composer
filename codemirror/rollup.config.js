import { nodeResolve } from "@rollup/plugin-node-resolve";
import { terser } from "rollup-plugin-terser";

export default {
	input: "./codemirror.mjs",
	output: {
		file: "../scripts/codemirror.bundle.min.mjs",
		format: "es",
	},
	plugins: [nodeResolve(), terser()],
};