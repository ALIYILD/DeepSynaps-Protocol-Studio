/**
 * neuroimaging-live-registry.js — Knowledge Explorer Category-4 surface
 *
 * Adds a small React component that fetches the backend neuroimaging
 * adapter registry (PR #1053) and renders a lifecycle summary alongside
 * the existing hardcoded curated catalog. Does NOT replace, mutate, or
 * remove the hardcoded list — that list is owned by
 * `pages-knowledge-coverage.test.js` and is the authoritative curated
 * catalog until DTO promotion lands in a follow-up PR.
 *
 * Behaviour:
 *  - On mount, fetches /api/v1/neuroimaging/adapters via api.neuroimagingListAdapters.
 *  - Renders an empty "registry unavailable" state if the backend isn't
 *    deployed yet (so PR-2 can ship before or after PR-1 cleanly).
 *  - Groups the sources by lifecycle_state ("healthy", "deprecated", etc.)
 *    and surfaces them as small chips + an optional expandable list.
 *  - Treats `lifecycle_state` exactly as the backend reports it — no
 *    re-categorisation, no derived "active"/"inactive" semantics.
 *
 * This component is intentionally self-contained: no shared styling, no
 * external dependencies beyond React + the apps/web api facade.
 */

import React, { useEffect, useState } from 'react';
import { api } from './api.js';

const LIFECYCLE_PRESENTATION = {
  healthy:               { label: 'healthy',              tone: '#5e8a6e' },
  degraded:              { label: 'degraded',             tone: '#b8895e' },
  disabled:              { label: 'disabled',             tone: '#9a9490' },
  unavailable:           { label: 'unavailable',          tone: '#a66b6b' },
  catalogued:            { label: 'catalog only',         tone: '#5e7a96' },
  software_resource:     { label: 'software resource',    tone: '#5e7a96' },
  requires_application:  { label: 'application required', tone: '#b8895e' },
  deprecated:            { label: 'deprecated',           tone: '#a66b6b' },
};

export function summariseLifecycle(sources) {
  const list = Array.isArray(sources) ? sources : [];
  const counts = {};
  const byState = {};
  let total = 0;
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const state = String(row.lifecycle_state || 'unknown');
    counts[state] = (counts[state] || 0) + 1;
    if (!byState[state]) byState[state] = [];
    byState[state].push(row);
    total += 1;
  }
  return { counts, byState, total };
}

function StateChip({ state, count }) {
  const meta = LIFECYCLE_PRESENTATION[state] || { label: state, tone: '#8a8580' };
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    background: `${meta.tone}1a`,
    color: meta.tone,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '.02em',
    textTransform: 'uppercase',
    border: `1px solid ${meta.tone}55`,
  };
  return React.createElement('span', { style, 'data-state': state }, `${count} ${meta.label}`);
}

function SourceRow({ source }) {
  const meta = LIFECYCLE_PRESENTATION[source.lifecycle_state] || { label: source.lifecycle_state || 'unknown', tone: '#8a8580' };
  const wrap = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid #e8e5e1',
    gap: 12,
  };
  const left = React.createElement('div', null,
    React.createElement('div', { style: { fontSize: 12, fontWeight: 600, color: '#2d2a26' } }, source.name || source.id),
    React.createElement('div', { style: { fontSize: 10, color: '#6b6560', marginTop: 2 } },
      `${source.id || ''} · ${source.access_type || ''}${source.requires_credentials ? ' · credentials' : ''}`
    ),
  );
  const right = React.createElement('span', {
    style: {
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '.02em',
      textTransform: 'uppercase',
      color: meta.tone,
      border: `1px solid ${meta.tone}55`,
      background: `${meta.tone}10`,
      padding: '2px 8px',
      borderRadius: 999,
    },
  }, meta.label);
  return React.createElement('div', { style: wrap, 'data-source-id': source.id }, left, right);
}

export default function NeuroimagingLiveRegistry() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    sources: [],
    disclaimer: '',
  });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const payload = await api.neuroimagingListAdapters();
        if (cancelled) return;
        const sources = Array.isArray(payload && payload.sources) ? payload.sources : [];
        setState({
          loading: false,
          error: null,
          sources,
          disclaimer: (payload && payload.decision_support_disclaimer) || '',
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          loading: false,
          error: err && err.message ? err.message : 'registry unavailable',
          sources: [],
          disclaimer: '',
        });
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const { counts, byState, total } = summariseLifecycle(state.sources);

  const wrapStyle = {
    marginTop: 24,
    marginBottom: 16,
    padding: '14px 16px',
    borderRadius: 12,
    border: '1px solid #e8e5e1',
    background: '#ffffff',
  };
  const headerRow = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap',
  };
  const titleStyle = { fontSize: 13, fontWeight: 700, color: '#2d2a26', letterSpacing: '.02em' };
  const subStyle = { fontSize: 11, color: '#6b6560', marginTop: 4, lineHeight: 1.5 };

  const heading = React.createElement('div', null,
    React.createElement('div', { style: titleStyle }, 'Neuroimaging live registry'),
    React.createElement(
      'div',
      { style: subStyle },
      'Backed by /api/v1/neuroimaging/adapters (PR #1053). Curated catalog above remains the authoritative reference until adapters are promoted to the canonical DTO.'
    ),
  );

  let body;
  if (state.loading) {
    body = React.createElement('div', { style: { fontSize: 12, color: '#6b6560', marginTop: 10 } }, 'Loading live registry…');
  } else if (state.error) {
    body = React.createElement('div', {
      style: {
        marginTop: 10,
        padding: '8px 10px',
        background: '#f5ebe3',
        color: '#8e6a48',
        borderRadius: 8,
        fontSize: 12,
        border: '1px solid #b8895e55',
      },
      'data-testid': 'neuroimaging-live-registry-unavailable',
    }, `Registry unavailable — backend not deployed yet (${state.error}).`);
  } else if (total === 0) {
    body = React.createElement('div', {
      style: { fontSize: 12, color: '#6b6560', marginTop: 10 },
      'data-testid': 'neuroimaging-live-registry-empty',
    }, 'No neuroimaging sources are catalogued yet.');
  } else {
    const chips = Object.entries(counts).map(([s, c]) =>
      React.createElement(StateChip, { key: s, state: s, count: c })
    );
    body = React.createElement('div', null,
      React.createElement('div', {
        style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 },
        'data-testid': 'neuroimaging-live-registry-chips',
      }, ...chips),
      React.createElement('div', { style: { fontSize: 11, color: '#6b6560', marginTop: 8 } },
        `${total} source${total === 1 ? '' : 's'} in registry`
      ),
      React.createElement('button', {
        type: 'button',
        onClick: () => setExpanded((v) => !v),
        style: {
          marginTop: 10,
          padding: '6px 12px',
          fontSize: 11,
          fontWeight: 600,
          background: 'transparent',
          border: '1px solid #d4d0ca',
          borderRadius: 6,
          color: '#6b6560',
          cursor: 'pointer',
        },
        'data-testid': 'neuroimaging-live-registry-toggle',
      }, expanded ? 'Hide sources' : 'View live registry'),
      expanded
        ? React.createElement(
            'div',
            {
              style: {
                marginTop: 10,
                border: '1px solid #e8e5e1',
                borderRadius: 8,
                background: '#faf9f7',
                overflow: 'hidden',
              },
              'data-testid': 'neuroimaging-live-registry-list',
            },
            ...state.sources.map((s) =>
              React.createElement(SourceRow, { key: s.id || s.name, source: s })
            )
          )
        : null,
    );
  }

  return React.createElement('section', {
    style: wrapStyle,
    'data-testid': 'neuroimaging-live-registry',
  },
    React.createElement('div', { style: headerRow },
      heading,
    ),
    body,
    state.disclaimer
      ? React.createElement('div', {
          style: {
            marginTop: 12,
            padding: '8px 10px',
            background: '#f5ebe3',
            color: '#8e6a48',
            borderRadius: 8,
            fontSize: 11,
            lineHeight: 1.5,
            border: '1px solid #b8895e33',
          },
          'data-testid': 'neuroimaging-live-registry-disclaimer',
        }, state.disclaimer)
      : null,
  );
}
