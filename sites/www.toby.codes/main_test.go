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

			pathToServer = path.Join(os.Getenv("PWD"), "www-toby-codes")
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
		It("should contain a toby.codes header", func() {
			err, code, body := GetPage("/")
			Expect(err).NotTo(HaveOccurred())
			Expect(code).To(Equal(200))
			Expect(body).To(ContainSubstring(`Toby Lorne`))
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

	Describe("/robots.txt", func() {
		It("should return generic yes", func() {
			err, code, body := GetPage("/robots.txt")
			Expect(err).NotTo(HaveOccurred())
			Expect(code).To(Equal(200))
			Expect(body).To(ContainSubstring(`User-agent: *`))
			Expect(body).To(ContainSubstring(`Allow: /`))
		})
	})

	Describe("/work", func() {
		It("should return something", func() {
			err, code, body := GetPage("/work")
			Expect(err).NotTo(HaveOccurred())
			Expect(code).To(Equal(200))
			Expect(body).To(ContainSubstring(`Work with me`))
		})
	})

	Describe("/posts", func() {
		Context("when listing all posts", func() {
			It("should list posts", func() {
				err, code, body := GetPage("/posts")
				Expect(err).NotTo(HaveOccurred())
				Expect(code).To(Equal(200))
				Expect(body).To(ContainSubstring(`FOSDEM 2020`))
				Expect(body).NotTo(ContainSubstring(`FOSDEM-2020.md`))
			})
		})

		Context("when viewing a post", func() {
			It("should list posts", func() {
				err, code, body := GetPage("/posts/2020-02-FOSDEM-2020")
				Expect(err).NotTo(HaveOccurred())
				Expect(code).To(Equal(200))
				Expect(body).To(ContainSubstring(`Eurostar`))
			})

			It("should not contain a non-breaking space", func() {
				_, _, body := GetPage("/posts/FOSDEM-2020")
				Expect(body).NotTo(ContainSubstring(" ")) // this non-breaking char is caused by pressing alt + space on Mac OS
			})
		})

		Context("when viewing a post which does not exist", func() {
			It("should list posts", func() {
				err, code, body := GetPage("/posts/FOSDEM-1993")
				Expect(err).NotTo(HaveOccurred())
				Expect(code).To(Equal(404))
				Expect(body).To(ContainSubstring(`404`))
			})
		})
	})
})
