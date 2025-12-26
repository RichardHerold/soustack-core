# GitHub Actions: Validate Soustack recipes

Use the `soustack test` command in CI to validate all `*.soustack.json` files in your repository. The CLI exits non-zero when any file fails and reports each failing path along with schema or conformance errors.

## Steps

1. Install dependencies (Node.js 18+):
   ```bash
   npm ci
   ```
2. Validate every Soustack artifact in the repo (globbed by default):
   ```bash
   npx soustack test --strict --json
   ```
   * `--strict` fails on warnings.
   * `--json` keeps the output machine-readable while still listing the files and reasons they failed.
3. (Optional) Re-run validation against a fixtures directory:
   ```bash
   npx soustack validate "spec/fixtures/**/*.soustack.json" --strict --json
   ```

## Minimal GitHub Actions workflow

```yaml
name: Soustack validation

on:
  pull_request:
  push:

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm ci
      - name: Validate Soustack recipes
        run: npx soustack test --strict --json
      - name: Validate fixtures (optional)
        if: env.RUN_FIXTURES == 'true'
        run: npx soustack validate "spec/fixtures/**/*.soustack.json" --strict --json
```
