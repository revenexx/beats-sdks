// Full script-tag build: everything in `@beats-analytics/browser`.
import { createBeats } from './index.js';
import { boot } from './loader.js';

boot(createBeats());
