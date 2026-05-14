# NPM Audit Findings - DeepSynaps Web

## Summary
8 vulnerabilities (7 moderate, 1 critical)

## Vulnerability Chain
```
@cornerstonejs/core@4.22.6
  └─ @kitware/vtk.js@34.15.1
      └─ xmlbuilder2@3.0.2
          └─ js-yaml@<3.14.2 (VULNERABLE)
```

## Issue
js-yaml < 3.14.2 has prototype pollution in YAML merge operations (GHSA-mh29-5h37-fv8m)

## Why It's Blocked
- @cornerstonejs/core (medical imaging) is pinned to vtk.js versions that use old xmlbuilder2
- Updating @cornerstonejs requires testing MRI Analyzer functionality
- No stable fix available without major version bump

## Recommendation
1. Defer to maintenance window (coordinate with MRI Analyzer testing)
2. When updating: bump @cornerstonejs/core to next major if available
3. Add security scanning to CI to catch similar issues

## Clinical Impact
- **Severity for DeepSynaps:** LOW - prototype pollution primarily affects YAML parsing
- **Use case:** Only triggered if user-controlled YAML is parsed with merge operators (unlikely in MRI workflow)
