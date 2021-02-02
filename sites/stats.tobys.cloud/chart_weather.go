package main

import (
	"context"
	"fmt"
	"time"

	promapi "github.com/prometheus/client_golang/api/prometheus/v1"
	prommodel "github.com/prometheus/common/model"
)

func chartWeathers(api promapi.API) ([]Stat, error) {
	promctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	r := promapi.Range{
		Start: time.Now().Add(-1 * 7 * 24 * time.Hour),
		End:   time.Now(),
		Step:  1 * time.Hour,
	}

	stats := make([]Stat, 0)
	units := []string{"C", "%"}
	queries := []string{
		`topk(1, weather_temp)`,
		`topk(1, weather_humidity)`,
	}

	for i, query := range queries {
		unit := units[i]

		result, warnings, err := api.QueryRange(promctx, query, r)
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
		stat, err := makeChart(unit, "weather exporter", resultMatrix[0])

		if err != nil {
			return nil, err
		}

		stats = append(stats, stat)
	}

	return stats, nil
}
