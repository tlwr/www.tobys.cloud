set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

root := justfile_directory()
catalog := "node " + quote(root / "tools/catalog.mjs")

# Show available recipes (default)
default:
    @just --list

# Site catalog (names, paths, deps, CI scripts)
sites:
    @{{ catalog }} table

# npm ci for one or more sites (all sites if omitted)
install *sites:
    @just _each install {{ sites }}

# Install + catalog CI scripts (typecheck/test/lint/build)
ci *sites:
    @just _each ci {{ sites }}

# npm test if the site has it, otherwise typecheck
test *sites:
    @just _each test {{ sites }}

# wrangler deploy — requires site names (aliases: auth, toby, jvnl, utilityroom)
deploy *sites:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ -z "{{ sites }}" ]; then
      echo "usage: just deploy <site>..." >&2
      echo "       just deploy-all" >&2
      exit 1
    fi
    just _each deploy {{ sites }}

# Deploy every site in the catalog
deploy-all:
    @just _each deploy $({{ catalog }} list)

# CI for sites touched vs origin/main (or $BASE)
ci-affected:
    #!/usr/bin/env bash
    set -euo pipefail
    names="$({{ catalog }} affected "${BASE:-}")"
    if [ -z "$names" ]; then
      echo "nothing affected"
      exit 0
    fi
    just _each ci $names

# Deploy sites touched vs origin/main (or $BASE)
deploy-affected:
    #!/usr/bin/env bash
    set -euo pipefail
    names="$({{ catalog }} affected "${BASE:-}")"
    if [ -z "$names" ]; then
      echo "nothing affected"
      exit 0
    fi
    just _each deploy $names

# Acceptance tests (Ruby)
acceptance-tests:
    cd acceptance && bundle exec rspec

[private]
_each action *sites:
    #!/usr/bin/env bash
    set -euo pipefail
    names="$({{ catalog }} resolve {{ sites }})"
    if [ -z "$names" ]; then
      echo "no sites" >&2
      exit 1
    fi
    for name in $names; do
      echo "=== {{ action }} $name ==="
      just _one "{{ action }}" "$name"
    done

[private]
_one action name:
    #!/usr/bin/env bash
    set -euo pipefail
    cd "{{ root }}"
    dir="$({{ catalog }} path "{{ name }}")"
    install="$({{ catalog }} get "{{ name }}" install)"
    case "{{ action }}" in
      install)
        (cd "$dir" && $install)
        ;;
      ci)
        (cd "$dir" && $install)
        while IFS= read -r script; do
          [ -n "$script" ] || continue
          (cd "$dir" && npm run "$script")
        done < <({{ catalog }} ci-scripts "{{ name }}")
        ;;
      test)
        if {{ catalog }} ci-scripts "{{ name }}" | grep -qx test; then
          (cd "$dir" && npm test)
        else
          (cd "$dir" && npm run typecheck)
        fi
        ;;
      deploy)
        (cd "$dir" && npm run deploy)
        ;;
      *)
        echo "unknown action {{ action }}" >&2
        exit 1
        ;;
    esac
