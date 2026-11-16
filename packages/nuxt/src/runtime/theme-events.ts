import type { BeatsClient, CommerceHelper, CommerceInputs, Item } from '@revenexx/beats-browser';

/**
 * The revenexx theme event contract, `theme-events/1`
 * (https://schemas.revenexx.com/theme-events.schema.json): one envelope per
 * thing that happened in a storefront, emitted by the theme as the Nuxt hook
 * `revenexx:event` and as the DOM event `revenexx:event` on `window`. Only the
 * fields mapped here are declared. The contract carries no personal data, and
 * nothing here identifies the visitor.
 */
export interface ThemeEventItem {
  sku: string;
  name: string;
  brand?: string;
  category_path?: string[];
  variant?: string;
  price_net?: number | null;
  price_gross?: number | null;
  quantity: number;
  list_position?: number;
  list_id?: string;
}

export interface ThemeEventEnvelope {
  schema: string;
  event: string;
  event_id: string;
  currency?: string;
  ecommerce?: {
    items?: ThemeEventItem[];
    value_net?: number | null;
    value_gross?: number | null;
    tax?: number;
    shipping?: number;
    transaction_id?: string;
    coupon?: string;
    list_id?: string;
    list_name?: string;
    shipping_tier?: string;
    payment_type?: string;
  };
  search?: { search_term: string; results_count?: number };
  punchout?: { protocol: string };
}

/** Which prices of the contract become beats amounts. */
export type PriceBasis = 'net' | 'gross';

export const THEME_EVENT = 'revenexx:event';
const SCHEMA = 'theme-events/1';

/** A beats call for one theme event. */
export type BeatsCall =
  | { [K in CommerceHelper]: { helper: K; input: CommerceInputs[K] } }[CommerceHelper]
  | { helper: 'track'; event: string; properties: Record<string, unknown> };

const round2 = (n: number): number => Math.round(n * 100) / 100;
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? round2(v) : undefined);

function price(item: ThemeEventItem, basis: PriceBasis): number | undefined {
  return num(basis === 'gross' ? item.price_gross : item.price_net);
}

/** A contract item as a beats item: the article number is the product id, as in every vendor mapping. */
export function beatsItem(item: ThemeEventItem, basis: PriceBasis): Item {
  const out: Item = { product_id: item.sku, name: item.name };
  if (item.brand) out.brand = item.brand;
  if (item.variant) out.variant = item.variant;
  if (item.category_path?.length) out.category = item.category_path.join('/');
  const p = price(item, basis);
  if (p !== undefined) out.price = p;
  // beats counts whole units; a measured quantity (cable by the metre) is kept as a property
  if (typeof item.quantity === 'number' && Number.isFinite(item.quantity)) {
    const whole = Math.max(0, Math.round(item.quantity));
    out.quantity = whole;
    if (whole !== item.quantity) out.measured_quantity = item.quantity;
  }
  if (Number.isInteger(item.list_position)) out.position = item.list_position;
  if (item.list_id) out.list_id = item.list_id;
  return out;
}

/** The event's value in the basis, or undefined to let beats sum the items. */
function value(e: NonNullable<ThemeEventEnvelope['ecommerce']>, basis: PriceBasis): number | undefined {
  return num(basis === 'gross' ? e.value_gross : e.value_net);
}

function compact<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === '') delete o[k];
  return o;
}

/**
 * Maps one theme event onto a beats call, or null for events beats does not
 * take from the stream: `page_view` (page views come from the router),
 * `form_submit`, `login` and `sign_up` (not commerce), unknown events and
 * envelopes of another contract version.
 */
export function mapThemeEvent(envelope: ThemeEventEnvelope, basis: PriceBasis = 'net'): BeatsCall | null {
  if (!envelope || envelope.schema !== SCHEMA) return null;
  const e = envelope.ecommerce ?? {};
  const items = (e.items ?? []).map((i) => beatsItem(i, basis));
  const currency = envelope.currency || undefined;
  switch (envelope.event) {
    case 'view_item_list':
      return { helper: 'productListViewed', input: compact({ list_id: e.list_id, list_name: e.list_name, items, currency }) };
    case 'select_item':
    case 'view_item': {
      const item = items[0];
      if (!item) return null;
      const helper = envelope.event === 'select_item' ? 'productClicked' : 'productViewed';
      return { helper, input: compact({ item, list_id: e.list_id ?? item.list_id, list_name: e.list_name, currency }) };
    }
    case 'search':
      if (!envelope.search) return null;
      return { helper: 'search', input: compact({ query: envelope.search.search_term, results: envelope.search.results_count }) };
    case 'add_to_cart':
      return { helper: 'productAdded', input: compact({ items, currency }) };
    case 'remove_from_cart':
      return { helper: 'productRemoved', input: compact({ items, currency }) };
    case 'view_cart':
      return { helper: 'cartViewed', input: compact({ items, value: value(e, basis), currency }) };
    case 'begin_checkout':
      return { helper: 'checkoutStarted', input: compact({ items, value: value(e, basis), coupon: e.coupon, currency }) };
    case 'add_shipping_info':
      return { helper: 'checkoutStep', input: compact({ step: 1, step_name: 'shipping', option: e.shipping_tier }) };
    case 'add_payment_info':
      return { helper: 'checkoutStep', input: compact({ step: 2, step_name: 'payment', option: e.payment_type }) };
    case 'purchase': {
      const orderId = e.transaction_id || envelope.event_id;
      if (!orderId) return null;
      return {
        helper: 'orderCompleted',
        input: compact({ order_id: orderId, revenue: value(e, basis), tax: num(e.tax), shipping: num(e.shipping), coupon: e.coupon, currency, items }),
      };
    }
    case 'request_quote':
      return { helper: 'quoteRequested', input: compact({ items, value: value(e, basis), currency }) };
    case 'add_to_orderlist':
      // an order list is the B2B wishlist
      return { helper: 'wishlistAdded', input: compact({ items, currency, list: 'orderlist' }) };
    case 'punchout_transfer':
      return {
        helper: 'track',
        event: 'punchout_transfer',
        properties: compact({ protocol: envelope.punchout?.protocol, value: value(e, basis), currency, items_count: items.length }),
      };
    default:
      return null;
  }
}

/** Sends the beats call for one theme event. */
export function sendThemeEvent(client: BeatsClient, envelope: ThemeEventEnvelope, basis: PriceBasis = 'net'): void {
  const call = mapThemeEvent(envelope, basis);
  if (!call) return;
  if (call.helper === 'track') client.track(call.event, call.properties);
  else (client[call.helper] as (input: unknown) => void)(call.input);
}

interface HookableApp {
  hook(name: string, fn: (envelope: ThemeEventEnvelope) => void): unknown;
}

/**
 * Listens to the theme event stream on both transports. The theme emits each
 * envelope on both, so an `event_id` seen recently is dropped the second time.
 */
export function listenToThemeEvents(nuxtApp: HookableApp, client: BeatsClient, basis: PriceBasis = 'net', target?: Pick<Window, 'addEventListener'>): void {
  const seen: string[] = [];
  const intake = (envelope: ThemeEventEnvelope) => {
    if (!envelope || typeof envelope !== 'object') return;
    const id = typeof envelope.event_id === 'string' ? envelope.event_id : '';
    if (id) {
      if (seen.includes(id)) return;
      seen.push(id);
      if (seen.length > 100) seen.shift();
    }
    try {
      sendThemeEvent(client, envelope, basis);
    } catch (err) {
      console.warn('[beats] theme event not sent', err);
    }
  };
  nuxtApp.hook(THEME_EVENT, intake);
  target?.addEventListener(THEME_EVENT, (ev: Event) => intake((ev as CustomEvent<ThemeEventEnvelope>).detail));
}
