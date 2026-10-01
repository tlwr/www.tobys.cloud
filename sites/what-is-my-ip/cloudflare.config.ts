import { defineConfig, triggers } from "cf/config";

export default defineConfig({
	worker: {
		name: "what-is-my-ip",
		compatibilityDate: "2025-04-02",
		observability: {
			issues: {
				enabled: true,
			},
		},
		entrypoint: "src/index.ts",
		triggers: [
			triggers.fetch({
				pattern: "what-is-my-ip.tobys.cloud/*",
				zone: "tobys.cloud",
			}),
		],
	},
});
