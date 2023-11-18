#!/usr/bin/env bash
set -ueo pipefail

wd="$(cd "$(dirname $0)" ; pwd)"

for y in $(find $wd -name '*.yaml' | sort); do
  kubectl apply -f $y -n sites
done
