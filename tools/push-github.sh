#!/usr/bin/env bash
# Puts the current master on GitHub (github.com/savvinovay/oyuur, branch main) as ONE new commit:
# the local history stays here, GitHub gets only snapshots. The author is GitHub's hidden address.
#   bash tools/push-github.sh "what is new"
set -euo pipefail
cd "$(dirname "$0")/.."
remote=https://github.com/savvinovay/oyuur.git
msg="${1:?usage: tools/push-github.sh \"message\"}"
git fetch -q "$remote" main 2>/dev/null && parent=(-p FETCH_HEAD) || parent=()
export GIT_AUTHOR_NAME=savvinovay GIT_AUTHOR_EMAIL=114297859+savvinovay@users.noreply.github.com
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"
commit="$(git commit-tree "master^{tree}" "${parent[@]}" -m "$msg")"
git push "$remote" "$commit:refs/heads/main"
echo "GitHub main = $commit (master $(git rev-parse --short master))"
