package main

import (
	"context"
	"embed"
	"fmt"
	html "html/template"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strings"
	"syscall"
	"time"

	"github.com/gomarkdown/markdown"
	nlogrus "github.com/meatballhat/negroni-logrus"
	"github.com/phyber/negroni-gzip/gzip"
	"github.com/sirupsen/logrus"
	"github.com/unrolled/render"
	nsecure "github.com/unrolled/secure"
	"github.com/urfave/negroni"
)

var (
	pathRx = regexp.MustCompile("^/posts/(?P<post>[-_a-zA-Z0-9]+)$")
	dateRx = regexp.MustCompile("^(2[0-9]{3}-[0-1][0-9])-(.*)")

	//go:embed posts/*
	postsFS embed.FS

	//go:embed public/**/*
	publicFS embed.FS

	//go:embed templates/*
	templatesFS embed.FS
)

var publicSubFS, _ = fs.Sub(publicFS, "public")
var templatesSubFS, _ = fs.Sub(templatesFS, "templates")

func main() {
	renderer := render.New(render.Options{
		Directory:  "templates",
		FileSystem: render.FS(templatesFS),
		Layout:     "layout",
	})

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, req *http.Request) {
		fmt.Fprintf(w, "healthy")
	})

	mux.HandleFunc("/robots.txt", func(w http.ResponseWriter, req *http.Request) {
		fmt.Fprintf(w, "User-agent: *\nAllow: /\n")
	})

	mux.HandleFunc("/posts", func(w http.ResponseWriter, req *http.Request) {
		files, err := fs.Glob(postsFS, "posts/*.md")
		if err != nil {
			_ = renderer.HTML(w, http.StatusInternalServerError, "500", nil)
			return
		}

		datedPosts := [][]string{}
		ongoingPosts := [][]string{}

		for _, file := range files {
			filename := strings.ReplaceAll(file, "posts/", "")
			slug := strings.ReplaceAll(filename, ".md", "")

			matches := dateRx.FindStringSubmatch(slug)
			if len(matches) == 0 {
				title := strings.ReplaceAll(slug, "-", " ")
				ongoingPosts = append(ongoingPosts, []string{slug, title})
			} else {
				date := matches[1]
				title := strings.ReplaceAll(matches[2], "-", " ")

				datedPosts = append(datedPosts, []string{slug, title, date})
			}
		}

		for i := 0; i < len(datedPosts)/2; i++ {
			t := datedPosts[i]
			datedPosts[i] = datedPosts[len(datedPosts)-i-1]
			datedPosts[len(datedPosts)-i-1] = t
		}

		_ = renderer.HTML(w, http.StatusOK, "posts", map[string]interface{}{"ongoing": ongoingPosts, "dated": datedPosts})
	})

	mux.HandleFunc("/posts/", func(w http.ResponseWriter, req *http.Request) {
		if !pathRx.MatchString(req.URL.Path) {
			_ = renderer.HTML(w, http.StatusNotFound, "404", nil)
			return
		}

		matches := pathRx.FindAllStringSubmatch(req.URL.Path, -1)
		post := matches[0][1]

		path := "posts/" + post + ".md"

		contents, err := postsFS.ReadFile(path)
		if err != nil {
			_ = renderer.HTML(w, http.StatusNotFound, "404", nil)
			return
		}

		rendered := html.HTML(markdown.ToHTML(contents, nil, nil))
		_ = renderer.HTML(w, http.StatusOK, "post", rendered)
	})

	mux.HandleFunc("/work", func(w http.ResponseWriter, req *http.Request) {
		_ = renderer.HTML(w, http.StatusOK, "work", nil)
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		if req.URL.Path != "" && req.URL.Path != "/" {
			_ = renderer.HTML(w, http.StatusNotFound, "404", nil)
			return
		}

		_ = renderer.HTML(w, http.StatusOK, "index", nil)
	})

	level := logrus.InfoLevel

	n := negroni.New()
	n.Use(negroni.NewRecovery())
	n.Use(nlogrus.NewCustomMiddleware(level, &logrus.JSONFormatter{}, "web"))
	n.Use(gzip.Gzip(gzip.DefaultCompression))
	n.Use(negroni.HandlerFunc(nsecure.New().HandlerFuncWithNext))
	n.Use(negroni.NewStatic(http.FS(publicSubFS)))
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
