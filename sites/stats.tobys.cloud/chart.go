package main

import (
	"fmt"
	"html/template"
	"strings"
	"time"

	prommodel "github.com/prometheus/common/model"
)

func makeChart(
	unit string,
	source string,
	stream *prommodel.SampleStream,
) (Stat, error) {
	name := string(stream.Metric["action"])

	// 0 0
	// |----------------- w ---------------------------|
	//  |          |       |- yLabelWidth -||-- hPad --|
	//  |          |
	//  h        vPad
	//  |          |
	//  |          |
	//  |          _
	//  |           ******* <- where the data path goes
	//  |           *******
	//  |           *******
	//  |           *******
	//  |           *******
	//  |           *******
	//  |           *******
	// |+- hPad --| ####### <- where the date labels go
	//  | -
	//  | |
	//  | |
	//  | xLabelHeight
	//  | |
	//  | |
	//  | _
	//  | -
	//  | |
	//  | |
	//  | vPad
	//  | |
	//  | |
	//  | _
	//  _

	w := 500.0
	h := 100.0
	vPad := 5.0
	hPad := 5.0
	yLabelWidth := 40.0
	xLabelHeight := 15.0

	xv := make([]time.Time, 0)
	yv := make([]float64, 0)

	for _, pair := range stream.Values {
		xv = append(xv, pair.Timestamp.Time())
		yv = append(yv, float64(pair.Value))
	}

	dpc := len(xv)

	// domain
	xMin := xv[0]
	xMax := xv[0]
	yMin := yv[0]
	yMax := yv[0]

	for i := range xv {
		x := xv[i]
		y := yv[i]

		if x.Unix() < xMin.Unix() {
			xMin = x
		}
		if x.Unix() > xMax.Unix() {
			xMax = x
		}

		if y < yMin {
			yMin = y
		}
		if y > yMax {
			yMax = y
		}
	}

	xDomain := func(t time.Time) float64 {
		band := w - (2 * hPad) - yLabelWidth

		numerator := t.Unix() - xMin.Unix()
		denominator := xMax.Unix() - xMin.Unix()

		return float64(band) * (float64(numerator) / float64(denominator))
	}

	yDomain := func(v float64) float64 {
		band := h - (2 * vPad) - xLabelHeight

		numerator := v - yMin
		denominator := yMax - yMin

		// invert because upside down grid
		return band - float64(band)*(numerator/denominator)
	}

	// svg path of the data
	path := ""
	for i := range xv {
		x := xv[i]
		y := yv[i]

		var instruction string
		if i == 0 {
			instruction = "M"
		} else {
			instruction = "L"
		}

		path += fmt.Sprintf("%s %.2f %.2f", instruction, hPad+xDomain(x), vPad+yDomain(y))
	}
	tsPath := fmt.Sprintf(`<path d="%s"></path>`, path)

	// circle over the start and end of the data path
	tsCapSrc := fmt.Sprintf(`<circle cx="%.2f" cy="%.2f" r="1"/>`, hPad+xDomain(xv[0]), vPad+yDomain(yv[0]))
	tsCapDst := fmt.Sprintf(`<circle cx="%.2f" cy="%.2f" r="1"/>`, hPad+xDomain(xv[dpc-1]), vPad+yDomain(yv[dpc-1]))

	// datestamp labels
	dsFormat := "02 Jan 15:04"
	xLabels := fmt.Sprintf(
		`<g>%s %s</g>`,
		fmt.Sprintf(
			`<text alignment-baseline="bottom" text-anchor="begin" x="%.2f" y="%.2f">%s</text>`,
			hPad, h-vPad,
			xv[0].Format(dsFormat),
		),
		fmt.Sprintf(
			`<text alignment-baseline="bottom" text-anchor="end" x="%.2f" y="%.2f">%s</text>`,
			hPad+xDomain(xv[dpc-1]), h-vPad,
			xv[dpc-1].Format(dsFormat),
		),
	)

	// value labels
	yLabels := fmt.Sprintf(
		`<g>%s %s</g>`,
		fmt.Sprintf(`<text alignment-baseline="hanging" text-anchor="end" x="%.2f" y="%.2f">%.0f</text>`, w-hPad, vPad+yDomain(yMax), yMax),
		fmt.Sprintf(`<text alignment-baseline="bottom" text-anchor="end" x="%.2f" y="%.2f">%.0f</text>`, w-hPad, vPad+yDomain(yMin), yMin),
	)

	midnights := []string{}
	for _, x := range xv {
		if x.Hour() != 0 && x.Minute() != 0 {
			continue
		}

		vLine := fmt.Sprintf(
			`<line x1="%.2f" y1="%.2f" x2="%.2f" y2="%.2f"/>`,
			hPad+xDomain(x), vPad,
			hPad+xDomain(x), h-vPad-xLabelHeight,
		)

		midnights = append(midnights, vLine)
	}

	svg := fmt.Sprintf(`<svg class="chart" viewBox="0 0 %f %f">`, w, h) +
		strings.Join(midnights, " ") + // midnights must come before the tsPath otherwise it covers it
		tsPath +
		tsCapSrc +
		tsCapDst +
		xLabels +
		yLabels +
		`</svg>`

	return Stat{
		Name:   name,
		Source: source,
		SVG:    template.HTML(svg),
	}, nil
}
