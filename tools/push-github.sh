#!/usr/bin/env bash
# Puts the current master on GitHub (github.com/savvinovay/oyuur, branch main) as ONE new commit:
# the local history stays here, GitHub gets only snapshots. The author is GitHub's hidden address.
#   bash tools/push-github.sh "what is new"
# Changes made on GitHub (a merged Dependabot PR) would be undone by the next snapshot, so the script
# stops and prints how to bring them into master first.
set -euo pipefail
cd "$(dirname "$0")/.."
remote=https://github.com/savvinovay/oyuur.git
msg="${1:?usage: tools/push-github.sh \"message\"}"
parent=()
if git fetch -q "$remote" main 2>/dev/null; then
  parent=(-p FETCH_HEAD)
  last="$(git log -1 --format=%B FETCH_HEAD | sed -n 's/^master: //p')"
  if [ -z "$last" ] || [ "$(git rev-parse "$last^{tree}")" != "$(git rev-parse "FETCH_HEAD^{tree}")" ]; then
    echo "GitHub main has changes that are not in master. Bring them in first:"
    echo "  git fetch $remote main && git diff ${last:-<last pushed master>} FETCH_HEAD | git apply --index && git commit"
    exit 1
  fi
fi
export GIT_AUTHOR_NAME=savvinovay GIT_AUTHOR_EMAIL=114297859+savvinovay@users.noreply.github.com
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
commit="$(git commit-tree "master^{tree}" "${parent[@]}" -m "$msg" -m "master: $(git rev-parse master)")"
git push "$remote" "$commit:refs/heads/main"
echo "GitHub main = $commit (master $(git rev-parse --short master))"
