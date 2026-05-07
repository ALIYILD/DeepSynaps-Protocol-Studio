"""Prepend the voice-engine package dir to sys.path so tests can do bare `import transcription`."""
import sys
from pathlib import Path

_VOICE_ENGINE_DIR = str(Path(__file__).parent.parent)
if _VOICE_ENGINE_DIR not in sys.path:
    sys.path.insert(0, _VOICE_ENGINE_DIR)
