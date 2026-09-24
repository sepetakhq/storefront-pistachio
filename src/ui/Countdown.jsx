import { useCountdown } from '@sepetakhq/storefront-kit/hooks/useCountdown';
import { fmtClock } from '@sepetakhq/storefront-kit/shared/format';
import { serverNow } from '@sepetakhq/storefront-kit/api/client';

const HOUR = 60 * 60 * 1000;

/**
 * The isolation boundary that lets the global one-second tick die.
 *
 * A component that calls useCountdown re-renders every tick, so these render
 * nothing but the countdown itself. A campaign strip repaints three small
 * cells per second instead of eight product cards.
 */

export function CountdownCells({ until, onExpire, label = '' }) {
  // A DETIK cell is on screen for the whole campaign, however far out the end
  // is, so this one never gets the relaxed cadence.
  const { ms, active } = useCountdown(until, { onExpire, resolution: 'second' });
  if (!active) return null;

  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  // The design's four deep-green cells after the shop's label.
  return (
    <div className="pc-countdown" role="timer" aria-label={`${label} ${d} hari ${h} jam ${m} menit`.trim()}>
      {label && (
        <span aria-hidden="true" style={{ fontSize: 13, color: 'var(--pc-body)', marginRight: 4 }}>
          {label}
        </span>
      )}
      {[
        [pad(d), 'hari'],
        [pad(h), 'jam'],
        [pad(m), 'menit'],
        [pad(s), 'detik'],
      ].map(([v, l]) => (
        <div key={l} aria-hidden="true">
          <b>{v}</b>
          <small>{l}</small>
        </div>
      ))}
    </div>
  );
}

/** mm:ss, for the OTP and payment deadlines. */
export function CountdownClock({ until, onExpire, style }) {
  // Seconds while there are minutes left, which is every gateway deadline and
  // every OTP window. A manual payment window is a day, and ticking a day away
  // one second at a time is 86,400 renders and 86,400 timers to animate a
  // digit nobody is watching — so far out the display drops to minutes and
  // takes the relaxed cadence useCountdown already implements, which is
  // exactly the condition that hook documents as safe.
  // Read from `until` rather than from the hook's own output, whose cadence
  // this decides. Crossing the hour flips it once and restarts the timer,
  // which is the moment the display starts showing seconds that move anyway.
  const far = Date.parse(until) - serverNow() > HOUR;
  const { ms, active } = useCountdown(until, {
    onExpire,
    resolution: far ? 'adaptive' : 'second',
  });
  if (!active) return null;
  return <span style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{fmtClock(ms)}</span>;
}

/** "60 detik" / "5 menit", for a resend button label. */
export function CountdownWords({ until, onExpire }) {
  const { ms, active } = useCountdown(until, { onExpire });
  if (!active) return null;
  const secs = Math.ceil(ms / 1000);
  return <>{secs < 60 ? `${secs} detik` : `${Math.ceil(secs / 60)} menit`}</>;
}

const pad = (n) => String(n).padStart(2, '0');
