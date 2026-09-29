import { bindings, defineConfig, triggers } from "cf/config";

export default defineConfig({
	worker: {
		name: "vink-club",
		compatibilityDate: "2025-04-02",
		entrypoint: "src/index.ts",
		assets: {
			runWorkerFirst: false,
		},
		domains: [
			"vink.club",
			"www.vink.club",
		],
		triggers: [
			triggers.fetch({
				pattern: "vink.club/*",
				zone: "vink.club",
			}),
			triggers.fetch({
				pattern: "www.vink.club/*",
				zone: "vink.club",
			}),
		],
		env: {
			ASSETS: bindings.assets(),
		},
	},
});
