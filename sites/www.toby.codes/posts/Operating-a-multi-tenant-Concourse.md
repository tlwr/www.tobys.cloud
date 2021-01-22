# Operating a multi-tenant Concourse

_Written on 2019-12-29_

This is an overdue post wherein I link to to a talk I gave to the
[Concourse London User Group](https://www.meetup.com/Concourse-London-User-Group/)
about the different patterns for operating Concourse for multiple users groups.

The talk was uploaded by
[Engineer Better](https://www.engineerbetter.com/)
to their
[YouTube channel](https://www.youtube.com/watch?v=hD6nXqhAzsM).

## Context

[Concourse](https://concourse-ci.org/) is an open-source, continuous thing-doer
which I use almost every day, and has changed the way I think about software
development.

Concourse is usually deployed for continuous integration and delivery, and can
be deployed for small teams, or can be deployed in various multi-tenant
configurations for larger teams and organisations. These different strategies
are covered in [the video](https://www.youtube.com/watch?v=hD6nXqhAzsM).

The actual code we use to deploy Concourse at GDS, which represents one of the
multi-tenant strategies, is
[open source on GitHub](https://github.com/alphagov/tech-ops/tree/master/reliability-engineering/terraform/modules).
