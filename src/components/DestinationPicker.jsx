import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { resolveDestination, searchDestinations } from '@sepetakhq/storefront-kit/api/endpoints';
import { qk } from '@sepetakhq/storefront-kit/api/queryKeys';
import {
  destinationLines,
  isUnserved,
  matchRange,
  unservedAlternatives,
} from '@sepetakhq/storefront-kit/lib/shipping';

// Where the parcel is going.
//
// This replaces the free-text "Kota" field, and it is not a cosmetic upgrade:
// the rate provider quotes from an opaque location id, so something has to
// turn what the buyer typed into one before a price exists at all.

const field = {
  border: '1px solid var(--pc-line)',
  borderRadius: 12,
  padding: '12px 14px',
  fontSize: 14.5,
  background: 'var(--pc-white)',
  width: '100%',
};

const MIN_QUERY = 3;

export default function DestinationPicker({ value, onChange, disabled }) {
  const listId = useId();
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);

  // Debounced into the query key. Every keystroke reaching the provider would
  // spend one of the merchant's hundred requests a day, and a buyer typing an
  // address produces a lot of keystrokes.
  useEffect(() => {
    const id = setTimeout(() => setTerm(q.trim()), 250);
    return () => clearTimeout(id);
  }, [q]);

  const results = useQuery({
    queryKey: qk.destinations(term),
    queryFn: ({ signal }) => searchDestinations(term, signal),
    enabled: term.length >= MIN_QUERY,
    // Keeps the previous list on screen while the next one loads, so the
    // dropdown does not blink to empty between keystrokes.
    placeholderData: (prev) => prev,
    staleTime: Infinity,
  });
  const rows = results.data ?? [];

  useEffect(() => {
    function onAway(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onAway);
    return () => document.removeEventListener('mousedown', onAway);
  }, []);

  // Picking is now a request, not just a state change.
  //
  // Search reads our own gazetteer and costs nothing, so a row on screen names
  // a real place but not yet one any courier has an id for. Resolving is the
  // step that asks the providers, and it happens once per choice -- never per
  // keystroke, which is what it used to cost.
  const [resolving, setResolving] = useState(false);
  const [unserved, setUnserved] = useState(null);

  async function pick(row) {
    if (!row || resolving) return;
    setResolving(true);
    setUnserved(null);
    try {
      const { destination } = await resolveDestination(row.ref);
      onChange(destination);
      setQ('');
      setOpen(false);
      setActive(0);
    } catch (err) {
      // Rendered rather than rethrown: this runs in an async click handler, so
      // a throw here is an unhandled rejection the buyer never sees.
      setUnserved(err);
      setOpen(false);
    } finally {
      setResolving(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') return setOpen(false);
    if (!open || rows.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % rows.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + rows.length) % rows.length);
    } else if (e.key === 'Enter') {
      // Enter picks the highlighted row rather than submitting the form
      // around it, which would send a checkout with no destination.
      e.preventDefault();
      pick(rows[active]);
    }
  }

  if (value) {
    const { primary, secondary } = destinationLines(value);
    return (
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          border: '1px solid var(--pc-line)',
          borderRadius: 12,
          padding: '10px 14px',
          background: 'var(--pc-white)',
        }}
      >
        <span>
          <span style={{ display: 'block', fontSize: 14.5, color: 'var(--pc-ink)' }}>{primary}</span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--pc-muted-2)', letterSpacing: 0.2 }}>
            {secondary}
          </span>
        </span>
        <button
          type="button"
          className="hv-pink"
          onClick={() => onChange(null)}
          style={{
            border: '1px solid var(--pc-line-2)',
            background: 'transparent',
            color: 'var(--pc-green)',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Ubah
        </button>
      </div>
    );
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', marginTop: 12 }}>
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && rows.length ? `${listId}-${active}` : undefined}
        aria-label="Kecamatan atau kota tujuan"
        autoComplete="off"
        disabled={disabled}
        value={q}
        placeholder="Kecamatan, kota, atau kode pos"
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        style={field}
      />

      {open && term.length >= MIN_QUERY ? (
        <ul
          id={listId}
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 30,
            insetInline: 0,
            marginTop: 6,
            maxHeight: 288,
            overflowY: 'auto',
            listStyle: 'none',
            padding: 6,
            border: '1px solid var(--pc-line)',
            borderRadius: 12,
            background: 'var(--pc-white)',
            boxShadow: '0 10px 30px var(--pc-shadow-sm)',
          }}
        >
          {results.isError ? (
            <li style={{ padding: '12px 10px', fontSize: 13.5, color: 'var(--pc-green)' }}>
              Pencarian gagal. Coba lagi sebentar lagi.
            </li>
          ) : rows.length === 0 ? (
            <li style={{ padding: '12px 10px', fontSize: 13.5, color: 'var(--pc-body)' }}>
              {results.isFetching ? 'Mencari…' : 'Tidak ada yang cocok. Coba nama kecamatan.'}
            </li>
          ) : (
            rows.map((row, i) => {
              const { primary, secondary } = destinationLines(row);
              return (
                <li
                  key={row.ref}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    // mousedown, not click: the input blurs first and the
                    // list would unmount before a click ever landed.
                    e.preventDefault();
                    pick(row);
                  }}
                  style={{
                    padding: '9px 10px',
                    borderRadius: 11,
                    cursor: 'pointer',
                    background: i === active ? 'var(--pc-tint)' : 'transparent',
                  }}
                >
                  <div style={{ fontSize: 14, color: 'var(--pc-ink)' }}>
                    <Highlight text={primary} query={term} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--pc-muted-2)', letterSpacing: 0.2 }}>
                    {secondary}
                  </div>
                </li>
              );
            })
          )}
        </ul>
      ) : null}

      {unserved ? <Unserved error={unserved} onPick={pick} query={term} /> : null}
    </div>
  );
}

/**
 * The refusal, and what to do about it.
 *
 * Shown in place of the dropdown rather than inside it, because it is an
 * answer to a choice the buyer already made: the village exists, we simply
 * cannot get a parcel to it. Every alternative offered is a place already
 * known to resolve, so picking one cannot fail the same way.
 */
function Unserved({ error, onPick, query }) {
  const alternatives = unservedAlternatives(error);
  const isRefusal = isUnserved(error);

  return (
    <div
      role="alert"
      style={{
        marginTop: 8,
        border: '1px solid var(--pc-line-2)',
        borderRadius: 14,
        padding: '12px 14px',
        background: 'var(--pc-mist)',
      }}
    >
      <div style={{ fontSize: 13.5, color: 'var(--pc-green)' }}>
        {error?.message || 'Tujuan itu belum bisa dipakai. Coba pilih yang lain ya.'}
      </div>

      {isRefusal && alternatives.length > 0 ? (
        <ul role="listbox" style={{ listStyle: 'none', padding: 0, margin: '10px 0 0' }}>
          {alternatives.map((row) => {
            const { primary, secondary } = destinationLines(row);
            return (
              <li key={row.ref} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => onPick(row)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: '1px solid var(--pc-line)',
                    borderRadius: 11,
                    background: 'var(--pc-white)',
                    padding: '9px 10px',
                    marginTop: 6,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'block', fontSize: 14, color: 'var(--pc-ink)' }}>
                    <Highlight text={primary} query={query} />
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--pc-muted-2)' }}>
                    {secondary}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** Emphasises the part of a result the buyer actually typed. */
function Highlight({ text, query }) {
  const at = matchRange(text, query);
  if (!at) return text;
  return (
    <>
      {text.slice(0, at.start)}
      <mark style={{ background: 'transparent', color: 'var(--pc-green)', fontWeight: 700 }}>
        {text.slice(at.start, at.end)}
      </mark>
      {text.slice(at.end)}
    </>
  );
}
