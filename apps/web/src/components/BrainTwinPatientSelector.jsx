import React, { useState, useEffect, useCallback } from 'react';
import { brainTwinApi } from './brain-twin-api.js';

/**
 * DeepSynaps design-system colors (mirrors styles.css)
 */
const DS = {
  navy950: '#050810',
  navy900: '#080d1a',
  navy800: '#0e1628',
  navy700: '#152040',
  navy600: '#1e2d52',
  teal: '#00d4bc',
  tealDim: '#00a896',
  blue: '#4a9eff',
  blueDim: '#2d7fe0',
  violet: '#9b7fff',
  rose: '#ff6b9d',
  amber: '#ffb547',
  green: '#4ade80',
  red: '#ff6b6b',
  textPrimary: '#e8edf5',
  textSecondary: '#a8b3c1',
  textTertiary: '#9ba6b8',
  border: 'rgba(255,255,255,0.06)',
  borderHover: 'rgba(255,255,255,0.12)',
  bgCard: 'rgba(14,22,40,0.8)',
  bgInput: 'rgba(255,255,255,0.08)',
  radiusMd: '10px',
  radiusLg: '14px',
  fontBody: "'DM Sans', system-ui, sans-serif",
};

/**
 * PatientSelector — dropdown that connects to existing patient API.
 * Props:
 *   - api: optional existing api object (with listPatients, getPatient)
 *   - onSelect: (patientId, patient) => void
 *   - selectedPatientId: string | null
 *   - disabled: boolean
 *   - placeholder: string
 */
export function BrainTwinPatientSelector({
  api,
  onSelect,
  selectedPatientId = null,
  disabled = false,
  placeholder = 'Select a patient...',
}) {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const loadPatients = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let result;
      if (api && typeof api.listPatients === 'function') {
        result = await api.listPatients({ limit: 200 });
      } else {
        // Fallback to direct fetch via brainTwinApi health endpoint to confirm connectivity,
        // then load from sessionStorage / localStorage patient cache if available.
        const cached = (() => {
          try {
            const raw = globalThis.localStorage?.getItem?.('ds_patients_cache');
            return raw ? JSON.parse(raw) : null;
          } catch { return null; }
        })();
        if (cached && Array.isArray(cached.items)) {
          result = cached;
        } else {
          throw new Error('No patient API available. Pass an api prop with listPatients.');
        }
      }
      const items = Array.isArray(result) ? result : result?.items || [];
      setPatients(items);
    } catch (err) {
      setError(err.message || 'Failed to load patients');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const filtered = patients.filter((p) => {
    const term = search.toLowerCase();
    const name = [p.first_name, p.last_name, p.display_name, p.name].filter(Boolean).join(' ').toLowerCase();
    return name.includes(term) || (p.id || '').toLowerCase().includes(term);
  });

  const selected = patients.find((p) => (p.id || p.patient_id) === selectedPatientId);

  const displayName = selected
    ? ([selected.first_name, selected.last_name, selected.display_name, selected.name].filter(Boolean).join(' ') || selected.id)
    : '';

  return (
    <div style={{ position: 'relative', fontFamily: DS.fontBody, minWidth: 240, maxWidth: 360 }}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '10px 14px',
          borderRadius: DS.radiusMd,
          border: `1px solid ${open ? DS.teal : DS.border}`,
          background: DS.navy800,
          color: selected ? DS.textPrimary : DS.textTertiary,
          fontSize: 13,
          fontFamily: DS.fontBody,
          cursor: disabled ? 'not-allowed' : 'pointer',
          outline: 'none',
          transition: 'border-color .15s ease',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {loading ? 'Loading patients...' : displayName || placeholder}
        </span>
        <span style={{ flexShrink: 0, fontSize: 10, color: DS.textTertiary }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {/* Error pill */}
      {error && (
        <div
          role="alert"
          style={{
            marginTop: 6,
            padding: '8px 12px',
            borderRadius: DS.radiusMd,
            border: `1px solid ${DS.red}33`,
            background: `${DS.red}11`,
            color: DS.red,
            fontSize: 12,
          }}
        >
          {error}
          {' '}
          <button
            type="button"
            onClick={loadPatients}
            style={{
              background: 'none',
              border: 'none',
              color: DS.teal,
              cursor: 'pointer',
              fontSize: 12,
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 50,
            borderRadius: DS.radiusLg,
            border: `1px solid ${DS.borderHover}`,
            background: DS.navy800,
            boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
            maxHeight: 320,
            overflow: 'auto',
            padding: 6,
          }}
        >
          {/* Search input */}
          <div style={{ padding: '4px 6px 8px' }}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search patients..."
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: DS.radiusMd,
                border: `1px solid ${DS.border}`,
                background: DS.navy900,
                color: DS.textPrimary,
                fontSize: 12,
                fontFamily: DS.fontBody,
                outline: 'none',
              }}
            />
          </div>

          {/* Patient list */}
          {filtered.length === 0 && (
            <div style={{ padding: '14px 12px', color: DS.textTertiary, fontSize: 12, textAlign: 'center' }}>
              No patients found
            </div>
          )}

          {filtered.map((p) => {
            const pid = p.id || p.patient_id;
            const name = [p.first_name, p.last_name, p.display_name, p.name].filter(Boolean).join(' ') || pid;
            const isSelected = pid === selectedPatientId;
            const age = p.age || (() => {
              if (!p.dob && !p.date_of_birth) return null;
              const d = new Date(p.dob || p.date_of_birth);
              if (Number.isNaN(d.getTime())) return null;
              const now = new Date();
              let a = now.getFullYear() - d.getFullYear();
              if (now.getMonth() - d.getMonth() < 0) a -= 1;
              return a >= 0 ? a : null;
            })();
            const condition = p.primary_condition || p.condition || p.primary_diagnosis || '';

            return (
              <button
                key={pid}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onSelect?.(pid, p);
                  setOpen(false);
                  setSearch('');
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 12px',
                  borderRadius: DS.radiusMd,
                  border: 'none',
                  background: isSelected ? `${DS.teal}18` : 'transparent',
                  color: DS.textPrimary,
                  fontSize: 12.5,
                  fontFamily: DS.fontBody,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  transition: 'background .12s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = DS.bgInput;
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'transparent';
                }}
              >
                <div style={{ fontWeight: 600 }}>{name}</div>
                <div style={{ color: DS.textTertiary, fontSize: 11 }}>
                  {pid}
                  {age != null && ` · ${age}y`}
                  {condition && ` · ${condition}`}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default BrainTwinPatientSelector;
