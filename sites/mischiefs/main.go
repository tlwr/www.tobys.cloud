package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"math"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	nlogrus "github.com/meatballhat/negroni-logrus"
	"github.com/phyber/negroni-gzip/gzip"
	"github.com/sirupsen/logrus"
	"github.com/unrolled/render"
	nsecure "github.com/unrolled/secure"
	"github.com/urfave/negroni"

	svgo "github.com/ajstarks/svgo"
)

//go:embed public
var publicFS embed.FS
var publicSubFS, _ = fs.Sub(publicFS, "public")

//go:embed templates/*
var templatesFS embed.FS
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

	mux.HandleFunc("/naaipatronen/kinderrokje", func(w http.ResponseWriter, req *http.Request) {
		lengte, err := strconv.ParseFloat(req.FormValue("lengte"), 64)
		if err != nil {
			_ = renderer.HTML(w, http.StatusBadRequest, "400", nil)
			return
		}

		heupomvang, err := strconv.ParseFloat(req.FormValue("heupomvang"), 64)
		if err != nil {
			_ = renderer.HTML(w, http.StatusBadRequest, "400", nil)
			return
		}

		mmLengte := int(math.Ceil(lengte * 10))
		binnenradius := int(math.Ceil((10 * heupomvang) / (math.Pi * 2)))
		buitenradius := binnenradius + mmLengte

		minX := -1 * (buitenradius + 5)
		minY := -1 * (buitenradius + 5)
		width := (buitenradius + 5) * 2
		height := width
		tekstmarge := 5
		tekstgrootte := 24
		tekstStijlen := fmt.Sprintf("font-size: %d", tekstgrootte)
		tekstStyle := fmt.Sprintf(`style="%s"`, tekstStijlen)

		s := svgo.New(w)
		s.Startpercent(
			100, 100,
			fmt.Sprintf(`viewBox="%d %d %d %d"`, minX, minY, width, height),
			`style="max-width: 550px"`,
		)
		// middenpunt
		s.Circle(0, 0, 1, "fill-opacity: 0; stroke-width: 2.5; stroke: var(--dark)")

		// binnenring
		s.Circle(0, 0, binnenradius, "fill-opacity: 0; stroke-width: 2.5; stroke: var(--dark)")
		s.Line(0, 0, binnenradius, 0, `style="stroke: var(--dark); stroke-width: 2.5; stroke-dasharray: 10"`)
		s.Text(binnenradius+tekstmarge, 0, fmt.Sprintf("%.1f cm", float64(binnenradius)/10), tekstStyle)
		// circumference
		s.Text(-binnenradius-tekstmarge, 0, fmt.Sprintf("%.1f cm", heupomvang), fmt.Sprintf(`style="text-anchor: end; %s"`, tekstStijlen))

		// buitenring
		s.Circle(0, 0, buitenradius, "fill-opacity: 0; stroke-width: 2.5; stroke: var(--dark)")
		s.Line(0, binnenradius, 0, buitenradius, `style="stroke: var(--dark); stroke-width: 2.5; stroke-dasharray: 10"`)
		s.Text(tekstmarge, int(math.Floor(float64(buitenradius)/2)), fmt.Sprintf("%.1f cm", lengte), tekstStyle)

		// buitenring + lengte
		s.Line(0, 0, 0, -(mmLengte + binnenradius), `style="stroke: var(--dark); stroke-width: 2.5; stroke-dasharray: 5"`)
		s.Text(tekstmarge, -int(math.Floor(float64(binnenradius+buitenradius)/2)), fmt.Sprintf("%.1f cm", (float64(binnenradius)/10)+lengte), tekstStyle)
	})

	mux.HandleFunc("/naaipatronen", func(w http.ResponseWriter, req *http.Request) {
		_ = renderer.HTML(w, http.StatusOK, "naaipatronen", nil)
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

	listenAddr := ":8080"
	if os.Getenv("USER") == "toby" {
		listenAddr = "localhost:8080"
	}
	server := &http.Server{Addr: listenAddr, Handler: n}

	go func() {
		_ = server.ListenAndServe()
	}()

	<-ctx.Done()

	ctx, cancel = context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
	os.Exit(0)
}
