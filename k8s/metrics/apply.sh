#!/usr/bin/env bash
set -ueo pipefail

wd="$(cd "$(dirname $0)" ; pwd)"

ns="$(operator-tools yaml find -p /namespace < "$wd/meta.yaml")"

kubectl apply \
  --namespace "$ns" \
  -f "$wd/01-namespace.yaml"

kubectl apply \
  --namespace "$ns" \
  -f "$wd/02-petitions-exporter.yaml"

kubectl apply \
  --namespace "$ns" \
  -f "$wd/02-weather-exporter.yaml"

kubectl apply \
  --namespace prometheus-system \
  -f "$wd/03-service-monitors.yaml"

kubectl apply \
  --namespace "$ns" \
  -f "$wd/04-grafana.yaml"
