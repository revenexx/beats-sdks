import { beats as shared, type BeatsClient, type BeatsOptions } from '@revenexx/beats-browser';
import { createContext, useContext, useEffect, type ReactNode } from 'react';

export type * from '@revenexx/beats-browser';

const BeatsContext = createContext<BeatsClient>(shared);

export interface BeatsProviderProps {
  /** Options for `init`. The client is initialized once, after the first render in the browser. */
  options?: BeatsOptions;
  /** The client to use. Default: the shared `beats` instance of `@revenexx/beats-browser`. */
  client?: BeatsClient;
  children?: ReactNode;
}

/**
 * Initializes the client in the browser and provides it to `useBeats()`.
 * Nothing runs during server-side rendering. Page views come from the
 * history API (works with any router); set `options.autoPageviews: false`
 * and call `pageview()` yourself to send them from a router hook instead.
 */
export function BeatsProvider({ options, client = shared, children }: BeatsProviderProps) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: options are read once; init ignores later calls
  useEffect(() => {
    // init ignores repeated calls (React strict mode runs effects twice)
    if (options) client.init(options);
  }, [client]);
  return <BeatsContext.Provider value={client}>{children}</BeatsContext.Provider>;
}

/** The client of the nearest `BeatsProvider`, or the shared instance. Calls before `init` are queued. */
export function useBeats(): BeatsClient {
  return useContext(BeatsContext);
}
