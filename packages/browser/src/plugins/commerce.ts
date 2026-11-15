import { buildCommerce, COMMERCE_HELPERS, type CommerceHelper } from '@beats-analytics/core';
import type { Plugin } from '../client.js';

/**
 * The e-commerce helpers (`productViewed`, `orderCompleted`, ...). Warnings
 * are logged in debug mode; an event the server would reject (and with it
 * the other events of the request) is not sent and its errors are always
 * logged.
 */
export const commerce: Plugin = (ctx) => {
  for (const name of COMMERCE_HELPERS)
    ctx._def(name, (input: never) => {
      const b = buildCommerce(name as CommerceHelper, input, { currency: ctx._o?.currency });
      if (ctx._o?.debug) for (const w of b.warnings) console.warn('[beats]', w);
      if (b.errors.length) return console.warn('[beats] not sent:', ...b.errors);
      ctx._send(b.event, b.properties);
    });
};
