package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	promapi "github.com/prometheus/client_golang/api/prometheus/v1"
	prommodel "github.com/prometheus/common/model"
)

func chartPetitions(api promapi.API) ([]Stat, error) {
	promctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	r := promapi.Range{
		Start: time.Now().Add(-1 * 7 * 24 * time.Hour),
		End:   time.Now(),
		Step:  1 * time.Hour,
	}

	top15PetitionsQuery := `topk(15, delta(petitions_signatures[24h]))`
	result, warnings, err := api.Query(promctx, top15PetitionsQuery, time.Now())

	if err != nil {
		return nil, err
	}

	if len(warnings) > 0 {
		return nil, fmt.Errorf("Received some warnings: %s", warnings)
	}

	if result.Type() != prommodel.ValVector {
		t := result.Type().String()
		return nil, fmt.Errorf("Got a %s from Prometheus, not matrix", t)
	}
	resultVector := result.(prommodel.Vector)

	petitionIDs := []string{}
	for _, stream := range resultVector {
		petitionIDs = append(petitionIDs, string(stream.Metric["id"]))
	}
	petitionIDQueryFrag := strings.Join(petitionIDs, "|")

	petitionsQuery := fmt.Sprintf(`sum by (action, id) (
		delta(
			petitions_signatures{id=~"%s"}[1h]
		)
	)`, petitionIDQueryFrag)
	result, warnings, err = api.QueryRange(promctx, petitionsQuery, r)

	if err != nil {
		return nil, err
	}

	if len(warnings) > 0 {
		return nil, fmt.Errorf("Received some warnings: %s", warnings)
	}

	if result.Type() != prommodel.ValMatrix {
		t := result.Type().String()
		return nil, fmt.Errorf("Got a %s from Prometheus, not matrix", t)
	}
	resultMatrix := result.(prommodel.Matrix)

	stats := make([]Stat, 0)

	for _, stream := range resultMatrix {
		stat, err := makeChart("signatures", "petitions exporter", stream)
		if err != nil {
			return nil, err
		}

		stats = append(stats, stat)
	}

	return stats, nil
}
