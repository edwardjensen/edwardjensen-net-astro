#!/bin/sh
# Decides whether a v* tag may be released, and prints where it came from ("main" or the hotfix branch).
#
#   validate-release-tag.sh <tag> [<path a hotfix must not change>...]
#
# A release comes from one of two places:
#   - main: the tag's commit is reachable from origin/main. Any vX.Y.Z.
#   - a hotfix branch, hotfix/<what-it-fixes>-vX.Y.Z, cut from the tag it names. The tag must be the next patch of that
#     line (vX.Y.Z+1 or later, same X.Y), the branch's base tag must be the newest release (a hotfix patches what is
#     running, never an older line), the base tag must be an ancestor of the tag's commit, and nothing under the given
#     paths may differ from the base tag (this repository passes none).
# Anything else exits 1 with an ::error:: line. Expects the full history and tags (checkout with fetch-depth: 0).
set -eu

tag="$1"
shift

fail() { echo "::error::$*"; exit 1; }

printf '%s' "$tag" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$' || fail "Tag '${tag}' does not match the required format 'vX.Y.Z'"
sha=$(git rev-list -n 1 "$tag" 2>/dev/null) || fail "Could not find the commit for tag '${tag}'"

git fetch -q origin '+refs/heads/main:refs/remotes/origin/main' '+refs/heads/hotfix/*:refs/remotes/origin/hotfix/*'

if git merge-base --is-ancestor "$sha" origin/main; then
  echo "✓ ${tag} (${sha}) is on main"
  echo "source=main" >> "${GITHUB_OUTPUT:-/dev/null}"
  exit 0
fi

# Not on main: it has to be a patch tag on a hotfix branch.
latest=$(git tag -l 'v*' --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | grep -vx "$tag" | head -n 1)
line="${tag%.*}"
problems=""

for branch in $(git branch -r --contains "$sha" --format='%(refname:short)' | grep '^origin/hotfix/' || true); do
  base=$(printf '%s' "$branch" | sed -nE 's/.*-(v[0-9]+\.[0-9]+\.[0-9]+)$/\1/p')
  name="${branch#origin/}"
  if [ -z "$base" ]; then
    problems="${problems} ${name}: the name does not end in the version it patches (hotfix/<what-it-fixes>-vX.Y.Z)."
    continue
  fi
  if ! git rev-parse -q --verify "refs/tags/${base}" > /dev/null; then
    problems="${problems} ${name}: there is no tag ${base}."
    continue
  fi
  if [ "$base" != "$latest" ]; then
    problems="${problems} ${name}: ${base} is not the newest release (${latest}); a hotfix patches only the newest."
    continue
  fi
  if [ "${base%.*}" != "$line" ] || [ "${base##*.}" -ge "${tag##*.}" ]; then
    problems="${problems} ${name}: ${tag} is not a later patch of ${base}."
    continue
  fi
  if ! git merge-base --is-ancestor "$base" "$sha"; then
    problems="${problems} ${name}: ${tag} does not contain ${base}."
    continue
  fi
  if [ "$#" -gt 0 ] && [ -n "$(git diff --name-only "$base" "$sha" -- "$@")" ]; then
    problems="${problems} ${name}: it changes $* since ${base} ($(git diff --name-only "$base" "$sha" -- "$@" | tr '\n' ' ')). Release it from main instead."
    continue
  fi
  echo "✓ ${tag} (${sha}) is a patch of ${base} on ${name}"
  echo "source=${name}" >> "${GITHUB_OUTPUT:-/dev/null}"
  exit 0
done

[ -n "$problems" ] && fail "Tag '${tag}' is not on main, and no hotfix branch can release it:${problems}"
fail "Tag '${tag}' is not on main or on any hotfix/* branch. Release tags come from main, or from a hotfix branch (see CLAUDE.md, \"Hotfixes\")."
