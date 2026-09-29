import { defineConfig, triggers } from "cf/config";

export default defineConfig({
	worker: {
		name: "nines",
		compatibilityDate: "2025-04-02",
		entrypoint: "src/index.ts",
		triggers: [
			triggers.fetch({
				pattern: "nines.tobys.cloud/*",
				zone: "tobys.cloud",
			}),
		],
	},
});
