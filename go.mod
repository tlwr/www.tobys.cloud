module github.com/tlwr/www.tobys.cloud

go 1.21.13

require (
	github.com/klauspost/compress v1.17.10
	github.com/meatballhat/negroni-logrus v1.1.1
	github.com/onsi/ginkgo/v2 v2.20.1
	github.com/onsi/gomega v1.34.1
	github.com/phyber/negroni-gzip v1.0.0
	github.com/prometheus/client_golang v1.20.4
	github.com/prometheus/common v0.60.0
	github.com/sirupsen/logrus v1.9.3
	github.com/unrolled/secure v1.16.0
	github.com/urfave/negroni v1.0.0
	github.com/zbindenren/negroni-prometheus v0.1.1
)

require (
	github.com/cespare/xxhash v1.1.0 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/go-logr/logr v1.4.2 // indirect
	github.com/go-task/slim-sprig/v3 v3.0.0 // indirect
	github.com/google/go-cmp v0.6.0 // indirect
	github.com/google/pprof v0.0.0-20240827171923-fa2c70bbbfe5 // indirect
	golang.org/x/exp v0.0.0-20240808152545-0cdaa3abc0fa // indirect
	golang.org/x/net v0.30.0 // indirect
	golang.org/x/sys v0.26.0 // indirect
	golang.org/x/text v0.19.0 // indirect
	golang.org/x/tools v0.26.0 // indirect
	google.golang.org/protobuf v1.34.2 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

replace golang.org/x/sys v0.24.0 => golang.org/x/sys v0.26.0
