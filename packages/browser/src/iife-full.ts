// Full script-tag build: everything in `@revenexx/beats-browser`.
import { createBeats } from './index.js';
import { boot } from './loader.js';

boot(createBeats());
