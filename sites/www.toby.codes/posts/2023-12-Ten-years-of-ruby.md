# Ten years of ruby


_Written in December 2023_

## Ruby

Ruby is a programming language almost older than I am. Ruby has a history of
big releases on Christmas every year, a tradition started on Christmas 1996,
when Ruby 1.0 was released. Ruby 2.7 and 3.0 were released on Christmas 2019
and 2020 respectively.

## My ruby

I first encountered ruby in 2011 after reading on Twitter about Twitter's use
of ruby/rails. In 2013 at university some friends and I used ruby (and rails)
in McGill's CodeJam competition (using ML to predict energy usage), to collect
a comically sized cheque for 1000CAD. 2013 was the year when ruby replaced PHP
as my language of choice for the web.

## Macromeasures

In 2014 some friends and I started Macromeasures, a marketing data startup. It
was mostly python (and frontend JS) but the infrastructure automation written
in bash and ruby. I hadn't written any puppet or chef in production (I didn't
yet see the point) but I will never forget how productive I felt with my ruby
infra scripts and rspec tests, building my own island in the cloud.

## Government ruby

In 2017 I moved back to the UK from Canada/US and joined the Cabinet Office /
Government Digital Service. Many of the apps built by GDS are rails apps, and
at the time GDS had a significant amount of puppet (and chef, as a reaction
against the awful puppetry that was contained within the government's private
repos).

The PaaS team at GDS had a love/hate relationship with ruby, with the
developers sitting firmly in Go, Ruby, or TypeScript camps. The thousands of
lines of YAML and bosh manifests were kept in check by swathes of hastily
written but almost exhaustive rspec tests. Rspec's descriptive nature really
shone and managed to make the task of unit testing cloud foundry configuration
manageable.

## Cloud Foundry and BOSH

The internet debate will never stop...this is especially true of the subject
"does ruby scale". Itself a pointless question.

Before the world became obsessed by kubernetes, there was cloud foundry.
Powering a generation of (mostly) java developers to come to work at 9AM, write
boring enterprise java, and leave before 5PM. The promise was:

```
here is my code...
run it for me in the cloud
i do not care how...
```

Cloud Foundry was a mixed bag: a relentless focus on the user experience within
an enterprise environment created a very usable platform. However this
enterprise focus, the lack of a local development experience, and being born
before docker meant it could not ride the open source wave.

Cloud Foundry was built on a solid foundation of BOSH. BOSH was built to solve
the problem of VM lifecycle management, how you get software deployed at scale,
safely, to virtual machines.

_Bosh is not the easiest tool to use_

![Learning curve is steep](/images/bosh-learning-curve.jpg)

BOSH and Cloud Foundry powered (powers?) the movement of millions of dollars/euros per day (many banks), and thousands of businesses (SAP Cloud, etc). At the core of almost all of these Cloud Foundry deployments sits BOSH. And at the core of BOSH, sits the BOSH Director API.

The BOSH Director API is a Sinatra app. Merrily ticking along. You can do a lot
with a rack app, it turns out.

## Booking.com

Since 2021 I work for Booking.com, which is renowed for (originally) being
built on Perl. Nowadays there is still a lot of Perl but also a lot of Java,
Python, and NodeJS. Working in platforms and infrastructure I mainly write Go
(and some c++). I have now written enough perl to appreciate where ruby came
from and see perl's positive influence.

When I am writing code to solve a problem and I know the code won't be used by
anyone but me, I write it in ruby. I put down the blunt instrument named Go, I
drop the sharp knife named perl, the worsted wool embrace of Java can be
shrugged off. My hands are free to don the ruby-red hand-stitched gloves, they
still fit.

The feeling of writing ruby quickly comes back. The REPL is there, better than
I remember it, the gems mostly just work. Being able to pull up `irb` or `pry`
in the middle of a new function or script is a superpower. It feels like magic,
I fall in love with software again.

## Ten years of ruby

I have a tattoo on my wrist of a small ruby gem. It was done at home, by my
house-mate after a glass of wine, with a sewing needle taped to a pen and india
ink from a model shop. Over the years the tattoo has faded, but the outline is
still noticeable.

Sometimes I notice it when typing, the countless memories of churning through
log files with `select`, `reject`, `map`, `reduce`, `group_by`, and `reduce`,
scraping web pages with `Mechanize`, or spinning up a web app at the speed of
thought with `rack` or `sinatra` come flooding back.

## Merry Christmas

Ruby 3.4 gets released in under a week. The wintertime gift that keeps on
giving. Thank you Matz

```
ruby -e '([" *"]+(1..16).map{("#"*_1*2)}+(["###"]*4)).map{_1.center(`tput cols`.strip.to_i)}.join("\n").tap{puts _1}'
```
