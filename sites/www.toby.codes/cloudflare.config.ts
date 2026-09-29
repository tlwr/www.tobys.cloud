import { bindings, defineConfig, triggers } from "cf/config";

/**
 * Secret-like files were detected but not read or migrated: .dev.vars, .dev.vars.example. Only `secrets.required` entries are migrated.
 * @see https://developers.cloudflare.com/workers/configuration/secrets/
 */

export default defineConfig({
	worker: {
		name: "www-toby-codes",
		compatibilityDate: "2025-04-02",
		entrypoint: "src/index.ts",
		cache: {
			enabled: true,
			crossVersionCache: true,
		},
		assets: {
			runWorkerFirst: true,
		},
		domains: [
			"www.toby.codes",
			"toby.codes",
		],
		triggers: [
			triggers.fetch({
				pattern: "www.toby.codes/*",
				zone: "toby.codes",
			}),
			triggers.fetch({
				pattern: "toby.codes/*",
				zone: "toby.codes",
			}),
		],
		env: {
			AUTH_ISSUER: bindings.text("https://auth.tobys.cloud"),
			POSTS: bindings.kv({
				id: "eee5ba33649d476ba1ae336acec193ce",
			}),
			TAGS: bindings.kv({
				id: "bfd932a852ab4ed89154b48ff75ba638",
			}),
			ASSETS: bindings.assets(),
		},
	},
});
