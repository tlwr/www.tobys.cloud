import { bindings, defineConfig, triggers } from "cf/config";

/**
 * Secret-like files were detected but not read or migrated: .dev.vars, .dev.vars.example. Only `secrets.required` entries are migrated.
 * @see https://developers.cloudflare.com/workers/configuration/secrets/
 */

export default defineConfig({
	worker: {
		name: "auth-tobys-cloud",
		compatibilityDate: "2025-04-02",
		compatibilityFlags: [
			"nodejs_compat",
		],
		entrypoint: "src/index.ts",
		workersDev: false,
		domains: [
			"auth.tobys.cloud",
		],
		triggers: [
			triggers.fetch({
				pattern: "auth.tobys.cloud/*",
				zone: "tobys.cloud",
			}),
		],
		env: {
			AUTH_ISSUER: bindings.text("https://auth.tobys.cloud"),
			// SQL migrations stay in wrangler.toml (migrations/). This format has no migrations_dir field.
			AUDIT: bindings.d1({
				name: "auth-tobys-cloud-audit",
				id: "a3b3bbf1-56dc-42f1-aa4e-22408ef57bd0",
			}),
			USERS: bindings.kv({
				id: "9aa195d53abc46818a9ffa61bbc019af",
			}),
		},
	},
});
