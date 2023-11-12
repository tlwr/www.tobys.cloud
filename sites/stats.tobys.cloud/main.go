package main

import (
	"context"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	nlogrus "github.com/meatballhat/negroni-logrus"
	"github.com/phyber/negroni-gzip/gzip"
	prom "github.com/prometheus/client_golang/api"
	promapi "github.com/prometheus/client_golang/api/prometheus/v1"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/sirupsen/logrus"
	"github.com/unrolled/render"
	nsecure "github.com/unrolled/secure"
	"github.com/urfave/negroni"
	nprom "github.com/zbindenren/negroni-prometheus"
)

func main() {
	logger := logrus.New()
	logger.SetFormatter(&logrus.JSONFormatter{})
	logger.SetOutput(os.Stdout)
	logger.SetLevel(logrus.InfoLevel)

	promURL := flag.String("prometheus-url", "http://localhost:9090", "Promtheus URL")
	promBasicAuth := flag.String("prometheus-basic-auth", "", "Optional basic auth used for prometheus")
	promReadPath := flag.String("prometheus-read-path", "", "Optional path to modify URL for reading data")
	flag.Parse()

	if promURL == nil || *promURL == "" {
		logger.Fatal("-prometheus-url flag is required")
	}

	httpc := NewHTTPClient()
	promConfig := prom.Config{
		Address: *promURL,
		RoundTripper: &promRoundTripper{
			client:    httpc,
			basicAuth: *promBasicAuth,
			path:      *promReadPath,
		},
	}

	promClient, err := prom.NewClient(promConfig)
	if err != nil {
		logger.Fatalf("Could not create Prometheus API client: %s", err)
	}
	promAPI := promapi.NewAPI(promClient)

	updatedAt := time.Now()
	stats := []Stat{}
	statsMu := sync.RWMutex{}

	go func() {
		for {
			logger.Info("get-stats")
			latestStats, err := chartAll(promAPI)
			if err != nil {
				logger.Errorf("Could not query Prometheus: %s", err)
				time.Sleep(30 * time.Second)
				continue
			}
			logger.Info("got-stats")

			statsMu.Lock()
			stats = latestStats
			updatedAt = time.Now()
			statsMu.Unlock()

			time.Sleep(3 * time.Minute)
		}
	}()

	renderer := render.New(render.Options{
		Directory: "templates",
	})

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, req *http.Request) {
		fmt.Fprintf(w, "healthy")
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		statsMu.RLock()
		defer statsMu.RUnlock()

		_ = renderer.HTML(
			w, http.StatusOK,
			"stats",
			StatPage{
				SecondsAgo: int64(time.Since(updatedAt).Seconds()),
				Stats:      stats,
			},
		)
	})

	mux.Handle("/metrics", promhttp.Handler())

	level := logrus.InfoLevel

	n := negroni.New()
	n.Use(negroni.NewRecovery())
	n.Use(nlogrus.NewCustomMiddleware(level, &logrus.JSONFormatter{}, "web"))
	n.Use(gzip.Gzip(gzip.DefaultCompression))
	n.Use(negroni.HandlerFunc(nsecure.New().HandlerFuncWithNext))
	n.Use(nprom.NewMiddleware("stats.tobys.cloud"))
	n.UseHandler(mux)

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM)
	defer cancel()

	server := &http.Server{Addr: ":8080", Handler: n}

	go func() {
		logger.Info("listening")
		_ = server.ListenAndServe()
	}()

	<-ctx.Done()

	ctx, cancel = context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
	os.Exit(0)
}
