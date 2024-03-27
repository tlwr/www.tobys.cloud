package main_test

import (
	"os"
	"os/exec"
	"syscall"
	"testing"
	"time"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"github.com/onsi/gomega/gexec"
	"github.com/onsi/gomega/ghttp"
)

func TestSuite(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "stats.toby.cloud")
}

var (
	serverURL        string
	defaultServerURL = "http://localhost:8080"
)

var _ = Describe("Server", Ordered, func() {
	var (
		err          error
		pathToServer string
		session      *gexec.Session

		prometheusServer *ghttp.Server
	)

	BeforeAll(func() {
		customServerURL := os.Getenv("SERVER_URL")
		if customServerURL != "" {
			serverURL = customServerURL
		} else {
			serverURL = defaultServerURL

			By("Compiling")
			pkg := "github.com/tlwr/www.tobys.cloud/sites/stats.tobys.cloud"
			pathToServer, err = gexec.Build(pkg)
			Expect(err).NotTo(HaveOccurred())
			Expect(pathToServer).NotTo(Equal(""))
		}

		By("Using server URL: " + serverURL)
		prometheusServer = ghttp.NewServer()
	})

	AfterAll(func() {
		gexec.CleanupBuildArtifacts()
		prometheusServer.Close()
	})

	BeforeEach(func() {
		if serverURL == defaultServerURL {
			prometheusServer.AppendHandlers(
				ghttp.RespondWith(200, top5PetitionsResponse),
				ghttp.RespondWith(200, top5PetitionsSeriesResponse),
			)

			By("Running server")

			command := exec.Command(pathToServer, "-prometheus-url", prometheusServer.URL())
			session, err = gexec.Start(command, GinkgoWriter, GinkgoWriter)
			Expect(err).NotTo(HaveOccurred())

			Eventually(IsHealthy).Should(Equal(true))
			By("Server is healthy")
		}
	})

	AfterEach(func() {
		if serverURL == defaultServerURL {
			By("Stopping server")
			session.Signal(syscall.SIGTERM)
			Eventually(session).Should(gexec.Exit(0))
			By("Server is stopped")
		}
	})

	Describe("/health", func() {
		It("should say it is healthy", func() {
			err, code, body := GetPage("/health")
			Expect(err).NotTo(HaveOccurred())
			Expect(code).To(Equal(200))
			Expect(body).To(ContainSubstring(`healthy`))
		})
	})

	Describe("/", func() {
		It("should display an example svg", func() {
			Eventually(func() string {
				err, code, body := GetPage("/")
				if err != nil {
					return ""
				}
				if code != 200 {
					return ""
				}
				return body
			}, 1*time.Minute, 1*time.Second).Should(SatisfyAll(
				ContainSubstring(`<svg`),
				ContainSubstring(`</svg>`),
			))
		})
	})
})
