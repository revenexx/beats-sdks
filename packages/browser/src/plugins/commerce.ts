import { buildCommerce, COMMERCE_HELPERS, type CommerceHelper } from '@beats-analytics/core';
import type { Plugin } from '../client.js';

/** The e-commerce helpers (`productViewed`, `orderCompleted`, ...). */
export const commerce: Plugin = (ctx) => {
  for (const name of COMMERCE_HELPERS)
    ctx._def(name, (input: never) => {
      const b = buildCommerce(name as CommerceHelper, input, { currency: ctx._o?.currency });
      if (ctx._o?.debug) for (const w of b.warnings) console.warn('[beats]', w);
      ctx._send(b.event, b.properties);
    });
};
