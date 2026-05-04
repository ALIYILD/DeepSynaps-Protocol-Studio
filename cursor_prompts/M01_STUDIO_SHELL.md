# M1 — Studio shell & routing

## Scope

Minimum **empty studio**: load EEG Studio from the web app, select or open a recording, show layout shell (chrome + empty state or placeholder) without full trace rendering (covered in M2).

## File targets (primary)

- `apps/web/src/studio/main.tsx`
- `apps/web/src/studio/bootstrap.tsx`
- `apps/web/public/` or Vite entry that serves `studio.html` (verify existing pattern)

## Data contracts

- **Recording id**: string UUID from backend (`QEEGAnalysis.id` / recording slug used elsewhere).
- Query params: document expected keys (`app`, `id`, etc.) and keep backward compatible.

## Acceptance criteria

- [ ] Navigating to studio URL with a valid recording id mounts the studio layout without console errors.
- [ ] Invalid / missing id shows a controlled error or redirect (no blank crash).
- [ ] Studio can switch modes if dual-mode exists (e.g. database vs viewer) without reload loops.

## Tests

- Playwright or lightweight smoke: open studio URL → expect shell markers (title region / layout).
- `npm run build` for `apps/web` passes.

## Dependencies

None (first module).
