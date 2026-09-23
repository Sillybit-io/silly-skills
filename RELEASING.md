# Releasing

This guide explains how to publish a change to silly-skills. Read it when you have changed a skill and want that change to reach the people who installed it.

Two scripts do the mechanical work. Neither one touches git. They edit a file, print what they did, and stop. Every commit, tag, and push stays yours to make.

## The two version levels

Versions move at two levels. Each skill carries its own `metadata.version` in its frontmatter and changes on its own schedule. The repository carries a SemVer version of its own, published as a git tag plus a GitHub Release and recorded in [CHANGELOG.md](CHANGELOG.md). The policy behind both — when a release happens, and when a changelog entry is required — is in [CONTRIBUTING.md](CONTRIBUTING.md#versioning-and-releases). The rules for choosing patch, minor, or major are in [skill-writer](skills/workflow/skill-writer/SKILL.md). Those two files are the source of truth. This guide does not repeat them. It tells you which commands to run once you have decided.

## Releasing a change to one skill

Every change to a skill needs a version bump and a changelog line in the same commit.

1. Decide whether the change is a patch, a minor, or a major. [skill-writer](skills/workflow/skill-writer/SKILL.md) has the rules.

2. Bump the version:

   ```bash
   bun run bump-skill <skill-name> <patch|minor|major>
   ```

   For example, `bun run bump-skill ai-review patch`.

   The script rewrites exactly one line: the `version:` line inside `metadata:` in that skill's `SKILL.md`. Nothing else in the file changes. It then prints the change and a changelog bullet to paste:

   ```text
   skills/review/ai-review/SKILL.md:6  ai-review  0.1.0 -> 0.1.1  (patch)

   Paste under [Unreleased] in CHANGELOG.md and fill in the description:

   - `ai-review` 0.1.1 — <describe the change>.
   ```

   The script exits 1 and changes nothing if the skill name does not exist, if the bump type is anything other than `patch`, `minor`, or `major`, or if the current version is not a plain `x.y.z`.

3. Paste the bullet into [CHANGELOG.md](CHANGELOG.md) under `## [Unreleased]`, below the `###` heading that fits the change: `Added`, `Changed`, `Fixed`, or `Removed`. Reuse that heading if it is already there. Add it if it is not.

4. Replace `<describe the change>` with a real description. Write what changed for someone who uses the skill, not which lines you edited.

5. Check your work:

   ```bash
   bun run validate
   bun test
   ```

6. Commit the skill and the changelog together.

That is the whole flow. A skill change does not need a repository release of its own.

## Cutting a repository release, automated

The [Release workflow](.github/workflows/release.yml) runs the same sequence as the by-hand steps below and ends in the identical result: a release commit, a tag, and a GitHub Release. It never starts on its own. The only trigger is the "Run workflow" button.

1. Open the repository's Actions tab on GitHub and select "Release" from the workflow list.

2. Click "Run workflow" and pick the default branch. The workflow refuses to run from any other branch.

3. Type the target version into the `version` field as plain `X.Y.Z`, for example `0.2.0`. The same rules apply as below: it must be higher than the newest version already in [CHANGELOG.md](CHANGELOG.md).

   Leave the field blank instead to have the workflow suggest the version for you. It reads the Conventional Commits since the newest `v*` tag and bumps that tag: a `!` after the type or a `BREAKING CHANGE:` footer gives a major bump, a `feat` gives a minor, a `fix` gives a patch, and anything else falls back to a patch and says so with a warning in the log. A version you type always wins over the suggestion. To read the suggested number before you release anything, leave the field blank and check `dry_run`.

4. To preview first, check `dry_run`. A dry run shows the `CHANGELOG.md` diff the release would make and uploads the release notes as a downloadable `release-notes-preview` artifact, kept for seven days. It touches no git state: no commit, no tag, no push, no release.

5. Run the workflow again with `dry_run` unchecked to release for real. It validates, runs the tests, moves `[Unreleased]` into a dated section, commits, tags, pushes, and creates the GitHub Release.

The by-hand path below still exists and is still needed. Use it to test the release scripts locally, or when Actions is unavailable.

## Cutting a repository release, by hand

Do this when the work on the default branch is ready to publish as a version. Choose `X.Y.Z` yourself. It must be higher than the newest version already in [CHANGELOG.md](CHANGELOG.md).

1. Move the unreleased notes into a dated section, and save those notes for the release body:

   ```bash
   bun run prepare-release 0.2.0 > "$TMPDIR/silly-skills-0.2.0.md"
   ```

   The script leaves `## [Unreleased]` in place but empty, ready for the next round of work, and moves everything that was under it into a new `## [0.2.0] - YYYY-MM-DD` section below it. Sections for versions already released are copied through untouched.

   The notes go to stdout, and nothing else does, which is why they redirect cleanly into a file. The one-line summary goes to stderr, so you still read it on your terminal:

   ```text
   CHANGELOG.md: moved [Unreleased] into '## [0.2.0] - 2026-09-24' (was 0.1.0)
   ```

   The script exits 1 and leaves the file byte-identical if `[Unreleased]` is empty, if the version is not a plain `x.y.z`, or if the version is not higher than the newest one already recorded.

2. Review the diff. Confirm the new section holds the right notes and that older sections are untouched:

   ```bash
   git diff CHANGELOG.md
   ```

3. Check your work:

   ```bash
   bun run validate
   bun test
   ```

4. Commit the release:

   ```bash
   git add CHANGELOG.md
   git commit -m "chore(release): v0.2.0"
   ```

5. Tag that commit:

   ```bash
   git tag -a v0.2.0 -m "silly-skills 0.2.0"
   ```

6. Push the branch, then push the tag. Never force-push:

   ```bash
   git push
   git push origin v0.2.0
   ```

7. Create the GitHub Release from the notes you saved in step 1:

   ```bash
   gh release create v0.2.0 --title "v0.2.0" --notes-file "$TMPDIR/silly-skills-0.2.0.md"
   ```

   `--notes-file -` reads the body from stdin instead, if you would rather pipe the notes in:

   ```bash
   gh release create v0.2.0 --title "v0.2.0" --notes-file - < "$TMPDIR/silly-skills-0.2.0.md"
   ```

8. Confirm the result. CI must be green on the default branch, and the CI, licence, and skill-count badges at the top of [README.md](README.md) must still resolve.

## If a release turns out to be wrong

Fix it forward. Ship a new patch version carrying the correction.

Never delete a published tag. Never move a tag onto a different commit. Never force-push over a tag or a branch. Never delete a published GitHub Release. Other people and other tools have already fetched them, so changing any of it in place breaks everyone who pinned that version.

Never edit a `CHANGELOG.md` section for a version that is already tagged and pushed. That section records what shipped. Describe the correction in the next version's entry instead.

## Scripts at a glance

The [Release workflow](.github/workflows/release.yml) wraps the same scripts listed here: it runs `bun run validate`, `bun test`, and `bun run prepare-release` for you.

| Script | What it does | Example |
| --- | --- | --- |
| `bun run validate` | Checks every skill against this repository's layout, frontmatter, footer, and content rules. | `bun run validate` |
| `bun test` | Runs the test suite for the scripts in `scripts/`. | `bun test` |
| `bun run bump-skill` | Bumps one skill's `metadata.version` and prints a changelog bullet to paste. | `bun run bump-skill ai-review patch` |
| `bun run prepare-release` | Moves `[Unreleased]` into a dated section and prints the release notes to stdout. | `bun run prepare-release 0.2.0` |
