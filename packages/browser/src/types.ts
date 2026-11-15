import type { CommerceHelper, CommerceInputs, Envelope, Properties } from '@beats-analytics/core';

export type { Envelope, Properties };

export interface BatchingOptions {
  /** Send when this many events are queued; also the largest request (the server accepts at most 1000). Default 10. */
  size?: number;
  /** Send queued events after this many milliseconds. Default 1000. */
  interval?: number;
}

export interface BeatsOptions {
  /** Ingest key of the project (`bk_...`). */
  key: string;
  /** Origin of the beats server, for example `https://beats.example.com`. */
  apiHost: string;
  /** No cookies and no browser storage; the server assigns ids. Default true. `consent(true)` switches to identified mode. */
  cookieless?: boolean;
  /** Send `$pageview` on load and on history API navigation. Default true. */
  autoPageviews?: boolean;
  /** Count changes of `location.hash` as navigation (hash routers). Default false. */
  hashRouting?: boolean;
  /** Send `$pageleave` with visible time and scroll depth when a page is hidden or left. Default true. */
  trackPageleave?: boolean;
  /** Send `$outbound_click` for links to other hosts. Default false. */
  trackOutboundLinks?: boolean;
  /** Send `$file_download` for links to files; `true` uses the default extension list. Default false. */
  trackDownloads?: boolean | string[];
  /** Send `$web_vitals` once per page load. Default false. */
  trackWebVitals?: boolean;
  /** Track clicks on elements with `data-beats-event`. Default false. */
  trackAttributes?: boolean;
  /** Send nothing when the browser signals Do Not Track or Global Privacy Control. Default false. Not in the minimal build. */
  respectDoNotTrack?: boolean;
  /** Queue events and send them together; `false` sends each event at once. Default `{ size: 10, interval: 1000 }`. */
  batching?: boolean | BatchingOptions;
  /** Retries of a failed request (network error, 408, 429, 5xx) with exponential backoff. Default 10. */
  maxRetries?: number;
  /** Minutes of inactivity after which a new session starts (identified mode). Default 30. */
  sessionTimeout?: number;
  /** Currency of commerce events that name none (ISO 4217). */
  currency?: string;
  /** Log events and validation warnings to the console. Default false. */
  debug?: boolean;
}

/** The web analytics client: what the minimal script-tag build contains. */
export interface BeatsCore {
  /** Starts the client. Calls made before `init` are kept and run after it. A second call is ignored. */
  init(options: BeatsOptions): void;
  /** Sends a custom or standard event. */
  track(event: string, properties?: Properties): void;
  /** Sends `$pageview` for the current URL. Only needed with `autoPageviews: false` or a custom router hook. */
  pageview(properties?: Properties): void;
  /** Adds properties to every following event of this page (kept in memory). */
  register(properties: Properties): void;
  /** Removes a property added with `register`. */
  unregister(name: string): void;
  /** `true` switches to identified mode (ids in browser storage); `false` deletes stored ids and goes back to cookieless mode. */
  consent(granted: boolean): void;
  /** Sends queued events now. */
  flush(): void;
}

export type CommerceMethods = { [K in CommerceHelper]: (input: CommerceInputs[K]) => void };

/** The full browser client. */
export interface BeatsClient extends BeatsCore, CommerceMethods {
  /** Links the current visitor to your user id and optionally sets person properties. */
  identify(userId: string, properties?: Properties): void;
  /** The id sent as `distinct_id`, or `undefined` in cookieless mode before `identify`. */
  getDistinctId(): string | undefined;
  /** Sets person properties (`$set`) and properties that are only set once (`$set_once`). */
  setPersonProperties(set: Properties, setOnce?: Properties): void;
  /** Adds the group to all following events and sets its properties. */
  group(type: string, key: string, properties?: Properties): void;
  /** Forgets the user (logout): user id, super properties and groups; identified mode gets a new anonymous id. */
  reset(): void;
  /** Stops sending events and remembers the choice in `localStorage` (also honoured by the minimal build). */
  optOut(): void;
  /** Reverts `optOut`. */
  optIn(): void;
  /** Sends `$feature_used`. */
  featureUsed(name: string, variant?: string): void;
}
