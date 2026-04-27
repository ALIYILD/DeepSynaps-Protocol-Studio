# Web 3D Viewer (qEEG brain surface)

## Goal

Provide a **fast, clinician-friendly** interactive brain surface viewer in the web app for qEEG source-derived maps, without relying on external CDNs and without shipping normative datasets to the browser.

## Data contract (backend → frontend)

Endpoint returns JSON (`version=1`) with:

- **`mesh`**
  - `positions`: flat list of length `3*N` (LH then RH vertex order)
  - `indices`: flat list of length `3*M` (triangle indices)
  - `n_lh`, `n_rh`: vertex counts per hemisphere
- **`bands`**: per band name (e.g. `delta`, `theta`, `alpha`, `beta`, `gamma`, `TBR`)
  - `power`: list length `N` (patient-only scalar map)
  - `z`: list length `N` computed **within-subject** as \((x-\mu)/\sigma\), clipped to \([-4,4]\)
  - `power_scale` / `z_scale`: fixed min/max for frontend lockstep rendering
- **`luts`**
  - `power`: viridis `rgba256` LUT
  - `z`: RdBu_r `rgba256` LUT

## Mesh strategy

- Default template is **FreeSurfer `fsaverage` surfaces**, aggressively decimated to ~30k faces for web delivery.
- The mesh is **cached once per process** in `deepsynaps_qeeg.viz.web_payload` so repeated API calls only vary in scalars.
- Vertex coordinates are quantized (default 3 decimals) to reduce JSON size while keeping a stable shape.

## Payload size guardrails

- JSON uses **flat arrays** for `positions` and `indices` to reduce bracket overhead.
- Faces are decimated deterministically by stride to an upper bound around `TARGET_FACES`.
- Goal: keep typical payloads **< 5MB gzipped** (mesh cached server-side; response still includes mesh today for simplicity).

## Frontend viewer

- Uses **Niivue** mesh rendering.
- Controls:
  - view buttons: lateral / medial / dorsal / ventral
  - hemisphere toggle: left / right / both
  - band selector: delta / theta / alpha / beta / gamma / TBR
  - z-score overlay toggle + opacity slider
- Styling constraints: **no jet**, use **viridis** and **RdBu_r** only, and keep fixed scales from backend.

## Notes / non-goals

- No normative population maps are shipped to the browser.
- Current backend can accept either per-vertex band scalars or ROI maps (aparc labels projected to vertices).
- Future: send the mesh once and cache in the browser (ETag + `If-None-Match`) to further reduce response sizes.

