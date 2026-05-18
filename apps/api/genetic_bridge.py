"""Compatibility shim for legacy genetic bridge imports."""

from phase5 import genetic_bridge as _impl

globals().update(vars(_impl))
