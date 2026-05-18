"""Compatibility shim for legacy DeepTwin integration imports."""

from phase5 import deeptwin_integration as _impl

globals().update(vars(_impl))
