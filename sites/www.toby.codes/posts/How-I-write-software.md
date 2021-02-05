# How I write software

_In this post I am collecting techniques, languages, and tools that I use to
write and maintain software_

## Development

My [dotfiles](https://github.com/tlwr/dotfiles) are open source.

For version control I default to using
[Git](https://git-scm.com),
[GitHub](https://www.github.com/tlwr)
or [Gitea](https://gitea.io/) (when I need to self-host, eg airgap).

[GNU Bash](https://www.gnu.org/software/bash/) is my shell,
[Starship](https://starship.rs) is my prompt,
[tmux](https://github.com/tmux/tmux) is my terminal multiplexer.

[Vim](https://www.vim.org) is my editor.

I use [Secretive](https://github.com/maxgoedjen/secretive) for storing SSH keys
when using Mac OS, otherwise I use [YubiKeys](https://www.yubico.com).

## Go

The standard library is excellent and makes it easy to write programs and
applications without many dependencies. The built in profiling tools are excellent.

When writing tests, I reach for [ginkgo](https://onsi.github.io/ginkgo/),
[gomega](https://onsi.github.io/gomega/), and
[httpmock](https://github.com/jarcoal/httpmock).

[gopacket](https://github.com/google/gopacket) is an excellent library for
network programming.

I don't use a debugger as much as I should, when I do it is
[delve](https://github.com/go-delve/delve).

## Ruby

I use Ruby for writing tests (eg for infrastructure configuration) and small
automation scripts.

[RSpec](https://rspec.info) and friends for writing tests.

[Mechanize](https://github.com/sparklemotion/mechanize) for automating web
interactions.

For simple web applications it is difficult to beat
[rack-test](https://github.com/rack/rack-test) and
[sinatra](https://sinatrarb.com).

## Networking

[curl](https://curl.se) is always useful, I've also written my own [HTTP
waterfall profiler](https://github.com/tlwr/operator-tools#http).

In addition to the usual suspects:
_dig, ss, netstat, ping, traceroute, tcpdump_;
[_mtr_](https://www.bitwizard.nl/mtr/) is especially useful.

[_socat_](https://linux.die.net/man/1/socat) is an extremely versatile tool.

## Operations

[Grafana](https://grafana.com) and [Prometheus](https://prometheus.io)
is what I use for everything metrics related:
networks, applications, VMs,
[my bank account](https://github.com/tlwr/monzo-exporter), 
[democracy](https://github.com/tlwr/petitions-exporter),
and [the weather](https://github.com/tlwr/weather-exporter).

I use [kubernetes](https://kubernetes.io) for [my personal
cloud](https://www.tobys.cloud) and for my homelab.

[Concourse](https://concourse-ci.org)
is the CI/CD tool with which I am most familiar, and is the
[automation system which I use personally](https://concourse.tobys.cloud).

I use
[Cloudflare](https://cloudflare.com) for DNS
and [Cloudflare workers](https://workers.cloudflare.com) for a few projects.
