"""Compatibility shim for legacy medication bridge imports."""

from phase5 import medication_bridge as _impl

globals().update(vars(_impl))
