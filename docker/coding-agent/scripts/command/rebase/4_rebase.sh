#!/bin/bash
cd /home/coding-agent/workspace

BRANCH="${BRANCH:-main}"

git fetch origin

if git rebase "origin/${BRANCH}"; then
    echo "Rebase completed cleanly."
    git push --force-with-lease origin HEAD
else
    echo "Rebase has conflicts — invoking agent for resolution."
    export PROMPT="The rebase of the current branch onto origin/${BRANCH} has conflicts. Run 'git status' to see conflicting files. For each conflicting file: read the entire file, understand both sides of the conflict, resolve it correctly, then 'git add' the file. After all conflicts are resolved, run 'git rebase --continue'. If rebase pauses again with new conflicts, repeat. After rebase completes, run 'git push --force-with-lease origin HEAD'."
    source /scripts/agents/${AGENT}/run.sh
fi
