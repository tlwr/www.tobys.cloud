# ZooKeeper connection limits

_Written in 2024-04, split from a post collecting notes on
[Apache ZooKeeper](https://zookeeper.apache.org).
We run multiple large ZooKeeper clusters at
[Booking.com](www.booking.com) and this makes for some
interesting problem solving opportunities_

ZooKeeper clients usually maintain an open connection (session) to ZooKeeper.
In many cases this is the point. Especially important for
[ephemeral nodes](https://zookeeper.apache.org/doc/current/zookeeperProgrammers.html#Ephemeral+Nodes).

ZooKeeper sessions must be periodically re-acknowledged (which involves
processing messages), otherwise they are timed out, the connection is closed by
ZooKeeper.

Connections were stored as a list. When a connection was to be closed, the list
of connections was cloned and iterated. The cloning was to prevent concurrent
access.

Cloning and iterating thousands of connections was still quite fast, until the
number of connections reached approx 10k (per ZK node, in this case running on
physical blade servers). Above this number and we regularly saw mass
disconnects, because the time taken to process closing one connection prevented
(due to concurrent access) the renewal of many other connections.

This has the following consequences:

* ZooKeeper deletes the ephemeral nodes which were created by the closed connections 
* most ZooKeeper clients immediately try to reconnect, in a thundering herd

Both of these cause immense load on ZooKeeper, and iptables rules (or whatever
ad-hoc rate limiting solution you have in your back pocket, is quite handy).
The initLimit configuration can also help a cluster recover on its own (eg
after a re-election).

There are additional subsequent issues:

* if clients successfully reconnect they all have to renew sessions at the same
  time
* sessions that must renew at the same time are even more vulnerable to this
  pathology

Although
[it was fixed in 2017](https://github.com/apache/zookeeper/pull/312),
in 2022 we upgraded this particular ZK cluster to a patched version.

The patch introduced a hashmap for managing sessions which fixed the problem entirely.
Adding jitter (between reconnects and to session timeouts) to clients ensures
that session expiries are less likely to be grouped together.
