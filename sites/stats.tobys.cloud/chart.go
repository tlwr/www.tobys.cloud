package main

import (
	"bytes"
	"fmt"
	"html/template"
	"time"

	prommodel "github.com/prometheus/common/model"
	"github.com/wcharczuk/go-chart"
)

func makeChart(
	unit string,
	source string,
	stream *prommodel.SampleStream,
) (Stat, error) {
	name := string(stream.Metric["action"])
	series := make([]chart.Series, 0)

	xv := make([]time.Time, 0)
	yv := make([]float64, 0)

	for _, pair := range stream.Values {
		xv = append(xv, pair.Timestamp.Time())
		yv = append(yv, float64(pair.Value))
	}

	series = append(series, chart.TimeSeries{
		Name:    string(name),
		XValues: xv,
		YValues: yv,
	})

	chart.DefaultBackgroundColor = chart.ColorTransparent
	chart.DefaultBackgroundColor = chart.ColorTransparent
	chart.DefaultCanvasColor = chart.ColorTransparent

	graph := chart.Chart{
		Width:  800,
		Height: 300,

		Background: chart.Style{
			Padding: chart.Box{
				Top: 25, Left: 25, Right: 25, Bottom: 25,
			},
		},

		TitleStyle: chart.Style{
			Show:                true,
			Padding:             chart.NewBox(0, 0, 1000, 1000),
			TextRotationDegrees: -90,
			TextHorizontalAlign: chart.TextHorizontalAlignLeft,
			TextVerticalAlign:   chart.TextVerticalAlignTop,
		},
		XAxis: chart.XAxis{
			Name: "Time",
			NameStyle: chart.Style{
				Show: true,
			},
			Style: chart.Style{
				Show: true,
			},
			ValueFormatter: chart.TimeValueFormatterWithFormat("01-02 03:04"),
		},
		YAxis: chart.YAxis{
			Name: unit,
			NameStyle: chart.Style{
				Show: true,
			},
			Style: chart.Style{
				Show: true,
			},
			AxisType: chart.YAxisSecondary,
			ValueFormatter: func(v interface{}) string {
				if vf, isFloat := v.(float64); isFloat {
					return fmt.Sprintf("%.0f", vf)
				}
				return ""
			},
		},

		Series: series,
	}

	buffer := bytes.NewBufferString("")
	err := graph.Render(chart.SVG, buffer)
	if err != nil {
		return Stat{}, nil
	}
	return Stat{
		Name:   name,
		Source: source,
		SVG:    template.HTML(buffer.String()),
	}, nil
}
