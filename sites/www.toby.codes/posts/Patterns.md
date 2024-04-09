# Patterns

_In this post I am collecting interesting patterns from graphs and charts that
I have come across (usually, but not always, at work)._

## Sawtooth connections

Below we have a 12h graph and we can see roughly every hour a spike in new
connections, unrelated to the (much higher volume) number of requests.

The number of connections that spikes every dwindles with every period.

![A sawtooth pattern of connections unrelated to requests](/images/patterns-sawtooth.png)

At first it appears peculiar, the dwindling amplitude of periodic connections.

These are connections which timed out after an hour and are re-established. The
initial spike in connections is due to a sudden spike in usage (a periodic
task, using multiple connections). These connections are re-established after
the idle timeout.
