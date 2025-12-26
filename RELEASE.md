# Release Checklist

## Verify before publishing

- [ ] Update `package.json` version and the `[Unreleased]` section of `Changelog.md`.
- [ ] Run release preparation (syncs spec, verifies sync/schema, runs tests):
  - [ ] `npm run release:prep`
  - Note: This uses `SOUSTACK_SPEC_SOURCE=npm` to ensure deterministic spec sync from the npm package, preserving fixtures and preventing checksum drift.
- [ ] Run additional CI equivalence checks:
  - [ ] `npm run validate:version`
- [ ] Build artifacts and inspect the tarball: `npm pack --dry-run` (ensure spec and schema assets are present and there are no legacy profile leftovers).

## Publish steps

- [ ] `npm publish --access public` (runs `prepublishOnly` hooks: build and tests only).
  - Note: Spec sync and verification should be done before publish using `npm run release:prep` to avoid file collisions during npm packaging.
- [ ] Tag the release: `git tag vX.Y.Z && git push --tags`.
- [ ] Create/update the GitHub release notes referencing the matching `Changelog.md` entry.
