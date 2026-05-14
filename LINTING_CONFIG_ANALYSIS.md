# DeepSynaps Linting Configuration

## ESLint (JavaScript/TypeScript)
✅ Configured in `apps/web/eslint.config.js`

## Prettier (Code Formatting)
❌ Not configured - recommend adding to web app

## Ruff (Python)
✅ Configured in:
- `packages/mri-pipeline/pyproject.toml`
- Other packages with individual configs

## Suggested Setup

### 1. Add Prettier to Web App
```bash
cd apps/web
npm install --save-dev prettier
```

### 2. Create Root .prettierrc
```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

### 3. Unified Ruff Config (Root)
```toml
[tool.ruff]
line-length = 100
target-version = "py310"

[tool.ruff.lint]
select = [
  "E",    # pycodestyle errors
  "W",    # pycodestyle warnings
  "F",    # Pyflakes
  "I",    # isort
  "UP",   # pyupgrade
]
```

### 4. Add to CI/CD
```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Lint JavaScript
        run: npm run lint --workspace @deepsynaps/web
      - name: Lint Python
        run: ruff check packages/
```

## Current Status
- ✅ JavaScript/TypeScript: ESLint configured, running
- ⚠️ Python: Ruff per-package, could consolidate at root
- ❌ Code formatting: Prettier missing from web app
- ⏳ CI integration: Check GitHub Actions
