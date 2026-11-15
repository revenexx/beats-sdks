const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

/**
 * Normalizes a decimal amount to a string with exactly two fraction digits.
 *
 * Numbers are rounded half away from zero to cents (`1.005` becomes `"1.01"`).
 * Strings must be plain decimals (`"12"`, `"12.5"`, `"-3.99"`); more than two
 * fraction digits are rounded. Returns `undefined` for anything else.
 */
export function formatAmount(value: unknown): string | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    const cents = Math.round(Math.abs(value) * 100 + 1e-7);
    return fromCents(value < 0 && cents > 0 ? -cents : cents);
  }
  if (typeof value !== 'string') return undefined;
  const m = DECIMAL.exec(value.trim());
  if (!m) return undefined;
  const frac = m[3] ?? '';
  if (frac.length > 2) return formatAmount(Number(value));
  const int = (m[2] as string).replace(/^0+(?=\d)/, '');
  const out = `${int}.${(frac + '00').slice(0, 2)}`;
  return m[1] && /[1-9]/.test(out) ? `-${out}` : out;
}

/** True when the amount had more than two fraction digits and was rounded. */
export function isRounded(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value * 100 - Math.round(value * 100)) > 1e-6;
  if (typeof value !== 'string') return false;
  const m = DECIMAL.exec(value.trim());
  return !!m && (m[3] ?? '').length > 2;
}

/** Converts a two-decimal string from `formatAmount` to integer cents. */
export function toCents(amount: string): number {
  const m = DECIMAL.exec(amount);
  if (!m) return 0;
  const cents = Number(m[2]) * 100 + Number(((m[3] ?? '') + '00').slice(0, 2));
  return m[1] ? -cents : cents;
}

/** Formats integer cents as a two-decimal string. */
export function fromCents(cents: number): string {
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `-${s}` : s;
}

/** True for a three-letter upper-case code such as `EUR`. */
export function isCurrency(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
}
