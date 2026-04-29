# qEEG Artefact Examples

Reference cases displayed in the workbench **Examples** panel. Each
case helps a clinician recognise common patterns and apply the right
cleaning action.

| Title | Channels | Why it matters | Suggested action | Check |
|-------|----------|---------------|------------------|-------|
| Posterior alpha (eyes closed) | O1, O2, Pz | Healthy posterior alpha rhythm dominant in eyes-closed condition. | None — example of clean signal. | Confirm rhythm attenuates on eye-opening (Berger effect). |
| Eye blink (frontal) | Fp1, Fp2 | High-amplitude positive deflection on frontal channels lasting <1 s. | Mark as artefact; consider ICA component rejection. | Look for symmetry across Fp1/Fp2. |
| Muscle (temporal/frontal) | T3, T4, F7, F8 | High-frequency (>20 Hz) bursts over temporal or frontalis-muscle channels. | Mark bad segment if persistent; consider re-recording. | Patient jaw/neck tension; remind patient to relax. |
| Line noise (50/60 Hz) | All channels | Sinusoidal artefact at mains frequency from poor grounding or environment. | Apply notch filter; verify ground impedance. | Check environment for unshielded equipment. |
| Flat channel | Single | Constant near-zero amplitude indicates electrode disconnection or saturation. | Mark bad channel; interpolate or exclude. | Re-seat electrode; verify impedance < 5 kΩ. |
| Electrode pop | Single | Sudden step-change followed by exponential decay; electrolyte bridge break. | Mark bad segment locally. | Apply more gel; re-seat the electrode. |
| Movement | Multiple | Slow large-amplitude drift across many channels from head movement. | Mark bad segment; instruct patient to remain still. | Position pillow / chin rest. |
| ECG contamination | T3, T4, Cz | Periodic QRS-like complexes at heart-rate frequency, typically near reference. | Use ICA to isolate cardiac component. | Re-reference; consider linked-mastoid. |
| Poor recording — repeat | Many | Multiple channels noisy/flat; <60% retained data. | Stop interpretation, repeat recording. | Cap fit, hair, gel, environment. |

> Decision-support only. Clinician confirmation required before any
> cleaning is applied. Original raw EEG is preserved.
