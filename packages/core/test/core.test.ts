import { describe, expect, it } from 'vitest';
import {
  browserBody,
  buildCommerce,
  checkEventName,
  COMMERCE_HELPERS,
  endpoint,
  formatAmount,
  isRetryable,
  itemsValue,
  normalizeItem,
  serverBody,
  uuid,
  type CommerceHelper,
} from '../src/index.js';
import golden from './golden/commerce.json' with { type: 'json' };

describe('formatAmount', () => {
  it.each([
    [12, '12.00'],
    [12.5, '12.50'],
    [129.9, '129.90'],
    [1.005, '1.01'],
    [0.1 + 0.2, '0.30'],
    [-3.999, '-4.00'],
    [-0.001, '0.00'],
    [0, '0.00'],
    ['12', '12.00'],
    ['12.5', '12.50'],
    [' 007.25 ', '7.25'],
    ['-3.99', '-3.99'],
    ['-0.00', '0.00'],
    ['1.005', '1.01'],
    ['99999999999999.99', '99999999999999.99'],
  ])('%j -> %s', (input, expected) => {
    expect(formatAmount(input)).toBe(expected);
  });

  it.each([['abc'], ['1,50'], ['1e3'], [''], [Number.NaN], [Number.POSITIVE_INFINITY], [null], [{}], [true]])(
    'rejects %j',
    (input) => {
      expect(formatAmount(input)).toBeUndefined();
    },
  );
});

describe('normalizeItem', () => {
  it('defaults quantity to 1 and formats amounts', () => {
    const w: string[] = [];
    expect(normalizeItem({ product_id: 'a', price: 3, discount: '0.5' }, 'x', w)).toEqual({
      product_id: 'a',
      price: '3.00',
      discount: '0.50',
      quantity: 1,
    });
    expect(w).toEqual([]);
  });

  it('reports a missing id as an error and corrects amounts, quantities, currencies and text fields', () => {
    const w: string[] = [];
    const e: string[] = [];
    const item = normalizeItem(
      { price: 'ten', quantity: 2.4, currency: 'euro', position: 1.5, color: 'red', name: 42 as never, brand: { x: 1 } as never },
      'it',
      w,
      e,
    );
    expect(item).toEqual({ quantity: 2, color: 'red', name: '42' });
    expect(e).toEqual(['it has neither product_id nor sku']);
    expect(w).toHaveLength(5);
    expect(w.join('\n')).toMatch(/brand must be a string/);
    expect(w.join('\n')).toMatch(/price is not a decimal amount/);
    expect(w.join('\n')).toMatch(/quantity must be a non-negative integer/);
    expect(w.join('\n')).toMatch(/currency is not an ISO 4217 code/);
    expect(w.join('\n')).toMatch(/position must be an integer/);
  });

  it('accepts quantity 0 and replaces a negative one', () => {
    const w: string[] = [];
    expect(normalizeItem({ sku: 'a', quantity: 0 }, 'x', w).quantity).toBe(0);
    expect(normalizeItem({ sku: 'a', quantity: -2 }, 'x', w).quantity).toBe(1);
    expect(w).toHaveLength(1);
  });

  it('keeps extra fields and does not modify the input', () => {
    const input = { sku: 's', price: 1, size: 'XL' };
    normalizeItem(input, 'x', []);
    expect(input).toEqual({ sku: 's', price: 1, size: 'XL' });
  });

  it('warns when amounts are rounded', () => {
    const w: string[] = [];
    expect(normalizeItem({ sku: 's', price: 1.999 }, 'x', w).price).toBe('2.00');
    expect(w[0]).toMatch(/rounded to 2.00/);
  });
});

describe('itemsValue', () => {
  it('sums price * quantity - discount in cents', () => {
    expect(
      itemsValue([
        { price: '0.10', quantity: 3 },
        { price: '0.20', quantity: 1, discount: '0.05' },
      ]),
    ).toBe('0.45');
    expect(itemsValue([{ quantity: 1 }])).toBeUndefined();
  });
});

describe('buildCommerce golden payloads (docs/events.md)', () => {
  it('covers every helper', () => {
    const covered = new Set(golden.map((c) => c.helper));
    expect([...covered].sort()).toEqual([...COMMERCE_HELPERS].sort());
  });

  for (const c of golden) {
    it(`${c.helper} -> ${c.expected.event}`, () => {
      const built = buildCommerce(c.helper as CommerceHelper, c.input as never, c.defaults);
      expect({ event: built.event, properties: built.properties }).toEqual(c.expected);
      expect(built.warnings).toEqual(c.warnings);
      expect(built.errors).toEqual([]);
    });
  }
});

describe('buildCommerce validation', () => {
  it('inherits the currency from the first item when the event has none', () => {
    const b = buildCommerce('productAdded', { items: [{ sku: 'a', price: 1, currency: 'usd' }] });
    expect(b.properties.currency).toBe('USD');
  });

  it('prefers the event currency over the default', () => {
    const b = buildCommerce('productAdded', { currency: 'GBP', items: [{ sku: 'a' }] }, { currency: 'EUR' });
    expect(b.properties.currency).toBe('GBP');
  });

  it('requires order_id and warns about missing revenue', () => {
    const b = buildCommerce('orderCompleted', { currency: 'EUR' } as never);
    expect(b.errors).toEqual(['$order_completed: order_id is required']);
    expect(b.warnings).toEqual(['$order_completed: revenue is missing']);
  });

  it('rejects negative order revenue, items without ids and too many items', () => {
    expect(buildCommerce('orderCompleted', { order_id: 'o', revenue: -1, currency: 'EUR' }).errors).toEqual([
      '$order_completed: revenue must not be negative',
    ]);
    expect(buildCommerce('productAdded', { items: [{ name: 'x' }] }).errors).toEqual(['$product_added: items[0] has neither product_id nor sku']);
    const many = Array.from({ length: 201 }, (_, i) => ({ sku: String(i) }));
    expect(buildCommerce('wishlistAdded', { items: many }).errors).toEqual(['$wishlist_added: more than 200 items']);
  });

  it('turns a negative refund into a positive amount', () => {
    const b = buildCommerce('orderRefunded', { order_id: 'o', revenue: -5, currency: 'EUR' });
    expect(b.properties.revenue).toBe('5.00');
    expect(b.warnings[0]).toMatch(/must be positive/);
  });

  it('warns about amounts without a currency', () => {
    const b = buildCommerce('cartViewed', { items: [{ sku: 'a', price: 2 }] });
    expect(b.properties.value).toBe('2.00');
    expect(b.warnings).toEqual(['$cart_viewed: amounts without a currency']);
  });

  it('warns when a single-item event gets several items', () => {
    const b = buildCommerce('productViewed', { items: [{ sku: 'a' }, { sku: 'b' }] } as never, { currency: 'EUR' });
    expect(b.warnings).toEqual(['$product_viewed: expects exactly one item']);
  });

  it('warns about missing items, query and step', () => {
    expect(buildCommerce('productAdded', {} as never).warnings).toEqual(['$product_added: items are missing']);
    expect(buildCommerce('search', {} as never).warnings).toEqual(['$search: query is missing']);
    expect(buildCommerce('checkoutStep', { step: 'two' } as never).warnings).toEqual(['$checkout_step: step must be an integer']);
    expect(buildCommerce('wishlistAdded', { items: 'x' } as never).warnings).toEqual(['$wishlist_added: items must be a list']);
  });

  it('rejects unknown helpers', () => {
    expect(() => buildCommerce('nope' as CommerceHelper, {} as never)).toThrow(TypeError);
  });
});

describe('protocol', () => {
  it('builds endpoints and bodies', () => {
    expect(endpoint('https://beats.example.com/', '/e')).toBe('https://beats.example.com/e');
    expect(JSON.parse(browserBody('bk_1', false, [{ event: 'a' }]))).toEqual({ key: 'bk_1', consent: false, events: [{ event: 'a' }] });
    expect(JSON.parse(serverBody([{ event: 'a' }]))).toEqual({ events: [{ event: 'a' }] });
  });

  it('retries network errors, 408, 429 and 5xx only', () => {
    expect([0, 408, 429, 500, 503].every(isRetryable)).toBe(true);
    expect([200, 400, 401, 404, 413, 422].some(isRetryable)).toBe(false);
  });
});

describe('misc', () => {
  it('generates v4 UUIDs', () => {
    const a = uuid();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuid()).not.toBe(a);
  });

  it('checks event names', () => {
    expect(checkEventName('signup')).toBeUndefined();
    expect(checkEventName('')).toMatch(/non-empty/);
    expect(checkEventName('x'.repeat(201))).toMatch(/longer than 200/);
  });
});
