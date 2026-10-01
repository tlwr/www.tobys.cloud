import { defineConfig, triggers } from "cf/config";

export default defineConfig({
	worker: {
		name: "page-404",
		compatibilityDate: "2025-04-02",
		observability: {
			issues: {
				enabled: true,
			},
		},
		entrypoint: "src/index.ts",
		triggers: [
			triggers.fetch({
				pattern: "*.tobys.cloud/*",
				zone: "tobys.cloud",
			}),
			triggers.fetch({
				pattern: "*.toby.codes/*",
				zone: "toby.codes",
			}),
		],
	},
});
