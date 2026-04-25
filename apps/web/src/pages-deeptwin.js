// Legacy Deeptwin page entrypoint.
// Kept for backward compatibility, re-exports Brain Twin page implementation.
import { pgBrainTwin } from './pages-brain-twin.js';

export async function pgDeeptwin(setTopbar, navigate) {
  return pgBrainTwin(setTopbar, navigate);
}

