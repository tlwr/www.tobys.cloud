import { bindings, defineConfig } from "cf/config";

/**
 * Secret-like files were detected but not read or migrated: .dev.vars.example. Only `secrets.required` entries are migrated.
 * @see https://developers.cloudflare.com/workers/configuration/secrets/
 */

export default defineConfig({
	worker: {
		name: "utilityroom-club",
		compatibilityDate: "2025-04-02",
		observability: {
			issues: {
				enabled: true,
			},
		},
		entrypoint: "src/index.tsx",
		domains: [
			"utilityroom.club",
		],
		env: {
			AUTH_ISSUER: bindings.text("https://auth.tobys.cloud"),
			PROJECTS: bindings.kv({
				id: "47e06254587f46cfa4904cd122d770b5",
			}),
			ASSETS: bindings.r2({
				name: "utilityroom-club-assets",
			}),
		},
	},
});
