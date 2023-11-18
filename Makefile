GO_TEST = go test -v -count=1 ./...
GO_LINT = go vet ./... && golangci-lint run ./...

sites = assets.tobys.cloud \
				page-404 \
				stats.tobys.cloud \
				www.toby.codes

test: $(addprefix test-, ${sites})
deps: $(addprefix deps-, ${sites})
build: $(addprefix build-, ${sites})
push: $(addprefix push-, ${sites})

test-%:
	cd sites/$* && ${GO_TEST} && ${GO_LINT}

deps-%:
	cd sites/$* && go mod tidy

build-%:
	cd sites/$* && podman build . --arch=amd64 -t=ghcr.io/tlwr/$*:$$(git rev-parse HEAD)

push-%: build-%
	podman push ghcr.io/tlwr/$*:$$(git rev-parse HEAD) --creds=tlwr:$${GHCR_API_KEY}

acceptance-tests:
	cd acceptance && bundle exec rspec

build-acceptance-tests:
	cd acceptance && podman build . --arch=amd64 -t=ghcr.io/tlwr/www-tobys-cloud-acceptance:$$(git rev-parse HEAD)

push-acceptance-tests: build-acceptance-tests
	podman push ghcr.io/tlwr/www-tobys-cloud-acceptance:$$(git rev-parse HEAD) --creds=tlwr:$${GHCR_API_KEY}
