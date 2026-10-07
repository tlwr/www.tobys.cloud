import { defineConfig, triggers } from "cf/config";

export default defineConfig({
	worker: {
		name: "erg",
		compatibilityDate: "2025-04-02",
		observability: {
			issues: {
				enabled: true,
			},
		},
		entrypoint: "src/index.ts",
		domains: ["erg.tobys.cloud"],
		triggers: [
			triggers.fetch({
				pattern: "erg.tobys.cloud/*",
				zone: "tobys.cloud",
			}),
		],
	},
});
