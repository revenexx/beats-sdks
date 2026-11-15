// Stand-in for Nuxt's `#app` in tests and type checks.
import type { Router } from 'vue-router';

type Hook = (...a: never[]) => unknown;

export interface FakeNuxtApp {
  hooks: Record<string, Hook[]>;
  hook(name: string, fn: Hook): void;
  callHook(name: string, ...args: unknown[]): Promise<void>;
  $beats?: unknown;
  [key: string]: unknown;
}

export const state: { config: Record<string, unknown>; router?: Router; app: FakeNuxtApp } = {
  config: {},
  app: makeApp(),
};

export function makeApp(): FakeNuxtApp {
  const hooks: Record<string, Hook[]> = {};
  return {
    hooks,
    hook(name, fn) {
      (hooks[name] ??= []).push(fn);
    },
    async callHook(name, ...args) {
      for (const f of hooks[name] ?? []) await (f as (...a: unknown[]) => unknown)(...args);
    },
  };
}

export function defineNuxtPlugin<T>(fn: (app: FakeNuxtApp) => T) {
  return fn;
}

export const useRuntimeConfig = () => ({ public: state.config });
export const useRouter = () => state.router!;
export const useNuxtApp = () => state.app;
