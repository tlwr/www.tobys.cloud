import { defineWranglerConfig } from "wrangler/experimental-config";

export default defineWranglerConfig({
	build: {
		jsxFactory: "h",
	},
	types: {
		generate: false,
	},
});
