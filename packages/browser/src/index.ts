import { createClient } from './client.js';
import { clicks } from './plugins/clicks.js';
import { commerce } from './plugins/commerce.js';
import { people } from './plugins/people.js';
import { privacy } from './plugins/privacy.js';
import { vitals } from './plugins/vitals.js';
import type { BeatsClient } from './types.js';

export type * from './types.js';
export type { CommerceHelper, CommerceInputs, Item, Amount } from '@revenexx/beats-core';
export { KEYS } from './client.js';

/** Creates a full browser client. Call `init` on it before or after the first events. */
export function createBeats(): BeatsClient {
  return createClient<BeatsClient>([privacy, people, commerce, clicks, vitals]);
}

/** The shared client instance. */
export const beats: BeatsClient = createBeats();

export default beats;
