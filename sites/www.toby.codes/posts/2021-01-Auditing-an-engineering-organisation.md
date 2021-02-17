# Auditing an engineering organisation

_Written on 2021-01-22_

## History

Auditing is an ancient practice used by bean-counters and bookkeepers since
antiquity, to ensure accounts are balanced, and rules are being followed. In
some business contexts, for example publicly listed companies, accounting
audits are a regular occurence.

A fun bit of trivia: the origin of the role "chancellor of the exchequer"
originally Norman.  A table with a chessboard pattern was used to simplify
calculations and budget balancing, like a primitive spreadsheet.  The
Norman/French word for chessboard is "échiquier", and so the process of
auditing the books was called "exchequer".

## Context

In software engineering and information technology there are several common
auditing practices:

* software/hardware/kit audit -
  what do we have,
  where is it,
  how much does it cost,
  when should we replace it

* information management audit -
  what information and data do we hold,
  what are our practices for keeping it safe,
  do we comply with information management and data protection regulations

* software security audit -
  how secure is this software,
  how easy would it be for a malicious party to exploit the software,
  what are the practices for software development and operations and what
  security implications do they have

The above audits are usually conducted because of a contractual obligation or
compliance process. In this post I am writing about a more general, less
formal, internal process for getting a grip on an engineering organisation, and
writing up findings to improve decision making and focus people's minds. 

Before reading further, I recommend skimming a <a
href="https://www.nao.org.uk">UK National Audit Office</a> summary report. I
find these reports interesting: they often surface observations and insights
that one would not expect, equally often they observe practices that are very
common in tech/IT. The NAO usually produces a well-written, concise summary
report which can, if nothing else, improve one's writing ability.

## What and why

A general engineering audit could, depending on organisation size, take only a
few days, or stretch to many months. Likewise, you could conduct an audit in a
very formal and rigid style, or audit an engineering organisation more casually
and informally.

I think the following (non-exhaustive) situations are good reasons to audit:

* you have just joined an engineering organisation, and you are expected to
  have some management responsibility

* you are concerned about growth or volume of technical debt, or malpractice

* your organisation is going to grow or shrink the engineering function

Surfacing problems/risks aren't the only reasons to do an audit. Dispelling
uncertainty about whether you're doing a good job is an equally valid reason.
In fact, the main two reasons for not doing an audit are:

1. you did an audit recently

1. you have conflicting priorities or no capacity for new work

### Why

Let's individually consider the three scenarios listed above

#### Recently joined

Conducting an audit when you have recently joined an engineering organisation
is an ideal time to do so, and an audit can serve two purposes:

1. You are a fresh pair of eyes, and you are well placed to spot anomalies,
   inefficiences, or problems that others have accepted due to slow erosion
   over time

1. By doing an audit, you will very quickly learn how things are done across
   the wider organisation, rather than just your team. You may spot
   opportunities for convergence or situations where you can avoid re-inventing
   the wheel

#### Technical debt

If you have running software or hardware somewhere, inevitably you will have
made trade-offs or accrued some technical debt. You:

* may have manually configured a router or switch
* might have clicked through a software user interface to change some settings
* could have written some code without adding a test
* might not have a way of deploying code changes automatically
* may have avoided setting up logging and monitoring, or hooking up observability tools

There may be inherent problems with the current solution, software might:

* not currently meet a user need, or only work for some users (eg accessibility)
* be supported by a vendor for a limited period of time, or it might be end-of-life

Hardware might:

* have parts which need replacing
* have an inherent vulnerability that cannot be fixed via firmware updates
* be approaching an expected failure lifetime

These are not necessarily immediate problems, or they may never actually affect
the service or product. However it is important to track them, often
organisations have a "risk register". Cynical readers will imagine such
registers as spreadsheets where improvements go to languish, people acknowledge
risks, and the act of acknowledging them is seen as a mitigation.

Doing an audit allows you to gather (perhaps many) risks and present them
together. When compiled together in a novel format which groups and quantifies
any risks (more on this later) it can paint a sobering picture that focuses the
minds of leadership/management/decision makers. This picture can be less easy
to ignore than a periodically updated spreadsheet or wiki page.

#### Changing the size of the engineering organisation

Probablistically, it is rare that an organisation's size remains constant.
People get promoted, switch jobs, have children, become ill, perish, etc.

Startups can grow quietly, or rapidly, sometimes achieve 50-100% growth
year-over-year. Governments and large public companies can decide to downsize
or split departments.

When an organisation decides to grow or shrink, hopefully there is a goal:

* we need to hire 2 new engineers to reduce the risk of someone leaving
* we need to double the engineering capacity so we can add X, Y, Z new features
* we are spending a lot of money on engineers without a reasonable rate of return

Whether this goal can be achieved is an assumption, and depending on the cost
of doing so, it can be prudent to attempt to pre-emptively de-risk this
assumption with some analysis.

An engineering audit can clarify such an assumption by identifying:

* how good/bad the situation is within an engineering organisation or a product team
* how much work has to be done to alleviate a bad situation
* how many people it takes to support a service or product in its current incarnation
* any risks associated with reducing the number of engineers
* any potential bottlenecks or problems which will arise when increasing the
  number of engineers

If engineers are firefighting incidents or are not keeping up with a backlog of
patches, it would not be prudent to reduce the number of engineers.

If the software development cycle is slow, or capacity to onboard new engineers
is low because of high demand for product development then it may be difficult
to onboard new engineers. Priorities and delivery deadlines may have to
change to ensure new engineers are happy and productive.

An audit may completely contradict an assumption that reducing headcount is an
intelligent allocative decision. An audit could contradict an assumption that
the organisation should increase headcount by 50%: if it takes an engineer 6
months to get up to speed, should you hire 10 people, or hire 3 engineers and
spend 3 months improving the onboarding situation.

Alternatively, if your organisation assumes it needs more engineers because of
a lack of capability to do X, an audit looking at the learning and development
investment and uptake may identify an alternative course of action: ensure
engineers have budget and time to participate in learning and development
activities.

## How to audit

### Who is your audience

Before you start, work out who is going to look at your audit results:

* if no one is will look, are you happy auditing for your personal
  satisfaction, if you are not, then reconsider auditing

* if you will circulate the results only to your immediate team members and
  peers, then you might dive a bit deeper technically, and be less formal in
  your approach

* if you will circulate the results to non-technical colleagues, or external
  parties, then you may have to work harder to describe/explain/quantify your
  results

### How you will communicate with your audience 

How you present your results will influence how you proceed:

* if the results are directly going to become an epic or a list of stories then
  you may want to spend less time quantifying or costing risks

* if you are giving a presentation or authoring a deck then you may only have
  to present detail in appendices which may never be read, consider how much
  time you are willing to spend doing this

* a written report may seem outmoded, but can be extremely good (depending on
  your writing ability) at communicating good/bad things and risks. A written
  report also is an ideal medium for technical materials like schematics,
  graphs, tables, and links to other documents like incident reports. A written
  report can usually be summarised into a deck, although it can be
  dissatisfying to have to cut detail and context to articulate technical
  content in a slide format

### What data is available to you

If you are in a mature software delivery organisation then you may have access to:

* process outlines, documentation, or architectural designs
* incident reports
* code and software repositories with dependency versions
* lists and equipment manifests detailing what is deployed where

These can all be useful inputs into an audit, answering questions such as:

* what software is (soon to be) end-of-life, and what are the associated costs
  or risks

* how reliable is the service really, and what are some failure modes or danger
  areas

* how long has equipment been deployed, and how likely is it to fail in the
  next 1/2/5 years

If you are in a less mature organisation, or in an organisation that has
chronically underinvested in good practice, then you may have none of the
above. However you still have the people who build and operate the
software/hardware/product/service. You can ask your colleagues to:

* be participants in audit interviews
* write their own sections in the audit, pertaining to their product or
  specialism
* fill out surveys

Depending on the situation, you may wish to use qualitative or quantitative
methods:

* Quantitatively: how engineers in a team think or feel can be more important
  than a quantitative assessment covering the paucity of patching: is your
  organisation going to succeed if everyone leaves because they are unhappy?

* Qualitative methods may produce only anecdata which could be historically
  accurate but presently inaccurate. A previously unreliable system could be
  regarded with prejudice and suspicion, but data may show that prior
  investment has solved some sources of unreliability.

If you are going to consult with your colleagues during your audit, you can
view this consultation as a form of user research. The
<a href="https://www.gov.uk/service-manual/user-research">
  GOV.UK service manual guidance on user research
</a>
is illuminating.

If you are sending out a survey, you should ensure that it can be filled out
quickly and ergonomically. Asking your participants to download a spreadsheet
is not going to engender happy thoughts, and you will be making work for
yourself later. You may wish, depending on the content of the survey, to allow
for anonymous submission. Some topics to look at include:

* How long do you wait for tests to run per day (seconds, minutes, hours)
* How often do you get paged when you are on-call (never, sometimes, often, always)
* How confident are you that your software meets user needs (not at all, somewhat, very)
* How often do you have time/budget to participate in learning/development
* How often do you have time/opportunity to participate in user research
* How often do priorities change
* How confident are you that the system/software is secure (not at all, somewhat, very)

Informal 1:1 interviews where attribution is anonymised can produce high
quality information (which you should independently verify) at low cost,
providing your colleagues trust you. Explaining up front why you are conducting
an audit is important: people can fear for their product or job when in fact
all you are doing is attempting to provide clarity and reprioritise work to
reduce risk. You should take detailed notes or, if you have consent, record the
interviews for future reference.

A very informal interview could consist of:

* Introductions
* What is your history within the org, and what is your technical background?
* How simple is it to get started on a new project/feature/product?
* What are some problems you've experienced recently trying to do your job?
* What things are we doing that we should not be doing?
* What things are we not doing that we should be doing?
* Where are the bodies buried? What worries you or keeps you up at night?

### How to write a report

Assuming you are writing a report, you may wish to structure your report with some of the following headings:

* Abstract / summary
* Introduction
* Methodology
* Structure of the organisation
* Description of processes and practices
* List of good things
* List of risks and bad things 
* Recommendations
* Conclusion
* Appendices

#### Abstract

Imagine you are going through hundreds of documents in an organisation's shared
drive, where there is no information management system or informal hierarchy.
The abstract should tell such a reader what is in the report, and why they
should read it.

For example:

> This report is an informal engineering audit conducted in January 2021.
> Individuals in the engineering and product disciplines were informally
> interviewed, and a number of risks were identified. Risks include: lack of
> new widgets, surplus of old widgets, lack of widget handling automation.
> Recommendations include: adoption of widget management software, and engineer
> training.

#### Introduction

This may not be necessary depending on how the abstract is written. You may
wish to introduce the scope of the audit, and the reasons why you decided to
audit.

For example:

> As a new engineering manager joining the organisation I decided to conduct an
> audit over a 2 week period so that I could familiarise myself with the
> organisation's ways of working and the different product areas. I wanted to
> understand how engineers who report to me conducted their work, and to work
> out which areas I would best be placed to help.

Alternatively:

> The organisation is, over the next annual period, seeking to expand the
> engineering organisation by 50%. In order to do this effectively I felt that
> we needed more information about where we need engineers the most, and to
> identify any bottlenecks or blockers that would prevent hiring and onboarding
> so many new engineers.

#### Methodology

Depending on how you conduct your audit, you may not have much to describe in a
methodology section, and any information about the methodology could be added
to the introduction.

If you are using any quantitative or statistical methods which require
explanation, you should do so in this section.

If you have specific reasons for choosing a specific methodology, ensure that
it is written in the report somewhere, preferably in the methodology section.

For example:

> The audit was conducted over a 2 week period. I informally interviewed 2
> people from every team (5 teams, 10 people total). Before I conducted the
> interviews I sent out a survey to the engineers, the results of which I used
> to corroborate the information gathered in interviews. For a statistical
> summary of the survey results, refer to the appendix.
>
> The questions asked
> during the interviews included: what are we doing well as an org, what are we doing
> badly as an org, what product presents the biggest risk to the org.
>
> An informal interview was chosen because of the short timeline and the small
> number of participants.

#### Structure of the organisation

Organisations change size and shape over time. For future readers it can be
useful to summarise the size/shape of the organisation at the time of the
audit. Significant changes in organisational structure may invalidate
recommendations made in the audit report. The audit report may have
an influence on the shape of the organisation in future, and such detail can be
informative for future readers reviewing the report retrospectively.

For example:

> The engineering organisation is divided into two teams: the development team,
> and the operations team. Each team has their own team lead, and each team
> lead reports directly to the CEO. The development team's KPI is the cadence
> at which new features can be released, and the operation team's KPI is the
> number of incidents reported by users.

Such detail could provide valuable context for a reader who arrives at the
organisation a year or so later, and finds the organisation in a different
shape.

#### Description of processes and practices

Depending on the audience, you may need to spend a considerable amount of time
and paragraphs explaining the various processes which people follow. This can
be further exacerabated by the tech sector's penchant for acronyms or buzzwords
which may do more to obscure than to clarify.

You may wish to clarify what is meant by commonly overloaded terms such as:

* a deploy
* a release
* a change
* a bug
* an incident

Explaining what the process is designed to do is useful for a reader, so is why
the process was adopted (if a reason could be found). What can be especially
important is how long a process takes: in the abstract all code should be
reviewed by another peer, but if it takes 2 days to review a one line change
then the value of code review may be diminished.

It can be tempting to be very subjective or opinionated in this section,
especially when the processed employed are ridiculous or resemble tragedy and
farce. However overzealous rhetoric can damage the effectiveness of an
allegedly objective report.

An attempt at a generic, objective example:

> The development team cuts a new release when they have new features to put in
> front of users, or if they have produced any fixes for bugs reported by
> users or internal testers. A developer cuts a new release by running a script
> on their laptop, then pushing to the `release` branch in their version
> control system.
>
> The operations team deploy either when they have configuration changes,
> operating system updates, or auxilliary software patches to install, or when
> they have a new release given to them by the development team. Due to the
> lack of a pre-production environment, they first deploy to half of the
> servers, then after 30 minutes to the other half.

#### List of good things

A purpose of this section is to validate changes or procedures previously
adopted, and provide evidence that they are working. For example:

> Previously an engineering team spent 6 months optimising the continuous
> delivery pipeline and reducing the number of unreliable tests. Most of the
> engineers reported that they are more productive today than they were a year
> ago, and many interview participants mentioned this work has having a
> positive effect on their productivity.
>
> Compared to a year ago, the number of out-of-hours pages has been reduced by
> 70% due to the change from alerting on symptoms to alerting on user
> behaviour. On-call engineers are happier with their work/life balance, and
> are more confident that any alert received is not a false positive.

Another reason for this section is to avoid the report appearing too negative.
It is highly unlikely that everything is in a precarious or risky state of
affairs, and it is very easy to dismiss a document which appears biased,
rhetorical, or shallowly one-sided.

If the situation is dire, and you were not able to find any good things at all,
then you reduce ambiguity by explicitly including such an observation:

> The audit procedure attempted to discover good practices and procedures, as
> well as to identify risks. Unfortunately it was not possible to observe any
> practice that could be described as effective.

As with any document which describes actions done by people, it is important to
be mindful of people's thoughts and feelings, and the agile prime directive
still applies:

> "Regardless of what we discover, we understand and truly believe that
> everyone did the best job they could, given what they knew at the time, their
> skills and abilities, the resources available, and the situation at hand."

#### List of risks and bad things

This section is the obverse of the previous section, and may be considerably
longer or shorter. Depending on the size of the organisation, and any systems
covered in your audit, it may be helpful to group risks together. For example:

- personnel risks - people are unhappy and may leave; people are not learning/developing; there are too few people to support the product
- commercial risks - a vendor may not continue supporting a product, or may go out of business
- security risks - patches are applied infrequently or never, access control and management is poor
- productivity risks - iterating is slow or difficult; some processes are bureaucratic and produce little value
- reliability risks - deploying changes is dangerous or difficult to reverse
- disaster risks - no disaster recovery scenario; backups are non-existent; failover arrangements are untested

Once you have grouped together risks you've identified, describe each one
individually and, if you can, include an example or some context of what that
risk really means. For example:

> Security risk: 20% of the virtual machines in the production environment are
> running Ubuntu Trusty which, since April 2019, no longer receives security
> updates. Not applying security updates could be construed as negligence or
> malpractice in the eyes of our shareholders and accreditors.

Another example:

> Commercial risk: vendor X has not produced new features or marketing
> materials for software Y which we use for Z. Discussions with our account
> manager indicate that X's new focus is on a different product line. If X
> chooses not to continue to develop Y, then we may have to switch to an
> alternative product at short notice, because of a security vulnerability not
> being fixed.

#### Recommendations

Once you've grouped risks together and enumerated them, you should be in a position to:

* articulate ways to address, mitigate, remediate, or transfer the risks
* provide a rough cost/benefit analysis
* suggest further work on a particular risk, if necessary

For example:

> A number of security risks were identified including lack of prompt patching
> and lax identity and access controls. Both risks could precipitate a data
> breach, which cost similar organisations £X last year.
>
> I recommend we ask 3 engineers and 1 product manager to spend 6 months
> improving our ability to patch our software. With a target of reducing the
> current average time taken to patch of 30 days to 7 days. 
>
> I recommend we ask 2 engineers to spend 3 months tightening up our identity
> and access management systems and processes. Moving service X and Y to use
> our single sign-on system will reduce the number of places we administer
> access controls.

Do not feel the need to provide a solution to every risk identified. Some risks
cannot be mitigated and must be accepted or transferred. Some risks may not be
risks which can be solved by you or your team. You may wish, for completeness,
to enumerate which risks were identified but did not have specific
recommendations.

#### Conclusion

Depending on how thorough your recommendations were, writing a conclusion may
be superfluous. You may wish to sum up some of the recommendations, or write
down what you intend to do with the report in the near future.

#### Appendices

If your audit has been particularly thorough or fruitful, you may have large
quantities of useful anecdotes and data which informs the risks and
recommendations in your audit.

If so, you may wish to include these as appendices in your audit. This will add
weight to your conclusions, or provide context in case you have misinterpreted
something.

If you have examined historical incidents, you may have useful diagrams,
graphs, tables, and other records to which you may wish to link.

## Making it useful

Once you've compiled the results of your audit, you should use it to achieve
the outcome you desire, which may be reprioritisation, or adoption of a new
technology. Alternatively, the audit may have validated that your current
approach is good and your course does not need to be adjusted.

Unless you are in the privileged position of making all the decisions, you
probably need to have some conversations with others, and your audit results
will be a useful input into those conversations.

Before you circulate the report more widely, you should share your report with
some of the people you communicated with while writing it. If you surveyed or
interviewed people, you should check that you're not misrepresenting their
thoughts and feelings. If you compiled an audit based on quantitative
information like budgets, invoices, or configuration manifests then you may
wish to get your peers to check your work: your report will be most effective
if you ensure that it is accurate.

Once you're confident that your findings are accurate and that you have
accurately interpreted the data, and you are authentically representing the
thoughts and feelings of your colleague then you should share the audit more
widely, and store it in a place where it can be most useful for future readers.

You may wish to schedule a meeting or workshop with relevant people to
specifically address the risks and recommendations: maybe you need a budget
increase to address a commercial risk, or you need another team to help you. As
always, make sure that any meeting or workshop has actions assigned at the end,
and that a single person (eg you) is going to ensure that they get done by the
assignee.

Conversely, if you are in an organisation where you are individually empowered
to address many of the risks you have identified then you can use specific
sections of the report as context for code changes or procedure changes that
you are making. For example, consider linking to a specific section of your
audit in a pull request or user story.

## Closing thoughts

I fear that my rather dry explanation of how to audit an engineering
organisation may put you off. Indeed, the act of methodically going through
processes and practices is not enjoyable for everyone, however you are likely
to:

* get to know your colleagues better
* understand the organisation better
* find some completely arcane and kafkaesque bureaucratic process (which ends
  up being quite amusing)
* compile an actionable list of how to improve things, if only a small amount

Therefore, it might be worth your while.
