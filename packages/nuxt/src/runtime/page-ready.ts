import { nextTick } from 'vue';

interface Hooks {
  hook(name: 'page:finish', fn: () => void): (() => void) | void;
}

/**
 * Resolves once the page of the current navigation has its title in the DOM.
 * Pages set `document.title` asynchronously (`useHead`, `useSeoMeta`), and
 * Nuxt holds head updates back until `page:finish`; it then writes them at
 * once (Nuxt 3) or after a zero timeout (Nuxt 4, `@unhead/vue`). So: wait for
 * `page:finish`, then a tick and a zero timeout (not `requestAnimationFrame`,
 * which does not run in background tabs). A navigation that renders no new
 * page (a changed query on the same page) has no `page:finish`; `fallbackMs`
 * bounds the wait.
 */
export function pageReady(nuxtApp: Hooks, fallbackMs = 1000): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      off?.();
      clearTimeout(timer);
      void nextTick(() => setTimeout(resolve, 0));
    };
    const off = nuxtApp.hook('page:finish', finish);
    const timer = setTimeout(finish, fallbackMs);
  });
}
