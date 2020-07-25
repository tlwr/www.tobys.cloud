_Written on 2019-07-28_

This is a post about doing bad things in order to do good things, using a BOSH
release.

## Prelude

I often read  posts about building and maintaining software well, and people
doing things perfectly. I also read about the worst of the worst, absolute
tyre-fires of software which limp into production, where they stay forever,
much to the terror of everyone else:
[here](https://gyrovague.com/2015/07/29/crashes-only-on-wednesdays/) is one of
my favourites.

Less often I get to read about elegant (citation needed) hacks, that feel a bit
dirty, but get the job done, whilst not being absolutely awful. The kind of
hack you feel a bit bad about, but of which are also secretly proud. This post
is about one of those; and is, IMO, especially relevant given all of the
discourse about 10x and 1x engineers recently. Sharing our sins as well as our
successes is important.

## Requirements

This work was done on the infrastructure for [GOV.UK
PaaS](https://www.cloud.service.gov.uk/), whilst we were working on the single
sign-on feature.  The BOSH release source code is now open and can be found
[here](https://github.com/alphagov/paas-uaa-customized-boshrelease), and is
heavily based on an [18F](https://18f.gsa.gov/) [BOSH
release](https://github.com/18F/uaa-customized-boshrelease).

## Context

GOV.UK PaaS is a platform-as-a-service which service teams can use for building
and maintaining online government services without needing much operations
capability within the team/organisation. It is a highly customised deployment
of Cloud Foundry designed to helping service teams quickly build excellent
online government.

BOSH is a release engineering tool for deploying and managing virtual machines
and the software deployed on virtual machines. BOSH manages the packaging of
software and the lifecycle of virtual machines deployed in the Cloud (private
or public). Software is distributed in a very opinionated way:

- software is packaged as a package
- packages used in jobs
- jobs are included in releases
- releases run on instance groups (groups of virtual machines)
- virtual machines are provisioned using stemcells.

BOSH is a fantastic tool, and in my opinion does not get enough attention.
Modern software development and operations is now focused on using (OCI)
containers as the universal deployment artefact; however when you need to
orchestrate servers instead of containers then BOSH is worth the initial setup
cost and steep learning curve.

Within Cloud Foundry there is a component called UAA (User Account and
Authentication Server) which is a Java application for managing access to other
components within Cloud Foundry. UAA is itself both a service provider and an
identity provider. Due to the complex nature of identity and access management,
UAA is a complex piece of software with a large surface area; as such, it is
updated quite often.

As alluded to earlier, there is an upfront cost to getting software built and
deployed using BOSH, and sometimes it can be hard work to fork a repository,
and build it yourself, just to make a few minor changes. This was the case,
when we wanted to change how UAA was styled, and the content of the user facing
pages.

Being a monolithic web application, UAA has the application logic and the
assets for styling and content storeed together in the same codebase; built
into the same BOSH package. This meant it was not possible to simply swap out
the stylesheets and HTML templates for a customised set; nor was the BOSH
release customisable enough to sufficiently change the content and styles of
the application. Previously the team had done some very impressive (and
impossible to change) CSS hacks to make the page look sufficiently GOV.UK-like
to be palatable to users.

Essentially, we wanted to have our cake, and eat it too: which sometimes is
possible in software development, although rarely. The result of which is due,
in most part, to 18F's
[uaa-customized-boshrelease](https://github.com/18F/uaa-customized-boshrelease)
which was the starting point for
[paas-uaa-customized-boshrelease](https://github.com/alphagov/paas-uaa-customized-boshrelease).
The latter is a fork of the former, although GOV.UK PaaS's release has diverged
significantly in content and scope.

## How it works

Normally, UAA is deployed to a VM, and it is registered with a routing
component
([gorouter](https://docs.cloudfoundry.org/concepts/architecture/router.html))
using another piece of software called
[route-registrar](https://github.com/cloudfoundry/route-registrar). When UAA is
being redeployed then the virtual machine is de-registered from the router, the
software is updated, and then the virtual machine is re-registered. This is
done via BOSH, and via a healthchecking script bundled with UAA, which is
consumed by route-registrar.

Our BOSH release bundles its own healthcheck script, which is used by route
registrar instead of UAA's bundled healthchecking script. Once UAA has been
updated and redeployed the instance is still not yet marked as healthy, it is
stopped again, the WAR (web application resource) file which is used to
distribute UAA is unpacked, some files (stylesheets and HTML templates) are
updated. The WAR file is re-assembled, and then UAA is started again,
healthchecked, and then the instance is re-registered.

This is a filthy hack and should not be used (which is coincidentally
[what it says](https://github.com/18F/uaa-customized-boshrelease/blob/master/jobs/uaa-customized/templates/pre-start#L4)
in 18F's original repository). However, like most awful hacks that end up
getting used in production: it serves a purpose, and doing it this way was
better than doing it properly (for some definition of better). Not all software
can be beautiful, perenially clean distributions of excellence. 

## Consequences

We do not have to maintain our own fork and release of UAA, which delays the
speed at which we can ship security updates to UAA (which is unfortunately
surprisingly necessary).

We learned a lot about the Thymeleaf templating language, and a lot about BOSH
releases and the BOSH lifecycle.

We drastically improved the user experience of logging in to GOV.UK PaaS, which
is perhaps worth a blog post on its own. However by having more control over
just the stylesheets and HTML templates we were able to include the GOV.UK
Design System, and considerably improve accessibility and usability.
