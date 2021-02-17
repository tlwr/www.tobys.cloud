# Getting a job in tech in 2021

_Written on 2021-02-12_

_For transparency, I am sharing my experience of switching jobs as a software
engineer in London in Jan/Feb 2021_

## Prelude

Since mid-2017 I had been working as a site reliability engineer at the
[UK Government Digital Service](https://www.gov.uk/government/organisations/government-digital-service).

In November 2020 I transferred within the UK Civil Service to the
[FCDO](https://www.gov.uk/government/organisations/foreign-commonwealth-development-office),
but left soon after, as I was no longer enjoying working in government.  I
resigned in January 2021 as I wanted a break, to do some reading and personal
projects, and to find a job further afield.

This isn't intended as a guide or a set of suggestions or rules to follow. Tech
is renowned for having awful unstandardised interview processes where the
contributing factors are more likely to be blind luck and privilege rather than
ability or experience. If you have questions then
[send me an email](mailto:interviews@toby.codes).

## Strategy

As far as I can tell, getting a job in tech is a numbers game, where the
numbers can depend heavily on factors irrelevant to the job and the work. Such
factors include (non-exhaustively):

* what university you attended, if any
* what organisations you have worked for in the past
* your ability to solve "cute" computer science problems
* demographics

There are also factors which provide a more accurate signal of your value
to a potential employer:

* the ability to write a CV
* written and verbal communication skills
* the ability to write software (not just code)
* the ability to design a distributed system
* demonstration of domain specific knowledge (security, unix, debugging)

I picked 8 companies that I thought were:

1. places I would enjoy working for
2. had a reasonable probability of hiring me
3. going to move at a reasonable pace

These may be self-explanatory reasons, however during a period of
self-isolation and home confinement, sitting around waiting for very picky,
aspirational companies is not something I wanted to put myself through.

8 is quite a small number, given the stochastic nature of the hiring process,
however I was not in a rush to start a new job, and doing lots of interviews
concurrently is exhausting. Last time (in mid-2017) I was applying for mid-level
positions and did 42 late-stage interviews.

I submitted an identical CV, and a custom written cover letter to each company. The
CV is uncharacteristically long (4 A4 pages) based on my experience sifting SWE
candidates.  My CV listed recent projects and summarised my involvement in
each, and had a condensed section listing technology with which I am familiar,
to pass a check box exercise.

The companies can be summarised as:

* 4 fintech companies (2 referrals, 4 responses) (London is full of fintech)
* 1 travel company (1 response)
* 1 internetworking and security company (1 referral)
* 2 logistics companies (1 response)

All but two of the companies were London/US/Remote, 2 were European.

I applied for both software engineering and for site reliability engineering
positions. The SWE positions for which I applied were specialised for
infrastructure and networking.

I did not apply to any FAANG companies.

## Interviews

Without exception every company started with a phone screening with the hiring
manager. In one case the hiring manager was also the team lead.

Once the hiring manager screen was passed, there were three possible next steps:

* Take-home test
* Phone screen with Engineer
* Phone screen coding test

After the phone screens, and take-home tests were completed, there were follow
up technical interviews, which can be summarised as:

* take-home code walkthrough and discussion
* systems design interview
* technical operations interview
* software development interview
* quality assurance and software testing interview
* discussion with engineering manager

## Stats

| Stage                  | Count | Drop-off |
| -----                  | ----- | -------- | 
| Submission             | 8     | -        | 
| CV sift                | 6     | 1        |
| Phone screen           | 7     | 0        |
| Take home              | 2     | 0        | 
| Engineering interviews | 6     | 0        | 

## Outcome

The outcome of the interviews was that I received an offer from a company that
will relocate me to Amsterdam. I've been in London for almost 4 years and it
feels like the right time to move again.

I exited other companies' interview processes after receiving the offer to
relocate, so I don't have exact statistics. The remaining interviews bar 1 were
culture fit interviews.

## Retrospective analysis

1. I deeply dislike solving "cute" computer science problems, and
   [HackerRank](https://www.hackerrank.com/dashboard) as a platform. I don't
   think the problems are representative of the work that one does a software
   engineer. This mirrors my ire with many [codewars](https://www.codewars.com)
   problems which I encounter as a coach at [codebar](https://codebar.io),
   students less mathematically minded, or without an intuitive grasp for math
   problems get unncessarily discouraged or gate-kept.

1. Take-home tests are a good way of demonstrating aptitude and experience,
   however I had a large advantage as someone who has no childcare or other
   caring responsibilities, nor other hobbies or commitments. It is quite easy
   to spend 2-4 hours per take-home test, especially if you enjoy writing tests.

1. I think an interview process would be better if it allowed a candidate to
   choose between an online coding test or a take-home project. People who get
   nervous can opt-in to take-home tests, people who have less time can opt-in
   to online coding tests. I didn't interview with any companies who offered
   paid temp projects, but I have seen this work for front-end and design
   roles.

1. At no point during any application, did I have to demonstrate any written
   communications skills, or presentation skills. I think this is unfortunate
   because the majority of software engineering communication is done
   asynchronously in written form: documentation, email, chat, commit messages,
   pull requests, etc.

1. I was asked to write a surprisingly small amount of working code, with the
   exception of the take-home tests. Most of the demonstration of knowledge was
   verbal, either discussing code which was written but not executed, or verbal
   explanations of core concepts and whiteboard discussions. Verbal
   communication is useful, but many people may struggle under interview
   pressure.

1. For the SWE interviews, the most valuable interview preparation was to brush
   up on my university CS principles: depth and breadth first search; trees,
   tries, stacks, queues; big-O notation for time and space; sorting
   algorithms. For my actual job I rarely have to write these myself, the most
   valuable data structures I use are arrays, maps, sets, distributed counters
   (CRDTs), radix-trees, bloom filters, HyperLogLogs (only redis), from this
   list only arrays, maps, and sets came up during interviews.

1. For the SRE interviews, any interview preparation I did was not covered. I
   brushed up on my sysadmin fundamentals, and wrote some low-level networking
   code. The questions I was asked covered systems design, troubleshooting,
   incident management, and distributed system bottlenecks: sharp edges that
   one remembers from experience rather than from a book. The
   [Google SRE books](https://sre.google/books/) may provide supplementary
   knowledge for people who possess better book
   retention than I. Brendan Gregg's
   [2019 talk on system performance](http://www.brendangregg.com/blog/2020-03-08/lisa2019-linux-systems-performance.html)
   covers some useful debugging fundamentals.

1. Having a mental index of recent incidents to which I've responded, systems
   that I have designed well (and less well), as well as positive/negative
   feedback colleagues have given me recently was helpful during discussions
   with engineering managers.
   I think I got bonus points for having quantitative data for business impact
   (eg improving annual deploys by 50x by introducing CI/CD pipelines).

1. The end to end process took 28 days from submitting the first application to
   receiving an offer letter.

## Interview practice

If you are an underrepresented group in tech and are looking for interview
practice, [codebar](https://codebar.io) sometimes run interview practice
sessions.

You could also [send me an email](mailto:interviews@toby.codes) and if I have
had experience interviewing (either as a panelist or as an interviewee) for the
roles for which you are applying, we can schedule practice interview sessions.

## Addenda

1. You can find the source code for my two take-home tests on
   [GitHub](https://github.com/tlwr/take-home-projects).

1. [Cracking the Coding Interview](https://www.crackingthecodinginterview.com)
   is good preparation for companies who use "Google" style coding interviews.

1. 2021-02-15 - I updated this post, as the internetworking company responded;
   previously they were listed as no response.
