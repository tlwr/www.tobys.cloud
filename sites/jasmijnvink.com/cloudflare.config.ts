import { bindings, defineConfig, triggers } from "cf/config";

/**
 * Secret-like files were detected but not read or migrated: .dev.vars.example. Only `secrets.required` entries are migrated.
 * @see https://developers.cloudflare.com/workers/configuration/secrets/
 */

export default defineConfig({
	worker: {
		name: "jasmijnvink-com",
		compatibilityDate: "2025-04-02",
		observability: {
			issues: {
				enabled: true,
			},
		},
		entrypoint: "src/index.ts",
		cache: {
			enabled: true,
			crossVersionCache: true,
		},
		assets: {
			runWorkerFirst: true,
		},
		domains: [
			"jasmijnvink.com",
			"www.jasmijnvink.com",
		],
		triggers: [
			triggers.fetch({
				pattern: "jasmijnvink.com/*",
				zone: "jasmijnvink.com",
			}),
			triggers.fetch({
				pattern: "www.jasmijnvink.com/*",
				zone: "jasmijnvink.com",
			}),
		],
		env: {
			AUTH_ISSUER: bindings.text("https://auth.tobys.cloud"),
			PICTURES: bindings.kv({
				id: "a3cdb6a9c8f44b1b90e6a5315991a558",
			}),
			TAGS: bindings.kv({
				id: "8ea662cf4ce24b7f8a79b7b48f36eddd",
			}),
			IMAGES: bindings.r2({
				name: "jasmijnvink-com-images",
			}),
			ASSETS: bindings.assets(),
		},
	},
});
