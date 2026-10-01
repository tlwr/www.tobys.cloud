import { defineConfig, triggers } from "cf/config";

export default defineConfig({
	worker: {
		name: "pom",
		compatibilityDate: "2025-04-02",
		observability: {
			issues: {
				enabled: true,
			},
		},
		entrypoint: "src/index.ts",
		triggers: [
			triggers.fetch({
				pattern: "pom.tobys.cloud/*",
				zone: "tobys.cloud",
			}),
		],
	},
});
