/**
 * Entry for `/studio/analyzer/:id` (see src/main.js).
 * Stub keeps Vite able to resolve the dynamic import; extend when the studio shell ships.
 */
export function mountStudioAnalyzer(): void {
  const el = document.getElementById('app');
  if (!el) return;
  el.innerHTML =
    '<div role="status" style="padding:1.5rem;font-family:system-ui,Segoe UI,sans-serif;max-width:40rem">'
    + 'Studio analyzer route is not fully mounted in this build. '
    + '<a href="/">Return to the main app</a>.'
    + '</div>';
}
