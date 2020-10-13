package main

import (
	"html/template"
)

type Stat struct {
	Name   string
	Source string
	SVG    template.HTML
}

type StatPage struct {
	SecondsAgo int64
	Stats      []Stat
}
