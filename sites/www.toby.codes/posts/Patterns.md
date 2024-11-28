# Patterns

_In this post I am collecting interesting patterns from graphs and charts that
I have come across (usually, but not always, at work)._

## 80 characters, 32 millimeters, and other anachronisms

We use 80 characters per line (CPL) in lots of software (TTY defaults, git
standards, etc) because of widespread adoption of DEC's VT100 and similar
terminals. These, in turn, use 80 characters because of a 1928 punch card
format for IBM used in the US Census.

If you have IKEA furniture, like the Billy bookcase, you have a 32mm cabinet.
We use 32mm centre-distance in cupboards and cabinets, with 5 or 8mm diameter,
and a 37mm front margin. Allegedly, the 32mm comes from the centre spacing of
common line drilling jigs.

_First the world shapes the tool, then the tool shapes the world._

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

## Damped sine wave failures

In this example we have a chart of 48h, with three peaks, and a damped sine wave pattern of failures.

Similar to the sawtooth pattern above, but even more sinusoidal. In this case
the retry mechanism has a jitter which more predictably spreads retries.

![A damped sine wave pattern of failures to establish a grpc stream](/images/patterns-damped-sine.png)

_This level of failure for this system is normal, as each server does load
shedding to distribute load better, these failures represent either rejected
connections for load distribution, or session expiries. What is abnormal here
is that start time of all the servers is synced, so initial connections and
expiries create coincidences of large load._
