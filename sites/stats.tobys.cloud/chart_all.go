package main

import (
	promapi "github.com/prometheus/client_golang/api/prometheus/v1"
)

func chartAll(api promapi.API) ([]Stat, error) {
	stats := make([]Stat, 0)

	weathers, err := chartWeathers(api)
	if err != nil {
		return stats, err
	}

	stats = append(stats, weathers...)

	petitions, err := chartPetitions(api)
	if err != nil {
		return stats, err
	}

	stats = append(stats, petitions...)

	return stats, nil
}
