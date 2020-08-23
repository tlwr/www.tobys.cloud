package main

import (
	"context"
	"fmt"
	html "html/template"
	"io/ioutil"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"

	"github.com/gomarkdown/markdown"
	nlogrus "github.com/meatballhat/negroni-logrus"
	"github.com/phyber/negroni-gzip/gzip"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/sethvargo/go-signalcontext"
	"github.com/sirupsen/logrus"
	"github.com/unrolled/render"
	nsecure "github.com/unrolled/secure"
	"github.com/urfave/negroni"
	nprom "github.com/zbindenren/negroni-prometheus"
)

func main() {
	renderer := render.New(render.Options{
		Directory: "templates",
		Layout:    "layout",
	})

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, req *http.Request) {
		fmt.Fprintf(w, "healthy")
	})

	mux.HandleFunc("/posts", func(w http.ResponseWriter, req *http.Request) {
		files, err := filepath.Glob("posts/*.md")
		if err != nil {
			renderer.HTML(w, http.StatusInternalServerError, "500", nil)
			return
		}

		posts := [][]string{}

		for _, file := range files {
			filename := strings.ReplaceAll(file, "posts/", "")
			slug := strings.ReplaceAll(filename, ".md", "")
			title := strings.ReplaceAll(slug, "-", " ")
			posts = append(posts, []string{slug, title})
		}

		renderer.HTML(w, http.StatusOK, "posts", posts)
	})

	mux.HandleFunc("/posts/", func(w http.ResponseWriter, req *http.Request) {
		pathRx := regexp.MustCompile("^/posts/(?P<post>[-_a-zA-Z0-9]+)$")

		if !pathRx.MatchString(req.URL.Path) {
			renderer.HTML(w, http.StatusNotFound, "404", nil)
			return
		}

		matches := pathRx.FindAllStringSubmatch(req.URL.Path, -1)
		post := matches[0][1]

		path := "posts/" + post + ".md"

		if _, err := os.Stat(path); err != nil {
			renderer.HTML(w, http.StatusNotFound, "404", nil)
			return
		}

		contents, err := ioutil.ReadFile(path)
		if err != nil {
			renderer.HTML(w, http.StatusInternalServerError, "500", nil)
			return
		}

		rendered := html.HTML(markdown.ToHTML(contents, nil, nil))
		renderer.HTML(w, http.StatusOK, "post", rendered)
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		if req.URL.Path != "" && req.URL.Path != "/" {
			renderer.HTML(w, http.StatusNotFound, "404", nil)
			return
		}

		renderer.HTML(w, http.StatusOK, "index", nil)
	})

	mux.Handle("/metrics", promhttp.Handler())

	level := logrus.InfoLevel

	n := negroni.New()
	n.Use(negroni.NewRecovery())
	n.Use(nlogrus.NewCustomMiddleware(level, &logrus.JSONFormatter{}, "web"))
	n.Use(gzip.Gzip(gzip.DefaultCompression))
	n.Use(negroni.HandlerFunc(nsecure.New().HandlerFuncWithNext))
	n.Use(nprom.NewMiddleware("www.toby.codes"))
	n.Use(negroni.NewStatic(http.Dir("public")))
	n.UseHandler(mux)

	ctx, cancel := signalcontext.On(syscall.SIGTERM)
	defer cancel()

	server := &http.Server{Addr: ":8080", Handler: n}

	go func() {
		server.ListenAndServe()
	}()

	<-ctx.Done()

	ctx, cancel = context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	server.Shutdown(ctx)
	os.Exit(0)
}
