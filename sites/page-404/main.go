package main

import (
	"context"
	_ "embed"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

//go:embed templates/404.tmpl
var site []byte

func main() {

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, req *http.Request) {
		fmt.Fprintf(w, "healthy")
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		w.WriteHeader(404)
		w.Write(site)
	})

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGTERM)
	defer cancel()

	server := &http.Server{Addr: ":8080", Handler: mux}

	go func() {
		_ = server.ListenAndServe()
	}()

	<-ctx.Done()

	ctx, cancel = context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
	os.Exit(0)
}
