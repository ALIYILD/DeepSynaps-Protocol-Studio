"""Background workers for DeepSynaps Studio Clinical OS.

Each module in this package implements a single named worker that runs on a
fixed cadence (APScheduler-managed where possible) and follows the same
contract:

* ``tick()`` is one scan iteration; pure & testable in isolation.
* ``start()`` / ``stop()`` register / unregister the scheduler job.
* All exceptions are caught and logged inside ``tick`` so the worker
  thread never dies on a transient DB / network error.
* Status (running flag, last-tick timestamp, last error, paged-this-hour,
  errors-this-hour) is exposed via a small in-memory dataclass that the
  worker's HTTP status endpoint reads.

See :mod:`app.workers.auto_page_worker` for the SLA-breach auto-page worker.
"""
