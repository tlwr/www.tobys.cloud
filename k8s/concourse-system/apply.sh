#!/usr/bin/env bash
set -ueo pipefail

wd="$(cd "$(dirname $0)" ; pwd)"

name="$(operator-tools yaml find -p /name < "$wd/meta.yaml")"
ns="$(operator-tools yaml find -p /namespace < "$wd/meta.yaml")"
version="$(operator-tools yaml find -p /version < "$wd/meta.yaml")"

kubectl apply \
  --namespace "$ns" \
  -f "$wd/01-namespace.yaml"

if ! kubectl -n "$ns" get secret "$name-web"; then
  tmpdir="$(mktemp -d)"
  pushd $tmpdir

  echo "Enter github client id"
  read github_client_id
  echo "Enter github client secret"
  read github_client_secret

  docker run -v $PWD:/keys --rm -it concourse/concourse generate-key -t rsa -f /keys/session-signing-key
  docker run -v $PWD:/keys --rm -it concourse/concourse generate-key -t ssh -f /keys/worker-key
  docker run -v $PWD:/keys --rm -it concourse/concourse generate-key -t ssh -f /keys/host-key

  mkdir web worker

  mv host-key.pub worker/host-key-pub
  mv worker-key.pub worker/worker-key-pub
  mv worker-key worker/worker-key

  mv session-signing-key web/session-signing-key
  mv host-key web/host-key
  cp worker/worker-key-pub web/worker-key-pub
  printf "%s" "$github_client_id" > web/github-client-id
  printf "%s" "$github_client_secret" > web/github-client-secret

  kubectl -n $ns delete secret $name-worker || true
  kubectl -n $ns delete secret $name-web || true

  kubectl -n $ns create secret generic $name-worker --from-file=worker/
  kubectl -n $ns create secret generic $name-web --from-file=web/

  popd
  rm -r $tmpdir
fi

kubectl apply \
  --namespace "$ns" \
  -f "$wd/02-ingress.yaml"

if ! helm list -A | grep -q "$name" ; then
  helm install "$name" \
    concourse/concourse \
    -f values.yaml \
    --namespace "$ns" \
    --version "$version"
else
  helm upgrade "$name" \
    concourse/concourse \
    -f values.yaml \
    --namespace "$ns" \
    --version "$version"
fi

kubectl rollout  restart --namespace "$ns" deployment "$name-web"
kubectl rollout  restart --namespace "$ns" statefulset "$name-worker"
