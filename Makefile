acceptance-tests:
	cd acceptance && bundle exec rspec

# Periodic batch on thinkcentre (see nomad/acceptance-tests.hcl).
#   nomad var put nomad/jobs/acceptance-tests webhook_url='https://discord.com/api/webhooks/...'
#   nomad job run nomad/acceptance-tests.hcl

IMAGE := ghcr.io/tlwr/www-tobys-cloud-acceptance
SHA := $(shell git rev-parse HEAD)

build-acceptance-tests:
	cd acceptance && podman build . --arch=amd64 \
		-t=$(IMAGE):$(SHA) \
		-t=$(IMAGE):latest

push-acceptance-tests: build-acceptance-tests
	podman push $(IMAGE):$(SHA)
	podman push $(IMAGE):latest
