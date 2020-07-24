package main_test

import (
	"os/exec"
	"syscall"

	. "github.com/onsi/ginkgo"
	. "github.com/onsi/gomega"
	"github.com/onsi/gomega/gexec"
)

const (
	serverURL = "http://localhost:8080"
)

var _ = Describe("Server", func() {
	var (
		err          error
		pathToServer string
		session      *gexec.Session
	)

	BeforeSuite(func() {
		pkg := "github.com/tlwr/www.tobys.cloud/sites/www.toby.codes"

		pathToServer, err = gexec.Build(pkg)

		Expect(err).NotTo(HaveOccurred())
		Expect(pathToServer).NotTo(Equal(""))
	})

	AfterSuite(func() {
		gexec.CleanupBuildArtifacts()
	})

	BeforeEach(func() {
		command := exec.Command(pathToServer)
		session, err = gexec.Start(command, GinkgoWriter, GinkgoWriter)
		Expect(err).NotTo(HaveOccurred())

		Eventually(IsHealthy).Should(Equal(true))
	})

	AfterEach(func() {
		session.Signal(syscall.SIGTERM)
		Eventually(session).Should(gexec.Exit(0))
	})

	Describe("/", func() {
		It("should contain a toby.codes header", func() {
			err, code, body := GetPage("/")
			Expect(err).NotTo(HaveOccurred())
			Expect(code).To(Equal(200))
			Expect(body).To(ContainSubstring(`<h1>toby.codes</h1>`))
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

	Describe("/metrics", func() {
		It("should return some metrics", func() {
			err, code, body := GetPage("/metrics")
			Expect(err).NotTo(HaveOccurred())
			Expect(code).To(Equal(200))
			Expect(body).To(ContainSubstring(`negroni_requests_total`))
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
				err, code, body := GetPage("/posts/FOSDEM-2020")
				Expect(err).NotTo(HaveOccurred())
				Expect(code).To(Equal(200))
				Expect(body).To(ContainSubstring(`Eurostar`))
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
