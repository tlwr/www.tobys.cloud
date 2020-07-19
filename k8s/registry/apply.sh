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

  registry_pw="$(head -c 256 < /dev/urandom | sha256sum  | awk '{print $1}')"
  registry_htpasswd="$(docker run \
    --entrypoint htpasswd \
    --rm registry:2.7.0 -Bbn admin "$registry_pw")"

  kubectl -n $ns create secret generic $name \
    --from-literal="HTPASSWD=${registry_htpasswd}" \
    --from-literal="HTPASSWD_PLAIN=${registry_pw}"
fi

htpasswd="$(kubectl \
  -n $ns get secret "$name" \
  -o jsonpath={.data.HTPASSWD} | base64 --decode)"

kubectl apply \
  --namespace "$ns" \
  -f "$wd/02-ingress.yaml"

if ! helm list -A | grep -q "$name" ; then
  helm install "$name" \
    stable/docker-registry \
    -f values.yaml \
    --namespace "$ns" \
    --version "$version" \
    --set "secrets.htpasswd=${htpasswd}"
else
  helm upgrade "$name" \
    stable/docker-registry \
    -f values.yaml \
    --namespace "$ns" \
    --version "$version" \
    --set "secrets.htpasswd=${htpasswd}"
fi

kubectl rollout  restart --namespace "$ns" deployment "$name-docker-registry"
