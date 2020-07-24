_Written on 2019-08-03_

This is an update to a blog post I wrote for the [Government Digital Service
Technology blog](https://technology.blog.gov.uk/).

## Context

At GDS we have an [internal application](https://rotas.cloudapps.digital) for
managing in-hours and out-of-hours rotas, mainly for developers. The source
code is on [GitHub](https://github.com/alphagov/re-rotas).

I wrote a post about the development of this application which can be found
[here](https://technology.blog.gov.uk/2018/10/25/improving-our-in-house-rotas/).

## An update on the rotas app

In the tech industry, especially in operations, we talk a lot about toil - work
that does not add value, and does not spark joy. Having to update multiple
calendars and re-organise rotas on spreadsheets is another form of toil.

We made things better by bringing the information which people need most often,
and presented it in an obvious, user-friendly way:

The app was originally built to provide a consistent view for _who_ was
scheduled to be responsible for _a thing_ without forcing teams to work in
lowest-common-denominator way. This was at the time where we had multiple
PagerDuty organisations, and also multiple rotas managed in separate
spreadsheets.

Since the blog post was written we've made some updates, a couple of which I
would like to talk about:

## Is this the team I am looking for?

[GOV.UK](https://www.gov.uk) was implemented as a consistent, single-domain
website precisely because citizens shouldn't need to know about the structure
of Government in order to _do a thing_.

Large organisations are the same: someone from a completely different team
encounters an issue, and needs to get help, or wants to let another team know
that _a thing_ is broken. However, it is quite likely that the helpful person
doesn't know which team owns the thing; this problem is made worse by
organisations moving responsibilities in the pursuit of efficiency.

We implemented an incredibly boring feature: a text box; which is sometimes all
you need. A team can write about what things they support, and perhaps add a
few links to dashboards, in case people are curious or want to try and
self-diagnose their issue before reporting it.

Teams have used the text box in unanticipated ways, for instance: linking to
the correct slack channels, dashboards, and status pages; or describing the
service or application, and the hours in which it is supported.

## Improving the user experience, and reducing the cost

I do not like inflicting the user experience of PagerDuty on people
unnecessarily. The data model is very good for routing and escalating alerts,
but this does not translate into a good user experience for finding out to how
to contact someone, especially for the uninitiated. The permissions model can
prevent (unless configured for this use case) users from one team seeing users
in another team, and being able to contact them.

PagerDuty is also very expensive, 20 USD per month for a Stakeholder, or 50 USD
per month for a regular account means democratising access to on-call contact
information can get very expensive for a large organisation. There were
suggestions of another spreadsheet to complement Cabinet Office People Finder
and Google Contacts.

Instead we implemented a "Get contact
information from Pagerduty" button, so that in an emergency any one in the
organisation can get the contact details of the on-call engineer, without the
toil of keeping contact information synchronised.

The developer time to add this feature is was far cheaper than the procurement
of more PagerDuty licenses for people who are not on any rotas.

The pull request implementing this feature can be found
[here](https://github.com/alphagov/re-rotas/pull/85).
