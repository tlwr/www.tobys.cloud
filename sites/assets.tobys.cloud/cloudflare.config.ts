import { bindings, defineConfig, triggers } from "cf/config";

export default defineConfig({
	worker: {
		name: "assets-tobys-cloud",
		compatibilityDate: "2025-04-02",
		entrypoint: "src/index.ts",
		triggers: [
			triggers.fetch({
				pattern: "assets.tobys.cloud/*",
				zone: "tobys.cloud",
			}),
		],
		env: {
			ASSETS: bindings.assets(),
		},
	},
});
