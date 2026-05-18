"""Compatibility shim for legacy qEEG bridge imports."""

from phase5 import qeeg_bridge as _impl

globals().update(vars(_impl))
