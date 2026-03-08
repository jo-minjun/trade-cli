---
name: release
description: >
  Release workflow for trade-cli. Bump version in package.json, move CHANGELOG.md
  [Unreleased] entries to a new versioned section, create a release commit, git tag,
  push, and create a GitHub Release. Trigger when user says "release", "릴리스",
  "릴리즈", "release v0.2.0", "0.2.0으로 릴리스", or similar release requests.
---

# Release Workflow

## Version Resolution

Determine the next version using one of these methods (in priority order):

1. **User-specified**: If the user provides an explicit version (e.g., "release v0.2.0"), use it.
2. **Auto-detect from CHANGELOG.md**: Scan `[Unreleased]` entries:
   - Has `### Added` or `### Removed` or `### Changed` → **minor** bump
   - Has only `### Fixed` or `### Security` → **patch** bump
   - Has `BREAKING CHANGE` anywhere → **major** bump
   - Empty `[Unreleased]` → abort with message "No unreleased changes found."

Read the current version from `package.json` `version` field and apply the bump.

## Pre-flight Checks

Before proceeding, verify:

1. Working tree is clean (`git status --porcelain` returns empty)
2. On the `main` branch
3. `[Unreleased]` section in `CHANGELOG.md` has content
4. Confirm the resolved version with the user before proceeding

If any check fails, report the issue and stop.

## Release Steps

Execute these steps in order:

1. **Update CHANGELOG.md**: Replace `## [Unreleased]` with `## [X.Y.Z] - YYYY-MM-DD` and add a new empty `## [Unreleased]` section above it.

2. **Update package.json**: Set `"version": "X.Y.Z"`.

3. **Create release commit**:
   ```
   chore: release vX.Y.Z
   ```

4. **Create git tag**:
   ```
   git tag vX.Y.Z
   ```

5. **Push commit and tag**:
   ```
   git push && git push --tags
   ```

6. **Create GitHub Release**: Use `gh release create vX.Y.Z` with the changelog entries for this version as the release body.
   ```
   gh release create vX.Y.Z --title "vX.Y.Z" --notes "$(changelog content for this version)"
   ```
