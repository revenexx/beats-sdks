import { KEYS, st, type Plugin } from '../client.js';

/** `optOut`, `optIn` and `respectDoNotTrack`. */
export const privacy: Plugin = (ctx) => {
  const s = ctx._s;
  const dnt = () =>
    !!ctx._o!.respectDoNotTrack &&
    (navigator.doNotTrack == '1' || (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl == true);
  ctx._def('optOut', () => {
    st(0, KEYS.optOut, '1');
    s._x = true;
    ctx._t!._clear();
  });
  ctx._def('optIn', () => {
    st(0, KEYS.optOut, null);
    s._x = dnt();
  });
  return () => {
    s._x ||= dnt();
  };
};
