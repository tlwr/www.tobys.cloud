import { bindings, defineConfig } from "cf/config";

export default defineConfig({
	worker: {
		name: "mischiefs",
		compatibilityDate: "2025-04-02",
		entrypoint: "src/index.ts",
		assets: {
			notFoundHandling: "404-page",
		},
		domains: [
			"mischiefs.nl",
			"www.mischiefs.nl",
		],
		env: {
			ASSETS: bindings.assets(),
		},
	},
});
