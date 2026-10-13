#!/usr/bin/env bash
# Hosts Allure reports on GitHub Pages (gh-pages branch) and posts their links.
#
#   scripts/allure-pages.sh pull-history <slot>
#       gh-pages:<slot>/history.jsonl -> allure-history/history.jsonl (trends across runs)
#   scripts/allure-pages.sh publish <slot> <report-dir>
#       copies the report to <slot>/latest/ and <slot>/runs/<run>/, pushes, and prints the
#       links as a run annotation, in the job summary and as the step output `url`.
#
# <slot> is a project (chessorro, qastarting, spas) or self-test. gh-pages always holds a
# single commit, force-pushed with a lease, so old reports never pile up in git history;
# only the newest KEEP_RUNS runs per slot are kept. Needs `contents: write`.
set -euo pipefail

BRANCH=gh-pages
KEEP_RUNS=${KEEP_RUNS:-15}
command=${1:?usage: allure-pages.sh pull-history|publish <slot> [report-dir]}
slot=${2:?slot name required}
repo_root=$(git rev-parse --show-toplevel)

fetch_pages() {
  git fetch --quiet --depth 1 origin "$BRANCH" 2>/dev/null
}

# Sets PAGES_URL (with trailing slash) and PAGES_CONFIRMED=yes|no (no = Pages looks switched off).
resolve_pages_url() {
  PAGES_URL=${REPORT_BASE_URL:-}
  PAGES_CONFIRMED=yes
  if [ -z "$PAGES_URL" ] && [ -n "${GH_TOKEN:-}" ]; then
    # On error (e.g. 404 when Pages is off) gh prints the error body to stdout: only trust a URL.
    local answer
    if answer=$(gh api "repos/$GITHUB_REPOSITORY/pages" --jq .html_url 2>/dev/null) && [[ $answer == http* ]]; then
      PAGES_URL=$answer
    fi
  fi
  if [ -z "$PAGES_URL" ]; then
    local owner=${GITHUB_REPOSITORY%%/*} name=${GITHUB_REPOSITORY#*/}
    PAGES_URL="https://${owner,,}.github.io/$name/"
    PAGES_CONFIRMED=no
  fi
  PAGES_URL="${PAGES_URL%/}/"
}

case "$command" in
  pull-history)
    mkdir -p allure-history
    if fetch_pages && git cat-file -e "FETCH_HEAD:$slot/history.jsonl" 2>/dev/null; then
      git show "FETCH_HEAD:$slot/history.jsonl" > allure-history/history.jsonl
      echo "Restored $(wc -l < allure-history/history.jsonl) history entries for $slot"
    else
      echo "No history for $slot yet"
    fi
    ;;

  publish)
    report=$(cd "${3:?report directory required}" && pwd)
    run="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
    site="${RUNNER_TEMP:-/tmp}/gh-pages-site"
    index="${RUNNER_TEMP:-/tmp}/gh-pages-index"
    git_dir=$(git rev-parse --absolute-git-dir)
    export GIT_AUTHOR_NAME="github-actions[bot]" GIT_AUTHOR_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"
    export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"

    for attempt in 1 2 3 4 5; do
      rm -rf "$site" "$index"
      mkdir -p "$site"
      lease=""
      if fetch_pages; then
        lease=$(git rev-parse FETCH_HEAD)
        git archive FETCH_HEAD | tar -x -C "$site"
      fi

      mkdir -p "$site/$slot/runs"
      rm -rf "$site/$slot/latest" "$site/$slot/runs/$run"
      cp -R "$report" "$site/$slot/latest"
      cp -R "$report" "$site/$slot/runs/$run"
      if [ -f allure-history/history.jsonl ]; then cp allure-history/history.jsonl "$site/$slot/history.jsonl"; fi
      # Run ids grow over time: keep the newest KEEP_RUNS.
      ls -1 "$site/$slot/runs" | sort -t- -k1,1n -k2,2n | head -n "-$KEEP_RUNS" | while read -r old; do
        rm -rf "${site:?}/$slot/runs/$old"
      done
      node "$repo_root/scripts/report-index.mjs" "$site"
      cp "$repo_root/report-site/index.html" "$site/index.html"
      touch "$site/.nojekyll"

      tree=$(cd "$site" && GIT_DIR="$git_dir" GIT_WORK_TREE="$site" GIT_INDEX_FILE="$index" sh -c 'git add -A && git write-tree')
      commit=$(git commit-tree "$tree" -m "Allure report: $slot run $run")
      if git push --quiet --force-with-lease="refs/heads/$BRANCH:$lease" origin "$commit:refs/heads/$BRANCH"; then
        break
      fi
      if [ "$attempt" = 5 ]; then
        echo "::error title=Allure report not published::Could not push to $BRANCH after 5 attempts"
        exit 1
      fi
      echo "gh-pages changed while publishing, retrying ($attempt)"
      sleep $((attempt * 5))
    done

    resolve_pages_url
    base=$PAGES_URL
    run_url="$base$slot/runs/$run/"
    echo "::notice title=Allure report: $slot::$run_url"
    if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "url=$run_url" >> "$GITHUB_OUTPUT"; fi
    if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
      {
        echo "**Allure report:** $run_url"
        echo
        echo "Latest $slot report: ${base}${slot}/latest/ · All reports: $base"
      } >> "$GITHUB_STEP_SUMMARY"
    fi
    if [ "$PAGES_CONFIRMED" = no ]; then
      echo "::warning title=Turn on GitHub Pages to open the report link::Reports are pushed to the $BRANCH branch. Enable Pages once: Settings > Pages > Build and deployment > Source: Deploy from a branch > $BRANCH / (root)."
    fi
    ;;

  *)
    echo "Unknown command: $command" >&2
    exit 2
    ;;
esac
