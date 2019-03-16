---
title: "ALB with static IP and source IP preservation"
date: 2019-03-16T11:53:56Z
draft: false
---

This is a post about getting an AWS ALB to have static IP addresses, whilst
maintaining the original source IP of the user.

## Jargon

TLS &rarr; Transport Layer Security - the protocol for securing TCP.
[Wikipedia](https://en.wikipedia.org/wiki/Transport_Layer_Security)

DNS &rarr; Domain Name System - the protocol for naming things on the internet.
[Wikipedia](https://en.wikipedia.org/wiki/Domain_Name_System)

AWS &rarr; Amazon Web Services.

ALB &rarr; Application load balancer - an AWS managed HTTP(s) load balancer.

NLB &rarr; Network load balancer - an AWS managed TCP (or TLS) load balancer.

ACM &rarr; Amazon Certificate Manager - an AWS service that manages TLS
certs/keys.

VPC &rarr; Virtual Private Cloud - an AWS abstraction for a virtual network.

EC2 &rarr; Elastic Compute Cloud - on-demand virtual machines from AWS.

ECS &rarr; Elastic Compute Cloud - AWS cloud-native container scheduler.

## Requirements

This work was done on the infrastructure for [GOV.UK
Verify](https://www.verify.service.gov.uk/), whilst we were reworking the
infrastructure to use
[Amazon ECS](http://localhost:1313/post/alb-with-static-ip-and-source-ip/).
Most of the terraform source code is now open and can be found
[here](https://github.com/alphagov/verify-infrastructure).

The following requirements had to be met:

- Static IP addresses needed to be present because other parties had egress
restrictions in place, and rules allowing egress to Verify need to be
specified, these rules are based on IP addresses.

- The original source IP address of the user needed to be preserved for
analytics and audit reasons. By preserved I mean present in the HTTP request
that ends up at the web service being load balanced by the ALB.

- Any user facing TLS connection should use an ACM certificate. This is so
the organisation does not have to buy TLS certificates and rotate them, or to
set up LetsEncrypt.

- All traffic between components is encrypted using TLS.
Any EC2 &lrarr; load balancer connection inside the VPC should use TLS.  Any
connection into the VPC should use TLS, except for redirecting users to use
HTTPS instead of HTTP (which is done using HTTP).

Discussions of using AWS for Government projects generally, or whether
these requirements are useful, are outside the scope of this post.

## Context

NLBs can have static IP addresses, where AWS Elastic IPs are mapped into
individual subnets.

ALBs are only ever dynamically addressable - the IPs can change at any time.

Both NLBs and ALBs can be configured to terminate TLS connections using ACM
certificates.

When using proxies at the TCP level, crucial information like source &amp;
destination IP, ports, etc are lost because new TCP connections are initiated.
There are "extensions" to TCP to enable this (for example [HAProxy Proxy
Protocol](https://www.haproxy.com/blog/haproxy/proxy-protocol/)), however these
are non-standard and are not supported everywhere (e.g. ALBs cannot accept
Proxy Protocol TCP connections).

## Solution

AWS NLB &xrarr; HAProxy &xrarr; AWS ALB &xrarr; the web services

The NLB terminates TLS using an ACM certificate. The user sees a publicly
valid TLS certificate issued by Starfield, which is Amazon's certificate
authority. The NLB, if configured correctly, presents the user's source IP to
the downstream service which it load balances.

HAProxy is configured with: HTTPS frontend &amp; HTTPS backend &amp; DNS
resolver.  HAProxy uses a self-signed certificate for TLS, and re-resolves the
DNS for the ALB. The Docker image for HAProxy using self-signed TLS is
[here](https://github.com/alphagov/verify-infrastructure/tree/master/dockerfiles/haproxy-static-ingress-tls).
HAProxy is configured with the "forwardfor" option to add the "X-Forwarded-For"
header which preserves the user's original IP address.

The ALB terminates TLS (again) using an ACM cert. The user doesn't see
this certficate. If the requirement for static IP addresses at the
ingress layer is no longer required, then this ALB could be used directly
without HAProxy or the NLB. In this case the ALB does path based routing
to other web services which involves another TLS connection. If path based
routing to other ECS services was not required then the ALB would not be
needed.

NLBs only preserve the source IP address if the target group is of the
type "Instance". The source IP will not be preserved if you are using a
target group of type "IP". If you want to use the "awsvpc" networking
mode for ECS tasks, then you must use Proxy Protocol V2 at the NLB and
change your HAProxy configuration accordingly.

## Consequences

- Now there are at least 4 TLS connections, which has a small latency
cost that affects the user.

- The user facing TLS certificate is managed by AWS and does not have to be
rotated by the organisation (there are no manually managed certs/keys).

- The connections between the load balancers, HAProxy, and the web services are
encrypted but not trusted: the certificates are self-signed and not signed by a
certificate authority.

- An additional service (HAProxy) has to be run. This is disadvantageous
because it is another piece of software to run and patch. However it enables
the use of
[prometheus/haproxy_exporter](https://github.com/prometheus/haproxy_exporter)
which enables the collection of metrics at a much more granular level than
CloudWatch ALB metrics.

## Other solutions

- Change the requirements. There are strong arguments that static IP
addresses shouldn't be necessary and removing this requirement would
significantly simplify the infrastructure. This was not an option in the time
available.

- AWS to allow ALBs to have static IP addresses. There are probably reasons why
AWS cannot implement this.

- Follow the AWS post on
["Using static IP addresses for Application Load Balancers"](https://aws.amazon.com/blogs/networking-and-content-delivery/using-static-ip-addresses-for-application-load-balancers/).
This was not seriously considered because source IP is not preserved (and proxy
protocol is not supported), and because it contains too many moving parts.
