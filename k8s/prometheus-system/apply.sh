#!/usr/bin/env bash
set -ueo pipefail

wd="$(cd "$(dirname $0)" ; pwd)"

name="$(operator-tools yaml find -p /name < "$wd/meta.yaml")"
ns="$(operator-tools yaml find -p /namespace < "$wd/meta.yaml")"
version="$(operator-tools yaml find -p /version < "$wd/meta.yaml")"

kubectl apply \
  --namespace "$ns" \
  -f "$wd/01-namespace.yaml"

if ! kubectl -n "$ns" get secret "$name"; then
  kubectl -n $ns delete secret $name || true

  grafana_admin_pw="$(head -c 256 < /dev/urandom | sha256sum  | awk '{print $1}')"

  kubectl -n $ns create secret generic $name \
    --from-literal="grafana-admin-password=${grafana_admin_pw}"
fi

grafana_admin_pw="$(kubectl \
  -n $ns get secret "$name" \
  -o jsonpath={.data.grafana-admin-password} | base64 --decode)"

if ! helm list -A | grep -q "$name" ; then
  helm install "$name" \
    stable/prometheus-operator \
    -f values.yaml \
    --namespace "$ns" \
    --version "$version" \
    --set "grafana.adminPassword=${grafana_admin_pw}"
else
  helm upgrade "$name" \
    stable/prometheus-operator \
    -f values.yaml \
    --namespace "$ns" \
    --version "$version" \
    --set "grafana.adminPassword=${grafana_admin_pw}"
fi
