# GitHub Actions: Validate Soustack recipes

Use the `soustack test` command in CI to validate all `*.soustack.json` files in your repository.

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
      - run: npx soustack test --strict
```
