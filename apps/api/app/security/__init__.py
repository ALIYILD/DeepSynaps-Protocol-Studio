"""Security predicates and helpers.

This sub-package centralises authorisation primitives that today are
re-implemented inline across many routers (cross-clinic gates, demo-mode
short-circuits, role checks). New code should import from here instead
of redefining ad-hoc helpers.
"""
