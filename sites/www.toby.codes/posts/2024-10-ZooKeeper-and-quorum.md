# ZooKeeper and quorum

_Written on 2024-10-18, split from a post collecting notes on
[Apache ZooKeeper](https://zookeeper.apache.org).
We run multiple large ZooKeeper clusters at
[Booking.com](www.booking.com) and this makes for some
interesting problem solving opportunities_

ZooKeeper is (naturally) good at building service discovery and distributed
configuration systems. However it is far less popular, due to its specialised
nature, compared to Postgres, MySQL, Redis, etc.

If you do not need a distributed system, do not build one. It is quite easy to
(ab)use redis into being a very simple service discovery database. But it will
be very difficult to get Redis to have the same (distributed) uptime you can
have with ZooKeeper.

What is odd (at least from my experience with ZooKeeper elsewhere) about our
ZooKeeper deployment is that we deploy a single cluster across multiple
regions. We have multiple links between each region, and size our regions which
contain ZooKeeper primaries equally. ZooKeeper clients (servers and pods) are
configured only to talk to the ZooKeeper servers in the same region.

During outages and drills, where we have lost a single region, we still have
enough ZooKeeper primaries in the remaining two regions. We still have enough
nodes to afford to lose multiple primaries in the remaining regions.

I have grown to value this stability highly, but it comes at a cost of write
performance, because each write gets acknowledged, potentially via multiple
regional links. This isn't necessarily problematic, because service discovery
workloads (should) have much higher reads than writes. Links between (european)
regions are private, so latency is small (<12ms) and predictable. Global quorum
would not be possible because latency would be too high (eg Australia/NZ).

We scale out the capacity to serve many reads by using
[ZooKeeper observers](https://zookeeper.apache.org/doc/r3.8.3/zookeeperObservers.html)
as we found that we saw degraded performance with more than 10k (see below,
2022) connections per ZK node. Using observers has allowed us to get better
write performance, because clients connect to the observers and ZK primaries
deal only with leader election, writes, and traffic from the observers.

With less than 30 ZooKeeper servers (not all primaries), we are able to handle
multiple hundreds of thousands of simultaneous connections, split across >3
regions of both private and public cloud workloads. With Kubernetes adoption
growing into multiple thousands of services, there is high turnover of (pod) IP
addresses, which has proven (thus far) the architecture.
