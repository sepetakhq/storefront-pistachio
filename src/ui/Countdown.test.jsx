import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCountdown } from '@sepetakhq/storefront-kit/hooks/useCountdown';
import { CountdownCells } from './Countdown.jsx';

// Testing Library only registers its own cleanup when vitest runs with
// globals, which this project does not.
afterEach(cleanup);

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-03T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

/** An RFC3339 instant `ms` from the (faked) present, as the API would send it. */
const inMs = (ms) => new Date(Date.now() + ms).toISOString();

/** Advance the fake clock and let every chained timeout fire. */
const advance = (ms) => act(() => vi.advanceTimersByTime(ms));

describe('useCountdown', () => {
  it('ticks every second at second resolution, however far out the deadline is', () => {
    const until = inMs(10 * HOUR + 40 * MINUTE + 29 * SECOND);
    const { result } = renderHook(() => useCountdown(until, { resolution: 'second' }));

    const start = result.current.ms;
    advance(SECOND);
    expect(result.current.ms).toBe(start - SECOND);
    advance(SECOND);
    expect(result.current.ms).toBe(start - 2 * SECOND);
  });

  // The relaxation is the reason the hook exists in this shape; 'second' opts
  // out of it, it is not gone.
  it('relaxes the cadence at adaptive resolution', () => {
    const until = inMs(10 * HOUR + 40 * MINUTE + 29 * SECOND);
    const { result } = renderHook(() => useCountdown(until));

    const start = result.current.ms;
    advance(SECOND);
    expect(result.current.ms).toBe(start);

    // The chain lands on the next 30s boundary rather than 30s from now, so
    // the first adaptive update lops off the 29s remainder — proof it snaps to
    // the boundary instead of drifting, and proof it updated at all.
    advance(30 * SECOND);
    expect(result.current.ms).toBe(start - 29 * SECOND);
  });

  it('reports a missing deadline as inactive rather than expired', () => {
    const { result } = renderHook(() => useCountdown(null));
    expect(result.current.active).toBe(false);
    expect(result.current.ms).toBe(0);
  });

  it('fires onExpire once when the deadline passes', () => {
    const onExpire = vi.fn();
    // Hoisted: computing the target inside the render callback would push the
    // deadline forward on every tick's re-render.
    const until = inMs(3 * SECOND);
    renderHook(() => useCountdown(until, { onExpire, resolution: 'second' }));

    advance(2 * SECOND);
    expect(onExpire).not.toHaveBeenCalled();

    advance(2 * SECOND);
    expect(onExpire).toHaveBeenCalledTimes(1);

    advance(10 * SECOND);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });
});

describe('CountdownCells', () => {
  // The regression: a flash sale ending in ten hours sat on one DETIK value
  // for thirty seconds at a time, because the deadline was far enough out to
  // earn the relaxed cadence while the seconds cell was on screen throughout.
  it('counts the seconds cell down every second on a distant deadline', () => {
    render(<CountdownCells until={inMs(10 * HOUR + 40 * MINUTE + 29 * SECOND)} />);

    const seconds = () => screen.getByText('detik').parentElement.textContent;
    expect(seconds()).toBe('29detik');

    advance(SECOND);
    expect(seconds()).toBe('28detik');

    advance(SECOND);
    expect(seconds()).toBe('27detik');
  });

  it('renders nothing once the campaign has ended', () => {
    render(<CountdownCells until={inMs(-SECOND)} />);
    expect(screen.queryByText('detik')).toBeNull();
  });
});
