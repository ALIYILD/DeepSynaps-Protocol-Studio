import logging

from app.services.log_sanitizer import scrub_sentry_event

logger = logging.getLogger(__name__)


def init_sentry(dsn: str, environment: str) -> None:
    """Initialize Sentry if DSN is configured.

    Wires a `before_send` hook (see app.services.log_sanitizer.scrub_sentry_event)
    so patient identifiers in URLs, sensitive headers (Authorization, Cookie,
    Set-Cookie, X-Demo-Token), and JSON bodies on patient-scoped routes never
    leave the process. Required for HIPAA — follow-up F5 from launch-readiness
    review.
    """
    if not dsn:
        logger.info("Sentry DSN not configured — error tracking disabled")
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlAlchemyIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration

        sentry_logging = LoggingIntegration(
            level=logging.INFO,
            event_level=logging.ERROR,
        )

        def _before_send(event, hint):
            try:
                return scrub_sentry_event(event, hint)
            except Exception:  # pragma: no cover — never let scrubber crash Sentry
                logger.exception("sentry before_send scrubber failed; dropping event")
                return None

        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            integrations=[
                FastApiIntegration(transaction_style="endpoint"),
                SqlAlchemyIntegration(),
                sentry_logging,
            ],
            traces_sample_rate=0.1,
            send_default_pii=False,
            before_send=_before_send,
        )
        logger.info("Sentry initialized", extra={"environment": environment})
    except ImportError:
        logger.warning("sentry-sdk not installed — error tracking disabled")
