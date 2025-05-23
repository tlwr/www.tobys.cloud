# Automation goes brrr (in the enterprise)

_Written on 2025-05-23_

This is a post about using Kubernetes to do questionable things, in the eternal
quest for increasing shareholder value.

## Kubernetes

If you have been living under a rock (or have a decent PaaS or IaaS) then you
probably know what Kubernetes is. It is a control loop with coincidental
container management attached, commonly found in enterprise IT departments.

It is a great/terrible foundation (skill issue) for running applications at
scale, where the hardware (bare-metal servers if you are lucky) is (somewhat)
abstracted from the running of (hopefully ephemeral) applications. Best paired
with NVMe-over-a-network (not managed by kubernetes).

## Pods, Containers, and patches

If you run lots of software, and you are a productive enterprise, you have
probably tens of thousands of different container images, each with their own
set of currently running software vulnerabilities.

Most of these can be caught by some primitive container image scanning tool. You then diligently publish a new image and fix the problem, right?

Wrong. Client teams have deployed their software and moved on to the next task,
and they expect their pods to keep working, without any intervention or action
on their part. (This is good, so they can keep doing shareholder value things)

## Buildpacks

If you were using buildpacks on a real PaaS (rest in peace cloud foundry), you
could just re-stage their application on a newer base and things would probably work.

Unfortunately $work does not use buildpacks.

## Sidecars

Sidecars are containers that run as helpful assistants for normal applications. Like ingress/egress traffic management, stats collection, secrets management, etc.

My team at $work manages 4 sidecar images used by several hundred teams,
totalling ~500k containers. Despite advanced mastery of Google Sheets and mail
merge, I do not have time to email them all asking them ~politely~ to patch their software.

We publish new sidecar image versions either every day or week, and new
deployments automatically use these images. However 80% of deployments happen
less than every 2 weeks. This is a common distribution where 20% of apps get
deployed 80% of the time, and vice versa.

## Maintenance

The underlying hardware (or VMs in the cloud) gets regularly patched, by a
platform team, which means the p95 lifetime of a pod is <7 days.

This means that we can expect that pods will be periodically recreated, and we
can use this to our advantage.

## Kubernetes loves webhooks

In Kubernetes there are two kinds of webhooks, validating and mutating.

Validating webhooks allow you to extend kubernetes API logic with additional
validation. We could use these to reject the creation of pods using software
including vulnerable images.

Mutating webhooks allow you to modify kubernetes entities, for example during
creation or when they are updated. This is also fertile ground for an
exasperated software engineer.

## Lets do some patching

My approach at work has been "if you won't patch it, I will", and this has
worked so far so good (only one big incident ((( )

It does approximately 6 million patches per 24h, which varies on a daily basis
(weekdays are busier than weekends).

_One week of patching in production_
![A grafana query showing container updates over a week](/images/sidecar-manager.png)

## How it works

* Using a mutating webhook, we can modify pods when they are created
* As responsible kubernetes cluster operators we can maintain some configuration about which images should be used as sidecars
* We can write programmes (using [expr expression language](https://github.com/expr-lang/expr) to match which pods are eligible for each patch
* We can weight different sets of updates, for example 10% get update variant 1 and 90% get update variant 2
* This way we can patch pod definitions and achieve some probalistic improvement in patching

The transformation operations include:
* inject init-container
* inject container
* override image used by container or init-container 
* add or replace or remove environment variables
* add or replace or remove volume mounts (for a given container)
* add or replace or remove volumes (for a pod)

We run Istio (as well as envoy, self-managed), so conceivable we could use Istio injection, however for other reasons outside the purview of this short post, we cannot use Istio (or other, non-proprietary tools which do container injection).

## So far so good

I have been running this in production at $work in >50 kubernetes clusters for
several months.

I have had one big incident, which was annoying but incurred no financial
impact.

Multiple teams are adopting this solution, for sidecar management (we have ~8
sidecars which are very commonly used)

Most importantly, I have sent >500 fewer emails in the last two quarters
because I no longer am asking for patches.

## Open source

This is not open source, unfortunately. It probably never well be.

As mentioned above, we cannot use some open-source tools which do similar jobs
(like
[Kruise](https://openkruise.io/docs/user-manuals/sidecarset))

Kruise looks very interesting, especially as a CNCF project, and Kruise
supports some features not supported by my solution (like hot container
upgrades). However Kruise lacks some of the weighted update solutions which I
need for canary image updates.
