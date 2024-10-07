acceptance-tests:
	cd acceptance && bundle exec rspec

build-acceptance-tests:
	cd acceptance && podman build . --arch=amd64 -t=ghcr.io/tlwr/www-tobys-cloud-acceptance:$$(git rev-parse HEAD)

push-acceptance-tests: build-acceptance-tests
	podman push ghcr.io/tlwr/www-tobys-cloud-acceptance:$$(git rev-parse HEAD)
