// Minimal script-tag build: pageviews, SPA navigation, page leave, custom events, consent.
import { createClient } from './client.js';
import { boot } from './loader.js';

boot(createClient());
