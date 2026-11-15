import { uuid, type Properties } from '@revenexx/beats-core';
import { AID, KEYS, st, UID, type Plugin } from '../client.js';

/** `identify`, `setPersonProperties`, `group`, `featureUsed`, `getDistinctId` and `reset`. */
export const people: Plugin = (ctx) => {
  const s = ctx._s;
  // the server needs a distinct id for $set: in cookieless mode only after identify
  const set = (p?: Properties, once?: Properties) =>
    (s._uid || s._aid) && ctx._send('$set', { $set: p ?? {}, $set_once: once });

  ctx._def('identify', (userId: string, props?: Properties) => {
    if (typeof userId != 'string' || !userId) return;
    if (s._uid === userId) return props && set(props);
    const anon = s._uid ? undefined : s._aid;
    s._uid = userId;
    ctx._store(KEYS.userId, userId);
    ctx._send('$identify', { $anon_distinct_id: anon, $set: props });
  });
  ctx._def('setPersonProperties', set);
  ctx._def('getDistinctId', () => s._uid ?? s._aid);
  ctx._def('group', (type: string, key: string, props?: Properties) => {
    (s._g ||= {})[type] = key;
    ctx._send('$group', { $group_type: type, $group_key: key, $group_set: props });
  });
  ctx._def('reset', () => {
    s._uid = s._sid = undefined;
    s._p = {};
    s._g = undefined;
    st(0, UID, null);
    if (s._id) ctx._store(AID, (s._aid = uuid()));
  });
  ctx._def('featureUsed', (name: string, variant?: string) => ctx._send('$feature_used', { $feature: name, $variant: variant }));
};
