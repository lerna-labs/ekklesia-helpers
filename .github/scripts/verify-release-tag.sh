#!/usr/bin/env bash
# Verifies that a release tag is a signed annotated tag that GitHub verifies,
# points at a commit on main, and matches the package version in that commit.
# Usage: verify-release-tag.sh <tag>
# Environment: GITHUB_REPOSITORY (owner/name), GH_TOKEN.
set -euo pipefail

TAG="${1:?usage: verify-release-tag.sh <tag>}"
REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"

fail() {
  echo "::error::$1"
  exit 1
}

if ! ref=$(gh api "repos/$REPO/git/ref/tags/$TAG" --jq '.object.type + " " + .object.sha' 2>&1); then
  fail "Tag $TAG was not found in $REPO: $ref"
fi
type=${ref%% *}
object_sha=${ref##* }

if [ "$type" != "tag" ]; then
  fail "Tag $TAG is a lightweight tag (ref points at a $type); release tags must be annotated and signed."
fi

if ! tag_object=$(gh api "repos/$REPO/git/tags/$object_sha" --jq '[(.verification.verified | tostring), (.verification.reason // "unknown"), .object.type, .object.sha] | @tsv' 2>&1); then
  fail "Could not read tag object $object_sha for $TAG: $tag_object"
fi
IFS=$'\t' read -r verified reason target_type commit <<< "$tag_object"

if [ "$verified" != "true" ]; then
  fail "Tag $TAG signature is not verified by GitHub (reason: $reason)."
fi
if [ "$target_type" != "commit" ]; then
  fail "Tag $TAG points at a $target_type, not a commit; a tag of a tag is not accepted."
fi

expected="${GITHUB_SHA:-$commit}"
if [ "$commit" != "$expected" ]; then
  fail "Signed tag $TAG points at $commit, not the pushed commit $expected."
fi

if ! git cat-file -e "$commit^{commit}" 2>/dev/null; then
  fail "Tagged commit $commit for $TAG does not exist in the local checkout."
fi
if ! git merge-base --is-ancestor "$commit" origin/main; then
  fail "Tagged commit $commit for $TAG is not an ancestor of origin/main."
fi

if ! version=$(git show "$commit:package.json" | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).version' 2>&1); then
  fail "Could not read the version from package.json at $commit: $version"
fi
if [ "$TAG" != "v$version" ]; then
  fail "Tag $TAG does not match package.json version $version at $commit (expected v$version)."
fi

echo "Tag $TAG is a verified annotated tag on main at $commit, version $version."
