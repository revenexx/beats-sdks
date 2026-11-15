// @vitest-environment happy-dom
import { createBeats } from '@revenexx/beats-browser';
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BeatsProvider, useBeats } from '../src/index.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('React provider', () => {
  it('initializes once (also in strict mode) and provides the client', async () => {
    const client = createBeats();
    const init = vi.spyOn(client, 'init').mockImplementation(() => {});
    const track = vi.spyOn(client, 'track').mockImplementation(() => {});
    function Button() {
      const b = useBeats();
      return <button onClick={() => b.track('clicked', { where: 'test' })}>go</button>;
    }
    const el = document.createElement('div');
    document.body.append(el);
    const root = createRoot(el);
    await act(async () =>
      root.render(
        <StrictMode>
          <BeatsProvider client={client} options={{ key: 'bk_1', apiHost: 'https://beats.test' }}>
            <Button />
          </BeatsProvider>
        </StrictMode>,
      ),
    );
    expect(init).toHaveBeenCalledWith({ key: 'bk_1', apiHost: 'https://beats.test' });
    await act(async () => el.querySelector('button')!.click());
    expect(track).toHaveBeenCalledWith('clicked', { where: 'test' });
    act(() => root.unmount());
  });

  it('useBeats without a provider returns the shared client', async () => {
    let got: unknown;
    function C() {
      got = useBeats();
      return null;
    }
    const root = createRoot(document.createElement('div'));
    await act(async () => root.render(<C />));
    expect(typeof (got as { track: unknown }).track).toBe('function');
    act(() => root.unmount());
  });
});
