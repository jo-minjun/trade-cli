---
name: changelog
description: >
  Update CHANGELOG.md [Unreleased] section by analyzing git diff and log.
  Categorize changes into Added/Changed/Deprecated/Removed/Fixed/Security
  following Keep a Changelog format. Trigger when: (1) user says "/changelog",
  "changelog 갱신", "changelog 업데이트", (2) after committing or pushing code
  via hook, or (3) user asks to update the changelog.
---

# Changelog Updater

Analyze git changes and update `CHANGELOG.md` `[Unreleased]` section.

## Workflow

### 1. Determine diff range

Find the last release tag as the base:
```
git describe --tags --abbrev=0 2>/dev/null
```
If no tag exists, use the initial commit as the base.

### 2. Analyze changes

Read the diff and commit messages:
```
git log <base>..HEAD --format="- %s (%h)" --no-merges
git diff <base>..HEAD
```

Categorize each change:
- **Added**: New features, commands, options, files (`feat:`)
- **Changed**: Behavior modifications, API changes (`refactor:` if user-facing)
- **Deprecated**: Soon-to-be-removed features
- **Removed**: Removed features or files
- **Fixed**: Bug fixes (`fix:`)
- **Security**: Vulnerability fixes

Skip `docs:`, `test:`, `chore:` commits unless they affect user-facing behavior. When ambiguous, inspect the actual diff.

### 3. Draft entries

- Start with a noun or feature name
- Focus on what changed for the user, not implementation details
- Use backticks for code identifiers
- One bullet per logical change (merge related commits)
- English only (per project CLAUDE.md)

### 4. Merge with existing CHANGELOG.md

Read `CHANGELOG.md`, locate `## [Unreleased]`, then:

1. Merge new entries with existing ones — no duplicates
2. Preserve existing entries not covered by new changes
3. Omit empty category headers
4. Maintain order: Added, Changed, Deprecated, Removed, Fixed, Security

### 5. Apply and summarize

Use Edit tool to update only the `[Unreleased]` section. Display a brief summary of changes.
