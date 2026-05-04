# DeepSynaps Protocol Studio — Deployment Entry Point

This repository no longer uses the legacy root deployment path as the maintained
release path.

Use these instead:

- Backend / Fly.io API deploy:
  [apps/api/DEPLOY.md](/Users/aliyildirim/DeepSynaps-Protocol-Studio/merged-all-2026-05-04/apps/api/DEPLOY.md)
- Preview deploy helper:
  [scripts/deploy-preview.sh](/Users/aliyildirim/DeepSynaps-Protocol-Studio/merged-all-2026-05-04/scripts/deploy-preview.sh)
- Netlify site config:
  [netlify.toml](/Users/aliyildirim/DeepSynaps-Protocol-Studio/merged-all-2026-05-04/netlify.toml)

Current maintained topology:

- Web: Netlify
- API: Fly.io via `apps/api/fly.toml` and `apps/api/Dockerfile`
- Preview API DB: SQLite on the Fly volume at `/data`

Do not use these as the primary deployment path:

- repository-root `Dockerfile`
- repository-root `fly.toml`

They are retained only as legacy compatibility artifacts and can drift from the
maintained `apps/api` deployment path.

Canonical commands:

```bash
# Preview web
bash scripts/deploy-preview.sh

# Preview API
bash scripts/deploy-preview.sh --api

# Direct API deploy from repo root
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
```
