import { defineWranglerConfig } from "wrangler/experimental-config";

export default defineWranglerConfig({
	dev: {
		port: 8788,
	},
	types: {
		generate: false,
	},
});
