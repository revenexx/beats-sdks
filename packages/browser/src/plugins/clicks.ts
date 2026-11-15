import type { Properties } from '@revenexx/beats-core';
import type { Plugin } from '../client.js';

/** File extensions counted as downloads when `trackDownloads` is `true`. */
export const DOWNLOAD_EXTENSIONS =
  '7z,apk,avi,csv,dmg,doc,docx,epub,exe,gz,iso,key,mov,mp3,mp4,msi,odp,ods,odt,pdf,pkg,ppt,pptx,rar,rtf,tar,tgz,txt,wav,xls,xlsx,xml,zip'.split(
    ',',
  );

/** Outbound links, downloads and declarative tracking with `data-beats-event`. */
export const clicks: Plugin = (ctx) => () => {
  const o = ctx._o!;
  if (!o.trackOutboundLinks && !o.trackDownloads && !o.trackAttributes) return;
  const exts = Array.isArray(o.trackDownloads) ? o.trackDownloads : DOWNLOAD_EXTENSIONS;

  const handler = (e: MouseEvent) => {
    if (e.type === 'auxclick' && e.button !== 1) return;
    const target = e.target as Element | null;
    if (!target?.closest) return;
    if (o.trackAttributes) {
      const el = target.closest('[data-beats-event]');
      if (el) {
        const props: Properties = {};
        for (const a of Array.from(el.attributes))
          if (a.name.startsWith('data-beats-prop-')) props[a.name.slice(16).replace(/-/g, '_')] = a.value;
        ctx._send(el.getAttribute('data-beats-event') as string, props, undefined, true);
      }
    }
    const a = target.closest('a[href]') as HTMLAnchorElement | null;
    if (!a || !/^https?:$/.test(a.protocol)) return;
    const ext = /\.([a-z0-9]+)$/i.exec(a.pathname)?.[1]?.toLowerCase();
    if (o.trackDownloads && ext && exts.includes(ext)) ctx._send('$file_download', { $href: a.href, $extension: ext }, undefined, true);
    else if (o.trackOutboundLinks && a.host !== location.host) ctx._send('$outbound_click', { $href: a.href }, undefined, true);
  };
  addEventListener('click', handler, true);
  addEventListener('auxclick', handler, true);
};
