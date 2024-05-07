package main

import (
	"context"
	"fmt"
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
)

func main() {
	renderer := render.New(render.Options{
		Directory: "templates",
		Layout:    "layout",
	})

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, req *http.Request) {
		fmt.Fprintf(w, "healthy")
	})

	mux.HandleFunc("POST /naaipatronen/kinderrokje", func(w http.ResponseWriter, req *http.Request) {
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

		binnenradius := heupomvang / (math.Pi * 2)
		buitenradius := binnenradius + lengte

		minX := int(math.Ceil(-1 * (buitenradius + 5)))
		minY := int(math.Ceil(-1 * (buitenradius + 5)))
		svgWidth := int(math.Ceil((buitenradius + 5) * 2))
		svgHeight := svgWidth

		w.Write([]byte(fmt.Sprintf(`
<svg viewBox="%d %d %d %d" style="width: 100%%; height: auto; max-height: 50vh">
foo / bar
  <circle cx="0" cy="0" r="0.1" stroke="var(--dark)" fill-opacity="0" stroke-width="0.25"/>
  <circle cx="0" cy="0" r="%.1f" stroke="var(--dark)" fill-opacity="0" stroke-width="0.25"/>
  <circle cx="0" cy="0" r="%.1f" stroke="var(--dark)" fill-opacity="0" stroke-width="0.25"/>

  <line
    x1="0" y1="0"
    x2="%.1f" y2="0"
    stroke="var(--dark)" stroke-width="0.3" stroke-dasharray="1"
  />
	<text x="%.1f" y="0" font-size="4">%.1f cm</text>

  <line
    x1="0" y1="%.1f"
    x2="0" y2="%.1f"
    stroke="var(--dark)" stroke-width="0.3" stroke-dasharray="2"
  />
	<text x="2" y="%.1f" font-size="4">%.1f cm</text>
</svg>
`,
			minX, minY, svgWidth, svgHeight, /* viewbox */
			binnenradius, buitenradius, /* binnencircel ; buitencircel */

			binnenradius,                 /* korte lijn */
			binnenradius+2, binnenradius, /* korte lijn tekst */

			binnenradius, buitenradius, /* lange lijn */
			buitenradius/2, lengte, /* lange lijn tekst */
		)))
	})

	mux.HandleFunc("GET /naaipatronen", func(w http.ResponseWriter, req *http.Request) {
		_ = renderer.HTML(w, http.StatusOK, "naaipatronen", nil)
	})

	mux.HandleFunc("GET /", func(w http.ResponseWriter, req *http.Request) {
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
