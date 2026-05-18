## Kimi Recovery Pack

This directory preserves Kimi-generated work from `/Users/aliyildirim/Desktop/Kimi_Agent_临床OS部署计划` without promoting unverified staging code into active application paths.

Preserved on `2026-05-18`.

Contents:
- `archive/Kimi_Agent_临床OS部署计划_backup_2026-05-18.tgz`
  Full compressed backup of the Kimi workspace.
- `data/kimi_phase4_evidence.db`
  Preserved Kimi SQLite evidence database from `phase4/evidence/evidence.db`.
- `docs/KIMI_PRESERVATION_AUDIT_2026-05-18.md`
  Audit note describing what was checked and why the staging tree was not treated as a deploy target.
- `docs/DATABASE_INVENTORY.md`
  Kimi's database inventory document.
- `docs/KIMI_BUILD_LOG.txt`
  Kimi build log from the staging workspace.
- `docs/ARCHIVE_CONTENTS.txt`
  File inventory of the original Kimi workspace at the time of preservation.
- `MANIFEST.tsv`
  Byte sizes for preserved files.
- `CHECKSUMS.sha256`
  SHA-256 hashes for integrity verification.

Why this exists:
- The Kimi workspace contains important artifacts, reports, and a smaller evidence database.
- The same workspace also contains staging-only integration files with unresolved imports and version mismatches.
- Preserving the artifacts in-repo avoids data loss while keeping production code paths stable.

Verification completed:
- The active repo already contains the `health_dashboard` router mount in `apps/api/app/main.py`.
- The repo branch head matches `main`/`origin/main`.
- The Kimi workspace backup archive and evidence DB were copied into this recovery pack.

Not implied by this pack:
- It does not certify that every Kimi staging file is production-ready.
- It does not replace the canonical repo evidence database.
