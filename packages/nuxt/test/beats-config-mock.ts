// Stand-in for the module's build template `#build/beats.config.mjs` in tests
// and type checks; tests set its fields.
import type { BeatsConfig } from '../src/runtime/config.js';

const config: BeatsConfig = {};

export default config;
