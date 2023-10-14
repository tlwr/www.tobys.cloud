package main

import (
	"encoding/base64"
	"net"
	"net/http"
	"time"
)

type promRoundTripper struct {
	basicAuth string
	path      string
	client    *http.Client
}

func (t *promRoundTripper) RoundTrip(r *http.Request) (*http.Response, error) {
	if len(t.basicAuth) > 0 {
		r.Header.Add("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(t.basicAuth)))
	}

	if len(t.path) > 0 {
		r.URL.Path = t.path + r.URL.Path
	}

	return t.client.Do(r)
}

func NewHTTPClient() *http.Client {
	c := &http.Client{
		Transport: &http.Transport{
			DialContext: (&net.Dialer{
				Timeout:   10 * time.Second,
				KeepAlive: 10 * time.Second,
			}).DialContext,
			TLSHandshakeTimeout: 10 * time.Second,

			ExpectContinueTimeout: 4 * time.Second,
			ResponseHeaderTimeout: 3 * time.Second,
		},

		Timeout: 1 * time.Minute,
	}

	return c
}
