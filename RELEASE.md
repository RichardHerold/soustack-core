# Release Checklist

## Verify before publishing

- [ ] Update `package.json` version and the `[Unreleased]` section of `Changelog.md`.
- [ ] Run CI equivalence locally:
  - [ ] `npm run verify:sync`
  - [ ] `npm run verify:schema`
  - [ ] `npm run validate:version`
  - [ ] `npm test`
- [ ] Build artifacts and inspect the tarball: `npm pack --dry-run` (ensure spec and schema assets are present and there are no legacy profile leftovers).

## Publish steps

- [ ] `npm publish --access public` (runs `prepublishOnly` hooks: spec sync, schema verification, build, tests).
- [ ] Tag the release: `git tag vX.Y.Z && git push --tags`.
- [ ] Create/update the GitHub release notes referencing the matching `Changelog.md` entry.
