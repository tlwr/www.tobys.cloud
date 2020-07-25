package main_test

import (
	"io/ioutil"
	"net/http"

	. "github.com/onsi/ginkgo"
)

func IsHealthy() bool {
	resp, err := http.Get(serverURL)

	if err != nil {
		return false
	}

	return resp.StatusCode == http.StatusOK
}

func GetPage(path string) (error, int, string) {
	By("Making request to " + serverURL + path)
	resp, err := http.Get(serverURL + path)

	if err != nil {
		return err, 0, ""
	}

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return err, 0, ""
	}
	resp.Body.Close()

	By("Received response from " + serverURL + path + " of " + resp.Status)
	return nil, resp.StatusCode, string(body)
}
