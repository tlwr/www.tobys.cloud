package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	nlogrus "github.com/meatballhat/negroni-logrus"
	"github.com/phyber/negroni-gzip/gzip"
	"github.com/sirupsen/logrus"
	nsecure "github.com/unrolled/secure"
	"github.com/urfave/negroni"
)

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, req *http.Request) {
		fmt.Fprintf(w, "healthy")
	})

	level := logrus.InfoLevel

	n := negroni.New()
	n.Use(negroni.NewRecovery())
	n.Use(nlogrus.NewCustomMiddleware(level, &logrus.JSONFormatter{}, "web"))
	n.Use(gzip.Gzip(gzip.DefaultCompression))
	n.Use(negroni.HandlerFunc(nsecure.New().HandlerFuncWithNext))
	n.Use(negroni.NewStatic(http.Dir("public")))
	n.UseHandler(mux)

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM)
	defer cancel()

	server := &http.Server{Addr: ":8080", Handler: n}

	go func() {
		_ = server.ListenAndServe()
	}()

	<-ctx.Done()

	ctx, cancel = context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
	os.Exit(0)
}
