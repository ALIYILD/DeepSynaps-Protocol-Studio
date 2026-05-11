/**
 * MRI Neuromarkers Library Tab — Part of the Biomarkers page two-tab interface.
 * 
 * Features:
 * - Full-text search with faceted filtering (category, anatomy, modality, sequence)
 * - Sign detail panel with source references
 * - Case integration: attach signs to patient MRI cases
 * - Report insertion workflow
 * - Annotation viewer (future ML overlay support)
 */

import { api } from './api.js';
import { isDemoSession } from './demo-session.js';

/**
 * MRI Neuromarkers Library Tab
 */
export function renderMRINeuromarkersTab() {
  return `
    <div class="tab-pane" id="tab-mri-neuromarkers">
      <div class="section-header">
        <h2>MRI Neuromarkers Library</h2>
        <p class="section-subtitle">
          Clinical education and structured reporting reference for classic MRI neuro signs.
          <strong style="color:var(--red);">Pattern-recognition aid only; not a diagnostic tool.</strong>
        </p>
      </div>

      <!-- Search & Filter -->
      <div class="mri-neuromarkers-controls">
        <div class="search-box">
          <input 
            type="text" 
            id="mri-neuro-search-input" 
            placeholder="Search by name, description, or anatomy..."
            class="search-input"
          />
          <button id="mri-neuro-search-btn" class="btn btn-primary">Search</button>
        </div>
        
        <div class="filter-row">
          <select id="mri-neuro-filter-category" class="filter-select">
            <option value="">All Categories</option>
            <option value="neurodegenerative">Neurodegenerative</option>
            <option value="metabolic">Metabolic</option>
            <option value="demyelinating">Demyelinating</option>
            <option value="vascular">Vascular</option>
            <option value="tumoral">Tumoral</option>
            <option value="developmental">Developmental</option>
            <option value="cerebellar">Cerebellar</option>
          </select>
          
          <select id="mri-neuro-filter-modality" class="filter-select">
            <option value="">All Modalities</option>
            <option value="MRI">MRI</option>
            <option value="CT">CT</option>
            <option value="angiography">Angiography</option>
          </select>
          
          <select id="mri-neuro-filter-sequence" class="filter-select">
            <option value="">All Sequences</option>
            <option value="T1">T1</option>
            <option value="T2">T2</option>
            <option value="FLAIR">FLAIR</option>
            <option value="DWI">DWI</option>
            <option value="SWI">SWI</option>
            <option value="contrast-enhanced">Contrast-enhanced</option>
          </select>
        </div>
      </div>

      <!-- Sign List -->
      <div id="mri-neuro-signs-list" class="signs-list">
        <div class="loading">Loading signs...</div>
      </div>

      <!-- Detail Panel (Modal) -->
      <div id="mri-neuro-detail-modal" class="modal" style="display:none;">
        <div class="modal-content">
          <div class="modal-header">
            <h3 id="detail-sign-name"></h3>
            <button class="modal-close" data-close-detail>&times;</button>
          </div>
          <div class="modal-body" id="mri-neuro-detail-content">
            <!-- Populated by JS -->
          </div>
        </div>
      </div>

      <!-- Case Attachment Panel (for integration with patient MRI cases) -->
      <div id="mri-neuro-case-panel" class="panel-overlay" style="display:none;">
        <div class="panel-content">
          <h3>Attach Sign to Patient Case</h3>
          <div id="mri-neuro-case-content">
            <!-- Populated by JS -->
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize MRI Neuromarkers Tab
 */
export async function initMRINeuromarkersTab() {
  const modal = document.getElementById('mri-neuro-detail-modal');
  const listContainer = document.getElementById('mri-neuro-signs-list');
  const searchBtn = document.getElementById('mri-neuro-search-btn');
  const searchInput = document.getElementById('mri-neuro-search-input');
  const categoryFilter = document.getElementById('mri-neuro-filter-category');
  const modalityFilter = document.getElementById('mri-neuro-filter-modality');
  const sequenceFilter = document.getElementById('mri-neuro-filter-sequence');
  const closeBtn = modal?.querySelector('[data-close-detail]');

  // Load initial signs
  async function loadSigns() {
    try {
      const q = searchInput?.value || '';
      const category = categoryFilter?.value || '';
      const modality = modalityFilter?.value || '';
      const sequence = sequenceFilter?.value || '';

      const params = new URLSearchParams();
      if (q) params.append('q', q);
      if (category) params.append('category', category);
      if (modality) params.append('modality', modality);
      if (sequence) params.append('sequence', sequence);
      params.append('limit', 50);

      if (isDemoSession()) {
        // Demo mode: render static library
        renderDemoSigns(listContainer);
        return;
      }

      const response = await api.get(`/api/neuro-signs/?${params.toString()}`);
      const signs = response.data?.items || [];

      if (signs.length === 0) {
        listContainer.innerHTML = '<p class="empty-state">No signs found.</p>';
        return;
      }

      listContainer.innerHTML = signs.map((sign) => `
        <div class="sign-card" data-sign-id="${sign.id}">
          <div class="sign-card-header">
            <h4>${sign.name}</h4>
            <span class="sign-category badge badge-${sign.category}">${sign.category}</span>
          </div>
          <div class="sign-card-meta">
            <span class="meta-item"><strong>Modality:</strong> ${sign.modality}</span>
            <span class="meta-item"><strong>Anatomy:</strong> ${(sign.anatomy || []).join(', ')}</span>
            <span class="meta-item"><strong>Sequences:</strong> ${(sign.sequences || []).join(', ')}</span>
          </div>
          <p class="sign-card-description">${sign.visual_description || ''}</p>
          <div class="sign-card-conditions">
            <strong>Conditions:</strong> ${(sign.primary_conditions || []).join(', ')}
          </div>
          <div class="sign-card-actions">
            <button class="btn btn-sm btn-outline" data-view-detail="${sign.id}">View Detail</button>
            <button class="btn btn-sm btn-outline" data-attach-case="${sign.id}">Attach to Case</button>
          </div>
        </div>
      `).join('');

      // Bind detail view handlers
      listContainer.querySelectorAll('[data-view-detail]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const signId = btn.getAttribute('data-view-detail');
          await showSignDetail(signId);
        });
      });

      // Bind case attachment handlers
      listContainer.querySelectorAll('[data-attach-case]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const signId = btn.getAttribute('data-attach-case');
          await showCaseAttachment(signId);
        });
      });
    } catch (error) {
      console.error('Error loading signs:', error);
      listContainer.innerHTML = `<p class="error">Error loading signs: ${error.message}</p>`;
    }
  }

  // Show sign detail
  async function showSignDetail(signId) {
    try {
      if (isDemoSession()) {
        showDemoSignDetail(signId, modal);
        return;
      }

      const response = await api.get(`/api/neuro-signs/${signId}`);
      const sign = response.data;

      const detailContent = document.getElementById('mri-neuro-detail-content');
      document.getElementById('detail-sign-name').textContent = sign.name;

      detailContent.innerHTML = `
        <div class="detail-section">
          <h4>Category & Anatomy</h4>
          <p><strong>Category:</strong> ${sign.category}</p>
          <p><strong>Modality:</strong> ${sign.modality}</p>
          <p><strong>Anatomy:</strong> ${(sign.anatomy || []).join(', ')}</p>
          <p><strong>Sequences:</strong> ${(sign.sequences || []).join(', ')}</p>
        </div>

        <div class="detail-section">
          <h4>Clinical Information</h4>
          <p><strong>Primary Conditions:</strong> ${(sign.primary_conditions || []).join(', ')}</p>
          <p><strong>Associated Conditions:</strong> ${(sign.associated_conditions || []).join(', ')}</p>
        </div>

        <div class="detail-section">
          <h4>Visual Description</h4>
          <p>${sign.visual_description || 'N/A'}</p>
        </div>

        <div class="detail-section">
          <h4>Pathophysiology</h4>
          <p>${sign.pathophysiology_explanation || 'N/A'}</p>
        </div>

        <div class="detail-section">
          <h4>Differential Diagnosis</h4>
          <p>${sign.differential_diagnosis || 'N/A'}</p>
        </div>

        <div class="detail-section warning-section">
          <h4>Clinical Caveat</h4>
          <p>${sign.clinical_caveat || 'Pattern-recognition aid only; clinical correlation required.'}</p>
        </div>

        <div class="detail-section">
          <h4>Reporting Phrase</h4>
          <textarea readonly class="reporting-phrase">${sign.reporting_phrase || ''}</textarea>
          <button class="btn btn-sm btn-primary" data-copy-phrase>Copy Phrase</button>
        </div>

        <div class="detail-section">
          <h4>Evidence Notes</h4>
          <p>${sign.evidence_notes || 'N/A'}</p>
        </div>

        <div class="detail-section">
          <h4>Sources</h4>
          <ul>
            ${(sign.source_refs || []).map((ref) => `
              <li>
                <strong>${ref.title}</strong> (${ref.year || 'N/A'})
                ${ref.url ? `<a href="${ref.url}" target="_blank">Link</a>` : ''}
              </li>
            `).join('')}
          </ul>
        </div>
      `;

      // Bind copy phrase button
      detailContent.querySelector('[data-copy-phrase]').addEventListener('click', () => {
        const textarea = detailContent.querySelector('.reporting-phrase');
        textarea.select();
        document.execCommand('copy');
        alert('Phrase copied to clipboard!');
      });

      modal.style.display = 'flex';
    } catch (error) {
      console.error('Error loading sign detail:', error);
      document.getElementById('mri-neuro-detail-content').innerHTML = `<p class="error">${error.message}</p>`;
    }
  }

  // Show case attachment panel
  async function showCaseAttachment(signId) {
    // This would integrate with the patient's current MRI case
    // For now, show a placeholder
    alert('Case attachment workflow — integrate with patient MRI case context.');
  }

  // Event listeners
  searchBtn?.addEventListener('click', loadSigns);
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadSigns();
  });
  categoryFilter?.addEventListener('change', loadSigns);
  modalityFilter?.addEventListener('change', loadSigns);
  sequenceFilter?.addEventListener('change', loadSigns);
  closeBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
  });

  // Initial load
  await loadSigns();
}

/**
 * Demo mode: Render static sign library
 */
function renderDemoSigns(container) {
  const demoSigns = [
    {
      id: 'demo_hummingbird',
      name: 'Hummingbird Sign',
      category: 'neurodegenerative',
      modality: 'MRI',
      anatomy: ['midbrain', 'brainstem'],
      sequences: ['T1', 'T2'],
      visual_description: 'Selective atrophy of the midbrain creating a narrow, beak-like appearance.',
      primary_conditions: ['Progressive Supranuclear Palsy (PSP)', 'Multiple System Atrophy (MSA)'],
    },
    {
      id: 'demo_mickey',
      name: 'Mickey Mouse Sign',
      category: 'neurodegenerative',
      modality: 'MRI',
      anatomy: ['midbrain'],
      sequences: ['T2', 'FLAIR'],
      visual_description: 'Rounded midbrain contour on axial imaging.',
      primary_conditions: ['Multiple System Atrophy (MSA-P)'],
    },
  ];

  container.innerHTML = demoSigns.map((sign) => `
    <div class="sign-card" data-sign-id="${sign.id}">
      <div class="sign-card-header">
        <h4>${sign.name}</h4>
        <span class="sign-category badge badge-${sign.category}">${sign.category}</span>
      </div>
      <div class="sign-card-meta">
        <span class="meta-item"><strong>Anatomy:</strong> ${(sign.anatomy || []).join(', ')}</span>
      </div>
      <p class="sign-card-description">${sign.visual_description}</p>
      <div class="sign-card-conditions">
        <strong>Conditions:</strong> ${(sign.primary_conditions || []).join(', ')}
      </div>
      <div class="sign-card-actions">
        <p class="demo-notice">Demo mode: Live API not available</p>
      </div>
    </div>
  `).join('');
}

/**
 * Demo mode: Show sign detail
 */
function showDemoSignDetail(signId, modal) {
  const detailContent = document.getElementById('mri-neuro-detail-content');
  document.getElementById('detail-sign-name').textContent = 'Demo Sign';
  detailContent.innerHTML = `
    <p class="demo-notice">Demo Mode: Full sign details not available. 
    Connect to the API to view complete information.</p>
  `;
  modal.style.display = 'flex';
}

/**
 * CSS Styles for MRI Neuromarkers Tab
 */
export const MRI_NEUROMARKERS_STYLES = `
.tab-pane#tab-mri-neuromarkers {
  padding: 2rem;
  background: linear-gradient(135deg, #0f172a 0%, #1a1f3a 100%);
  color: var(--text-primary);
}

.section-header {
  margin-bottom: 2rem;
}

.section-header h2 {
  font-size: 1.8rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.section-subtitle {
  font-size: 0.95rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.mri-neuromarkers-controls {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 2rem;
  background: rgba(255, 255, 255, 0.02);
  padding: 1.5rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.search-box {
  display: flex;
  gap: 0.5rem;
}

.search-input {
  flex: 1;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: var(--text-primary);
  font-size: 0.95rem;
}

.search-input::placeholder {
  color: var(--text-tertiary);
}

.filter-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.filter-select {
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: var(--text-primary);
  font-size: 0.95rem;
}

.signs-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.sign-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  padding: 1.25rem;
  transition: all 0.3s ease;
  cursor: pointer;
}

.sign-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(100, 200, 255, 0.3);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.sign-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
  gap: 1rem;
}

.sign-card-header h4 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  white-space: nowrap;
}

.badge-neurodegenerative {
  background: rgba(244, 63, 94, 0.2);
  color: #f03f5e;
}

.badge-metabolic {
  background: rgba(251, 146, 60, 0.2);
  color: #fb923c;
}

.badge-demyelinating {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}

.badge-vascular {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.badge-tumoral {
  background: rgba(168, 85, 247, 0.2);
  color: #a855f7;
}

.badge-developmental {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.badge-cerebellar {
  background: rgba(14, 165, 233, 0.2);
  color: #0ea5e9;
}

.sign-card-meta {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
}

.meta-item {
  color: var(--text-secondary);
}

.meta-item strong {
  color: var(--text-primary);
}

.sign-card-description {
  font-size: 0.95rem;
  line-height: 1.5;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.sign-card-conditions {
  font-size: 0.9rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
  padding: 0.75rem;
  background: rgba(100, 200, 255, 0.1);
  border-radius: 0.375rem;
}

.sign-card-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn-sm {
  padding: 0.5rem 1rem;
  font-size: 0.85rem;
}

.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-header h3 {
  margin: 0;
  font-size: 1.5rem;
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 2rem;
  cursor: pointer;
  line-height: 1;
}

.modal-body {
  padding: 1.5rem;
}

.detail-section {
  margin-bottom: 1.5rem;
}

.detail-section h4 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.75rem;
}

.detail-section p {
  color: var(--text-secondary);
  line-height: 1.6;
}

.warning-section {
  background: rgba(244, 63, 94, 0.1);
  border-left: 3px solid #f03f5e;
  padding: 1rem;
  border-radius: 0.375rem;
}

.reporting-phrase {
  width: 100%;
  padding: 0.75rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: var(--text-primary);
  font-family: monospace;
  font-size: 0.9rem;
  min-height: 60px;
  resize: vertical;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--text-tertiary);
}

.demo-notice {
  background: rgba(251, 146, 60, 0.1);
  border: 1px solid rgba(251, 146, 60, 0.3);
  padding: 0.75rem;
  border-radius: 0.375rem;
  color: #fb923c;
  font-size: 0.85rem;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: var(--text-secondary);
}

.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  padding: 1rem;
  border-radius: 0.375rem;
}
`;
