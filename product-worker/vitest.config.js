import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		// Vitest config - only used if explicitly running vitest
		// Integration tests use mocha via npm run test:integration
		include: ['test/**/*.spec.js'],
		exclude: ['test/unit/**', 'test/integration/**', 'node_modules/**'],
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
			},
		},
	},
});
