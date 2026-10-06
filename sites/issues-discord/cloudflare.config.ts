import { defineConfig, triggers } from "cf/config";

export default defineConfig({
	worker: {
		name: "issues-discord",
		compatibilityDate: "2025-04-02",
		observability: {
			issues: {
				enabled: true,
			},
		},
		entrypoint: "src/index.ts",
		domains: ["issues-discord.tobys.cloud"],
		triggers: [
			triggers.fetch({
				pattern: "issues-discord.tobys.cloud/*",
				zone: "tobys.cloud",
			}),
		],
	},
});
