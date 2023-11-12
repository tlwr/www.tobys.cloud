GO_TEST = go test -v -count=1 ./...
GO_LINT = go vet ./... && golangci-lint run ./...

test:
	cd sites/assets.tobys.cloud && ${GO_TEST} && ${GO_LINT}
	cd sites/page-404 && ${GO_TEST} && ${GO_LINT}
	cd sites/stats.tobys.cloud && ${GO_TEST} && ${GO_LINT}
	cd sites/www.toby.codes && ${GO_TEST} && ${GO_LINT}

deps:
	for f in $$(find . -name go.mod); do echo $$f; (cd $$(dirname $$f) ; go mod tidy); done
