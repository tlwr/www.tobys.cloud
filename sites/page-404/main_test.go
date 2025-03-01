package main_test

import (
	"os"
	"os/exec"
	"path"
	"syscall"
	"testing"

	. "github.com/onsi/ginkgo/v2"
	. "github.com/onsi/gomega"
	"github.com/onsi/gomega/gexec"
)

func TestSuite(t *testing.T) {
	RegisterFailHandler(Fail)
	RunSpecs(t, "www.toby.codes")
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
	)

	BeforeAll(func() {
		customServerURL := os.Getenv("SERVER_URL")
		if customServerURL != "" {
			serverURL = customServerURL
		} else {
			serverURL = defaultServerURL

			pathToServer = path.Join(os.Getenv("PWD"), "page-404")
		}

		By("Using server URL: " + serverURL)
	})

	AfterAll(func() {
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

	Describe("/", func() {
		It("should contain a 404 message", func() {
			err, code, body := GetPage("/")
			Expect(err).NotTo(HaveOccurred())
			Expect(code).To(Equal(404))
			Expect(body).To(ContainSubstring(`404 Not Found`))
		})
	})

	Describe("/health", func() {
		It("should say it is healthy", func() {
			err, code, body := GetPage("/health")
			Expect(err).NotTo(HaveOccurred())
			Expect(code).To(Equal(200))
			Expect(body).To(ContainSubstring(`healthy`))
		})
	})
})
