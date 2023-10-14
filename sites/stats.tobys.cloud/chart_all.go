package main

import (
	promapi "github.com/prometheus/client_golang/api/prometheus/v1"
)

func chartAll(api promapi.API) ([]Stat, error) {
	stats := make([]Stat, 0)

	petitions, err := chartPetitions(api)
	if err != nil {
		return stats, err
	}

	stats = append(stats, petitions...)

	return stats, nil
}
