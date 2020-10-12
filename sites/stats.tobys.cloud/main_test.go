package main_test

import (
	"os"
	"os/exec"
	"syscall"
	"testing"

	. "github.com/onsi/ginkgo"
	. "github.com/onsi/gomega"
	"github.com/onsi/gomega/gexec"
)

func TestSuite(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "stats.toby.cloud")
}

var (
	serverURL        string
	defaultServerURL = "http://localhost:8080"
)

var _ = Describe("Server", func() {
	var (
		err          error
		pathToServer string
		session      *gexec.Session
	)

	BeforeSuite(func() {

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
	})

	AfterSuite(func() {
		gexec.CleanupBuildArtifacts()
	})

	BeforeEach(func() {
		if serverURL == defaultServerURL {
			By("Running server")

			command := exec.Command(pathToServer)
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

	Describe("/metrics", func() {
		It("should return some metrics", func() {
			err, code, body := GetPage("/metrics")
			Expect(err).NotTo(HaveOccurred())
			Expect(code).To(Equal(200))
			Expect(body).To(ContainSubstring(`negroni_requests_total`))
		})
	})

	Describe("/", func() {
		It("should display an example svg", func() {
			err, code, body := GetPage("/")
			Expect(err).NotTo(HaveOccurred())
			Expect(code).To(Equal(200))

			Expect(body).To(ContainSubstring(`href="#stat"`))
			Expect(body).To(MatchRegexp(`<h2.*Stat</h2>`))
			Expect(body).To(MatchRegexp(`<p.*A stat</p>`))
			Expect(body).To(ContainSubstring(`<svg`))
			Expect(body).To(ContainSubstring(`</svg>`))
		})
	})
})
