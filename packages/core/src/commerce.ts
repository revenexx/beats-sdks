import { formatAmount, fromCents, isCurrency, isRounded, toCents } from './normalize.js';
import type { BuiltEvent, CommerceHelper, CommerceInputs, Item, NormalizedItem, Properties } from './types.js';

const ITEMS = 1;
const ONE = 2;
const VALUE = 4;
const ORDER = 8;
const REFUND = 16;
const MONEY = 32;

/** Standard event name and handling of each e-commerce helper. */
export const COMMERCE: Record<CommerceHelper, readonly [string, number]> = {
  productListViewed: ['$product_list_viewed', ITEMS | MONEY],
  productClicked: ['$product_clicked', ITEMS | ONE | MONEY],
  productViewed: ['$product_viewed', ITEMS | ONE | MONEY],
  search: ['$search', 0],
  productAdded: ['$product_added', ITEMS | MONEY],
  productRemoved: ['$product_removed', ITEMS | MONEY],
  cartViewed: ['$cart_viewed', ITEMS | VALUE | MONEY],
  checkoutStarted: ['$checkout_started', ITEMS | VALUE | MONEY],
  checkoutStep: ['$checkout_step', 0],
  orderCompleted: ['$order_completed', ITEMS | ORDER | MONEY],
  orderRefunded: ['$order_refunded', ITEMS | ORDER | REFUND | MONEY],
  promotionViewed: ['$promotion_viewed', 0],
  promotionClicked: ['$promotion_clicked', 0],
  wishlistAdded: ['$wishlist_added', ITEMS | MONEY],
  quoteRequested: ['$quote_requested', ITEMS | VALUE | MONEY],
};

/** Names of all e-commerce helpers. */
export const COMMERCE_HELPERS = /* @__PURE__ */ Object.keys(COMMERCE) as CommerceHelper[];

const EVENT_AMOUNTS = ['value', 'revenue', 'tax', 'shipping', 'discount'] as const;

export interface CommerceDefaults {
  /** Currency for commerce events that name none (ISO 4217). */
  currency?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : undefined;
}

function amount(target: Record<string, unknown>, key: string, where: string, warnings: string[]): void {
  const v = target[key];
  if (v === undefined || v === null) {
    delete target[key];
    return;
  }
  const s = formatAmount(v);
  if (s === undefined) {
    warnings.push(`${where}.${key} is not a decimal amount: ${JSON.stringify(v)}`);
    delete target[key];
    return;
  }
  if (isRounded(v)) warnings.push(`${where}.${key} has more than two fraction digits and was rounded to ${s}`);
  target[key] = s;
}

function currency(v: unknown, where: string, warnings: string[]): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const c = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (!isCurrency(c)) {
    warnings.push(`${where}.currency is not an ISO 4217 code: ${JSON.stringify(v)}`);
    return undefined;
  }
  return c;
}

/** Normalizes one item: ids as strings, amounts as two-decimal strings, quantity 1 by default. */
export function normalizeItem(input: Item, where: string, warnings: string[]): NormalizedItem {
  const item: Record<string, unknown> = { ...input };
  for (const k of ['product_id', 'sku'] as const) {
    if (item[k] === undefined || item[k] === null || item[k] === '') delete item[k];
    else item[k] = str(item[k]);
  }
  if (item.product_id === undefined && item.sku === undefined) warnings.push(`${where} has neither product_id nor sku`);
  amount(item, 'price', where, warnings);
  amount(item, 'discount', where, warnings);
  const q = item.quantity;
  if (q === undefined || q === null) item.quantity = 1;
  else if (typeof q !== 'number' || !Number.isInteger(q) || q < 1) {
    warnings.push(`${where}.quantity must be a positive integer: ${JSON.stringify(q)}`);
    const n = Math.round(Number(q));
    item.quantity = Number.isFinite(n) && n > 0 ? n : 1;
  }
  if (item.position !== undefined && !Number.isInteger(item.position)) {
    warnings.push(`${where}.position must be an integer`);
    delete item.position;
  }
  const c = currency(item.currency, where, warnings);
  if (c) item.currency = c;
  else delete item.currency;
  return item as NormalizedItem;
}

/** Sum of `price * quantity - discount` over the items, as a two-decimal string. */
export function itemsValue(items: NormalizedItem[]): string | undefined {
  let cents = 0;
  let any = false;
  for (const it of items) {
    if (it.price === undefined) continue;
    any = true;
    cents += toCents(it.price) * it.quantity - (it.discount ? toCents(it.discount) : 0);
  }
  return any ? fromCents(cents) : undefined;
}

/**
 * Builds the standard event for an e-commerce helper: event name, normalized
 * properties per docs/events.md, and warnings about the input.
 */
export function buildCommerce<K extends CommerceHelper>(
  helper: K,
  input: CommerceInputs[K],
  defaults: CommerceDefaults = {},
): BuiltEvent {
  const spec = COMMERCE[helper];
  if (!spec) throw new TypeError(`unknown e-commerce helper: ${String(helper)}`);
  const [event, flags] = spec;
  const warnings: string[] = [];
  const props: Properties = { ...(input as Properties) };

  if (flags & ITEMS) {
    if (flags & ONE && props.item !== undefined) {
      props.items = [props.item];
      delete props.item;
    }
    if (props.items === undefined) {
      if (!(flags & ORDER)) warnings.push(`${event}: items are missing`);
    } else if (!Array.isArray(props.items)) {
      warnings.push(`${event}: items must be a list`);
      delete props.items;
    } else {
      if (flags & ONE && props.items.length !== 1) warnings.push(`${event}: expects exactly one item`);
      props.items = (props.items as Item[]).map((it, i) => normalizeItem(it ?? {}, `${event}: items[${i}]`, warnings));
    }
  }

  for (const k of EVENT_AMOUNTS) amount(props, k, event, warnings);

  if (flags & MONEY) {
    const items = (props.items ?? []) as NormalizedItem[];
    const c =
      currency(props.currency, event, warnings) ?? currency(defaults.currency, 'default', warnings) ?? items.find((i) => i.currency)?.currency;
    if (c) props.currency = c;
    else delete props.currency;
    if (flags & VALUE && props.value === undefined) {
      const v = itemsValue(items);
      if (v !== undefined) props.value = v;
    }
    if (!props.currency && (props.value ?? props.revenue ?? items.find((i) => i.price !== undefined)))
      warnings.push(`${event}: amounts without a currency`);
  }

  if (flags & ORDER) {
    const id = str(props.order_id);
    if (!id) warnings.push(`${event}: order_id is required`);
    else props.order_id = id;
    if (props.revenue === undefined) warnings.push(`${event}: revenue is missing`);
  }
  if (flags & REFUND && typeof props.revenue === 'string' && props.revenue.startsWith('-')) {
    warnings.push(`${event}: revenue is the refunded amount and must be positive`);
    props.revenue = props.revenue.slice(1);
  }
  if (helper === 'search' && typeof props.query !== 'string') warnings.push(`${event}: query is missing`);
  if (helper === 'checkoutStep' && !Number.isInteger(props.step)) warnings.push(`${event}: step must be an integer`);

  return { event, properties: props, warnings };
}
