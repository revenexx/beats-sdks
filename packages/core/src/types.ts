/** Free event or person properties. Values must be JSON-serializable. */
export type Properties = Record<string, unknown>;

/** A decimal amount: a number or a string with at most two fraction digits. */
export type Amount = number | string;

/**
 * One event as it is sent to beats (see docs/events.md, "Envelope").
 * `tenant_id` and `project_id` are never part of it: they come from the key.
 */
export interface Envelope {
  event: string;
  event_id?: string;
  timestamp?: string;
  distinct_id?: string;
  session_id?: string;
  url?: string;
  referrer?: string;
  title?: string;
  screen_width?: number;
  language?: string;
  properties?: Properties;
  groups?: Record<string, string>;
}

/** An item of a commerce event (docs/events.md, "Item fields"). */
export interface Item {
  /** Your product id. Required unless `sku` is set. */
  product_id?: string;
  /** Stock-keeping unit, often the variant id. */
  sku?: string;
  name?: string;
  brand?: string;
  variant?: string;
  /** Category path with `/`, for example `Tools/Drills/Cordless`. */
  category?: string;
  /** Unit price. */
  price?: Amount;
  /** Integer, defaults to 1. */
  quantity?: number;
  /** Discount on this line. */
  discount?: Amount;
  coupon?: string;
  /** ISO 4217, only if different from the event's currency. */
  currency?: string;
  list_id?: string;
  list_name?: string;
  position?: number;
  /** Anything else is kept in `event_items.properties`. */
  [key: string]: unknown;
}

/** An item after normalization: amounts are two-decimal strings, quantity is set. */
export interface NormalizedItem extends Item {
  price?: string;
  discount?: string;
  quantity: number;
}

interface Extra {
  [key: string]: unknown;
}

export interface ListInput extends Extra {
  list_id?: string;
  list_name?: string;
  items: Item[];
  currency?: string;
}

export interface SingleItemInput extends Extra {
  item: Item;
  list_id?: string;
  list_name?: string;
  currency?: string;
}

export interface SearchInput extends Extra {
  query: string;
  /** Number of results. */
  results?: number;
}

export interface CartInput extends Extra {
  cart_id?: string;
  items: Item[];
  currency?: string;
}

export interface CartValueInput extends CartInput {
  /** Computed from the items when absent. */
  value?: Amount;
  coupon?: string;
}

export interface CheckoutStepInput extends Extra {
  step: number;
  step_name?: string;
  /** For example the shipping or payment method. */
  option?: string;
}

export interface OrderInput extends Extra {
  order_id: string;
  /** Total paid. */
  revenue?: Amount;
  tax?: Amount;
  shipping?: Amount;
  discount?: Amount;
  coupon?: string;
  currency?: string;
  items?: Item[];
}

export interface RefundInput extends Extra {
  order_id: string;
  /** Amount refunded, positive. */
  revenue?: Amount;
  currency?: string;
  /** Refunded items; all items of the order if absent. */
  items?: Item[];
}

export interface PromotionInput extends Extra {
  promotion_id?: string;
  promotion_name?: string;
  creative?: string;
  slot?: string;
}

export interface WishlistInput extends Extra {
  items: Item[];
  currency?: string;
}

export interface QuoteInput extends Extra {
  quote_id?: string;
  items: Item[];
  /** Computed from the items when absent. */
  value?: Amount;
  currency?: string;
}

/** Input type of each e-commerce helper, by helper name. */
export interface CommerceInputs {
  productListViewed: ListInput;
  productClicked: SingleItemInput;
  productViewed: SingleItemInput;
  search: SearchInput;
  productAdded: CartInput;
  productRemoved: CartInput;
  cartViewed: CartValueInput;
  checkoutStarted: CartValueInput;
  checkoutStep: CheckoutStepInput;
  orderCompleted: OrderInput;
  orderRefunded: RefundInput;
  promotionViewed: PromotionInput;
  promotionClicked: PromotionInput;
  wishlistAdded: WishlistInput;
  quoteRequested: QuoteInput;
}

export type CommerceHelper = keyof CommerceInputs;

/** The result of building a commerce event. */
export interface BuiltEvent {
  event: string;
  properties: Properties;
  /** Problems found in the input. The event is still sent. */
  warnings: string[];
}
