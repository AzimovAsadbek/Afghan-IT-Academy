import { loadEnvFileForDevelopment } from '../src/config/index.js';

/**
 * The e2e suite boots AppModule directly rather than through main.ts, so the
 * environment file has to be loaded here too — otherwise config validation
 * fails before a single test runs.
 */
loadEnvFileForDevelopment();
