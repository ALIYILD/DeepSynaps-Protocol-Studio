import logging

logger = logging.getLogger(__name__)


def init_sentry(dsn: str, environment: str) -> None:
    """Initialize Sentry if DSN is configured."""
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
        )
        logger.info("Sentry initialized", extra={"environment": environment})
    except ImportError:
        logger.warning("sentry-sdk not installed — error tracking disabled")
