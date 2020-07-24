_Written on 2019-12-29_

This post is about attending [codebar](https://codebar.io) as a coach.

## Context

Codebar is a non-profit that runs free programming workshops, with the goal of
increasing diversity in the tech community. More information is available on
[their website](https://codebar.io).

## Before

During the summer of 2019, 2 of my colleagues at GDS took it on themselves to
organise a series of 3 workshops, so that people at work without any
programming experience could learn to code, or at least get started. They
recorded their experience and efforts in a [GDS blog
post](https://gds.blog.gov.uk/2019/07/18/learning-to-code-at-gds/) which you
should read.

I participated in these sessions as a coach and it was a good opportunity to
meet people from different communities at work, with whom I may not have
interacted with, had it not been for the learn to code workshops.

As well as meeting new people, coaching was a fun experience which challenged
many of my assumptions, and helped rebuild some empathy. My first programming
experiences happened so long ago that they are lost to me, and pair programming
with someone at a different stage in the learning process made me re-live some
of those frustrating experiences.

## Codebar

Off the back of the learn to code workshops, I decided to attend some codebar
sessions as a coach; a colleague helps organise Codebar in London, and multiple
ex-colleagues attend as students and coaches. Knowing people made it easier to
go the first time, however everyone is very friendly and welcoming.

For those unfamiliar; the typical event is as follows:

- 1830: venue opens, where there is usually food
- 1900: matching begins, where a coach is matched with 1-2 students
- 2100: people are asked to leave, some people head to a pub

The matching process is where a student's name is called, along with the
subject/language being covered, e.g. JavaScript and React.

The 1:1 or 1:2 group sizes means that the student gets some meaningful time to
learn with a coach, and isn't burdened by a lowest common denominator group
workshop experience which may not be optimised for best the student learns. As
a coach, you get to meaningfully engage with a person, rather than a group, and
you can cover ground very quickly when you engage with the student in a way
which works for them.

## Learning to code

Whilst I enjoy coaching and pair programming with students, I am saddened by
some of the rougher edges of the learning process.

Learning to code certainly has had more effort applied to the process, with
many people working hard to write tutorials and create structured learning
experiences; however the increasing complexity and diversity of technologies
involved in software has also increased the complexity and the length of the
learning curve.

The growing technology landscape has raised the barrier to entry, and the
growth of developer bootcamps has created a gravity towards web and mobile
development, and seems to overshadow other learning pathways.

### Railway tracks

Ruby on Rails was a Christmas gift to the world in December 2005, and changed
the web development landscape drastically. Rails has stood the test of time,
and is still one of the most productive web application frameworks.

Frameworks like Rails obviate the need for almost anything except for business
logic, however a lot of the (now) extraneous layers are interesting detours and
learning opportunities, which are now more likely to be missed.

I feel a similar thing has happened with resources for learning to code. The
goal for many is more gainful employment, and this goal has been capitalised on
by the bootcamp market. Bootcamps will take anyone who is driven and has access
to a computer, and after 12-16 weeks they will likely be able to work as a web
developer.

This is obviously a good thing: breaking down the barriers to software
development, which traditionally has been gate-kept behind a university degree,
and enabling more people to become developers is important. However, the web
development is not the only way to get started, and we must, provide more
varied pathways into the industry.

To provide an example: a student was quite stressed by the tutorials she had
found online, and was not "getting it"; she was working on HTML/CSS and
building a web site. It transpired, after talking a while, that she was more
interested in analysis and data science, but she had been led to believe that
in order to start learning to code, you must first learn HTML and CSS.

The dopamine hit of creating your first website is not universal, especially in
the era of commodity landing pages and e-commerce stores like Squarespace and
Shopify, respectively. We must also inspire and empower those buried under the
weight of endless spreadsheets.

### Computer science vs software development

Many of the resources for learning to code are unclear in their approach and
their target audience. Much of the technology is wrangling business logic,
without requiring any novel computer science problems within scope; this has
become a bit of a meme especially when applied to job interviews ("When have
you ever had to reverse a binary tree at work?").

Many people learning to code are taking the first steps in the path to become
software developers as their full time job. However many of the resources for
learning are related to computer science, and not software engineering. Very
rarely to we get to cover automated testing and software project structure
during tutorials that students find online; instead we churn through the same
neat language katas and koans, which more often and not, focus on computer
science fundamentals which are rarely needed in the workplace.

I am not frustrated by the possibility of teaching extraneous information to
students who may not need it, otherwise I would be even less happy with my
university degree. The thing that frustrates me most is seeing the negative
consequences of computer science problems on students who have not been given
the formal education which helps you solve them, without them being told that
solving the problems is not important in the long run.

This is not to say that there is no benefit in computer science fundamentals in
software engineering, which is a statement with which I disagree. However it is
an inefficient and unempathetic way to teach students, in the same way that a
whiteboard session on esoteric algorithms is an extremely suboptimal interview
process.

### Language distribution and tooling

The matching process at codebar has the side effect of including an informal
[TIOBE ranking](https://www.tiobe.com/tiobe-index/). The name of every student
is called out, as well as their programming language of choice. This is so that
coaches who are comfortable with the language and material can be matched with
students. Howvever it also provides an insight into what and how students are
learning.

Unsurprisingly, HTML/CSS/JavaScript are the most used languages for learning,
followed by Ruby and Python. Occasionally there is some C#/Java/Go or PHP.
Coaches (as you would expect from software developers) can be annoyingly
opinionated about languages, which is discouraging for learners.

Many students learn via their web browser, using online tutorials with browser
IDEs and REPLs. Very rarely do we actually use an IDE, or the terminal, however
when we do it is universally painful.

The languages mentioned above, and commonly chosen by beginners are all
interpreted languages which are not self-hosting; this means in the middle of a
teaching session I sometimes have to

- fix a C compiler issue
- introduce the concept of unix permissions and sudo
- debug an issue with dependency management tool like [bundler](https://github.com/bundler/bundler)
- introduce a language management tool like [rbenv](https://github.com/rbenv/rbenv)

These are all things to know about, however they can be frustrating roadblocks
to a students development, where momentum is extremely important to keeping
someone engaged. Especially when learning to code is a side-project that can
quickly be forgotten or superseded by real-world responsibilities.

My disappointment in the software development ecosystem is especially palpable
when teaching JavaScript, not due to the language itself, but due to the
JavaScript community's extreme aversion to using vanilla JS. I am a big fan of
using JS, but I do not enjoy teaching it, which inevitably ends up down various
rabbit holes involving `webpack`, `babel`, `node-gyp`, and the other usual
suspects. Additionally, tutorials are often outdated very quickly due to new
language features, or the rapidly shifting ecosystems.

I personally feel that a language with a better standard library, and possibly
a compiler, are better choices: for instance Ruby or Go. This opinion is not
taking into consideration employment opportunities.

## Thoughts to end on
