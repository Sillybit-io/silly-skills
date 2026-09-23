# Contributing

Contributions must follow the conventions described by the [skill-writer skill](skills/workflow/skill-writer/SKILL.md).

Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages. CI must pass before merge.

## Versioning and releases

Each skill carries an independent SemVer version in its frontmatter. Follow [skill-writer](skills/workflow/skill-writer/SKILL.md) for the exact bump rules: patch for wording-only fixes, minor for new capabilities, and major for workflow or output-contract changes.

A repository release is a git tag in the form `vX.Y.Z` plus a GitHub Release, cut when the changes land on the default branch. A corresponding [CHANGELOG.md](CHANGELOG.md) entry is required in the same pull request or commit that bumps any skill's version or adds or removes a skill.

[RELEASING.md](RELEASING.md) gives the steps for both jobs: bumping one skill, and cutting a repository release, either through the Release workflow or by hand.

By contributing to this repository, you grant Sillybit a perpetual, irrevocable, worldwide, royalty-free license to use, reproduce, modify, and publish your contribution as part of this project under the repository's license (CC BY-ND 4.0). You retain your own copyright in your contribution.
