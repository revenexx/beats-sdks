// Server-side rendering: no window, nothing is initialized or sent.
import { createBeats } from '@revenexx/beats-browser';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BeatsProvider, useBeats } from '../src/index.js';

describe('React provider during server-side rendering', () => {
  it('renders without touching browser APIs', () => {
    expect(typeof window).toBe('undefined');
    const client = createBeats();
    const init = vi.spyOn(client, 'init');
    function Page() {
      const b = useBeats();
      b.track('rendered on the server'); // ignored without window
      return <p>hello</p>;
    }
    const html = renderToString(
      <BeatsProvider client={client} options={{ key: 'bk_1', apiHost: 'https://beats.test' }}>
        <Page />
      </BeatsProvider>,
    );
    expect(html).toBe('<p>hello</p>');
    expect(init).not.toHaveBeenCalled();
  });
});
