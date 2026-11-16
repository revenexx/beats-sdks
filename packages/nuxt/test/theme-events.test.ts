import type { BeatsClient } from '@revenexx/beats-browser';
import { buildCommerce } from '@revenexx/beats-core';
import { describe, expect, it, vi } from 'vitest';
import { listenToThemeEvents, mapThemeEvent, type ThemeEventEnvelope } from '../src/runtime/theme-events.js';

const ITEM = {
  sku: 'LS-B16-1P',
  name: 'Leitungsschutzschalter B16 1-polig',
  brand: 'Hager',
  category_path: ['Installation', 'Schutzgeräte'],
  price_net: 4.18,
  price_gross: 4.97,
  quantity: 10,
  list_position: 3,
};
const BEATS_ITEM = {
  product_id: 'LS-B16-1P',
  name: 'Leitungsschutzschalter B16 1-polig',
  brand: 'Hager',
  category: 'Installation/Schutzgeräte',
  price: 4.18,
  quantity: 10,
  position: 3,
};

let n = 0;
function envelope(event: string, data: Partial<ThemeEventEnvelope> = {}): ThemeEventEnvelope {
  n += 1;
  return {
    schema: 'theme-events/1',
    event,
    event_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    currency: 'EUR',
    ...data,
  };
}

describe('theme event mapping', () => {
  it('maps every commerce event of theme-events/1 onto a beats helper', () => {
    const ec = (e: ThemeEventEnvelope['ecommerce']) => ({ ecommerce: e });
    const cases: [ThemeEventEnvelope, unknown][] = [
      [
        envelope('view_item_list', ec({ list_id: 'category:schutz', list_name: 'Schutzgeräte', items: [ITEM] })),
        { helper: 'productListViewed', input: { list_id: 'category:schutz', list_name: 'Schutzgeräte', items: [BEATS_ITEM], currency: 'EUR' } },
      ],
      [
        envelope('select_item', ec({ list_id: 'search', items: [ITEM] })),
        { helper: 'productClicked', input: { item: BEATS_ITEM, list_id: 'search', currency: 'EUR' } },
      ],
      [envelope('view_item', ec({ items: [ITEM] })), { helper: 'productViewed', input: { item: BEATS_ITEM, currency: 'EUR' } }],
      [
        envelope('search', { search: { search_term: 'leitungsschutzschalter', results_count: 42 } }),
        { helper: 'search', input: { query: 'leitungsschutzschalter', results: 42 } },
      ],
      [envelope('add_to_cart', ec({ value_net: 41.8, items: [ITEM] })), { helper: 'productAdded', input: { items: [BEATS_ITEM], currency: 'EUR' } }],
      [
        envelope('remove_from_cart', ec({ items: [{ ...ITEM, quantity: 2 }] })),
        { helper: 'productRemoved', input: { items: [{ ...BEATS_ITEM, quantity: 2 }], currency: 'EUR' } },
      ],
      [envelope('view_cart', ec({ items: [] })), { helper: 'cartViewed', input: { items: [], currency: 'EUR' } }],
      [
        envelope('begin_checkout', ec({ value_net: 41.8, coupon: 'B2B10', items: [ITEM] })),
        { helper: 'checkoutStarted', input: { items: [BEATS_ITEM], value: 41.8, coupon: 'B2B10', currency: 'EUR' } },
      ],
      [
        envelope('add_shipping_info', ec({ shipping_tier: 'standard', items: [ITEM] })),
        { helper: 'checkoutStep', input: { step: 1, step_name: 'shipping', option: 'standard' } },
      ],
      [
        envelope('add_payment_info', ec({ payment_type: 'invoice', items: [ITEM] })),
        { helper: 'checkoutStep', input: { step: 2, step_name: 'payment', option: 'invoice' } },
      ],
      [
        envelope('purchase', ec({ transaction_id: 'ORD-000123', value_net: 41.8, value_gross: 49.74, tax: 7.94, shipping: 0, items: [ITEM] })),
        { helper: 'orderCompleted', input: { order_id: 'ORD-000123', revenue: 41.8, tax: 7.94, shipping: 0, currency: 'EUR', items: [BEATS_ITEM] } },
      ],
      [envelope('request_quote', ec({ items: [ITEM] })), { helper: 'quoteRequested', input: { items: [BEATS_ITEM], currency: 'EUR' } }],
      [envelope('add_to_orderlist', ec({ items: [ITEM] })), { helper: 'wishlistAdded', input: { items: [BEATS_ITEM], currency: 'EUR', list: 'orderlist' } }],
      [
        envelope('punchout_transfer', { ...ec({ value_net: 41.8, value_gross: 49.74, items: [ITEM] }), punchout: { protocol: 'oci' } }),
        { helper: 'track', event: 'punchout_transfer', properties: { protocol: 'oci', value: 41.8, currency: 'EUR', items_count: 1 } },
      ],
    ];
    for (const [env, expected] of cases) expect(mapThemeEvent(env), env.event).toEqual(expected);
  });

  it('produces input beats accepts without warnings', () => {
    const env = envelope('purchase', {
      ecommerce: { transaction_id: 'ORD-1', value_net: 41.8, value_gross: 49.74, tax: 7.94, shipping: 0, items: [ITEM] },
    });
    const call = mapThemeEvent(env);
    if (call?.helper !== 'orderCompleted') throw new Error('expected orderCompleted');
    const built = buildCommerce('orderCompleted', call.input);
    expect(built.errors).toEqual([]);
    expect(built.warnings).toEqual([]);
    expect(built.event).toBe('$order_completed');
  });

  it('uses gross prices on request, rounds to cents and keeps measured quantities', () => {
    const item = { ...ITEM, price_gross: 4.97123, quantity: 2.5, category_path: [] };
    const call = mapThemeEvent(envelope('add_to_cart', { ecommerce: { items: [item] } }), 'gross');
    expect(call).toEqual({
      helper: 'productAdded',
      input: {
        items: [{ product_id: 'LS-B16-1P', name: ITEM.name, brand: 'Hager', price: 4.97, quantity: 3, measured_quantity: 2.5, position: 3 }],
        currency: 'EUR',
      },
    });
  });

  it('leaves out unknown prices', () => {
    const call = mapThemeEvent(envelope('view_item', { ecommerce: { items: [{ sku: 'X', name: 'On request', price_net: null, quantity: 1 }] } }));
    expect(call).toEqual({ helper: 'productViewed', input: { item: { product_id: 'X', name: 'On request', quantity: 1 }, currency: 'EUR' } });
  });

  it('ignores page views, non-commerce events, other contract versions and broken envelopes', () => {
    for (const event of ['page_view', 'form_submit', 'login', 'sign_up', 'something_else'])
      expect(mapThemeEvent(envelope(event)), event).toBeNull();
    expect(mapThemeEvent({ ...envelope('add_to_cart', { ecommerce: { items: [ITEM] } }), schema: 'theme-events/2' })).toBeNull();
    expect(mapThemeEvent(envelope('view_item', { ecommerce: { items: [] } }))).toBeNull();
    expect(mapThemeEvent(envelope('search'))).toBeNull();
    expect(mapThemeEvent(null as unknown as ThemeEventEnvelope)).toBeNull();
  });
});

describe('theme event intake', () => {
  function fakeClient() {
    return { productAdded: vi.fn(), track: vi.fn() } as unknown as BeatsClient & { productAdded: ReturnType<typeof vi.fn> };
  }
  function fakeTarget() {
    const listeners: ((e: Event) => void)[] = [];
    return {
      addEventListener: (_: string, fn: (e: Event) => void) => listeners.push(fn),
      dispatch: (detail: unknown) => {
        for (const fn of listeners) fn({ detail } as unknown as Event);
      },
    };
  }

  it('takes events from the hook and the DOM, and sends each event_id once', () => {
    const hooks: ((e: ThemeEventEnvelope) => void)[] = [];
    const app = { hook: (_: string, fn: (e: ThemeEventEnvelope) => void) => hooks.push(fn) };
    const client = fakeClient();
    const target = fakeTarget();
    listenToThemeEvents(app, client, 'net', target as unknown as Window);
    const env = envelope('add_to_cart', { ecommerce: { items: [ITEM] } });
    for (const fn of hooks) fn(env);
    target.dispatch(env);
    expect(client.productAdded).toHaveBeenCalledTimes(1);
    target.dispatch(envelope('add_to_cart', { ecommerce: { items: [ITEM] } }));
    expect(client.productAdded).toHaveBeenCalledTimes(2);
  });

  it('never throws into the theme', () => {
    const hooks: ((e: ThemeEventEnvelope) => void)[] = [];
    const client = { productAdded: () => {
      throw new Error('boom');
    } } as unknown as BeatsClient;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    listenToThemeEvents({ hook: (_: string, fn: (e: ThemeEventEnvelope) => void) => hooks.push(fn) }, client);
    expect(() => hooks[0]!(envelope('add_to_cart', { ecommerce: { items: [ITEM] } }))).not.toThrow();
    expect(() => hooks[0]!(undefined as unknown as ThemeEventEnvelope)).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
