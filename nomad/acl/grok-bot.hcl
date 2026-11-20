# Read-only debugging for Grok Bot.
# No variables block, so variable reads are denied.
# No read-fs: rendered allocation files contain other tokens.
# No alloc-exec. policy "read" merges with read-logs.

namespace "default" {
  policy       = "read"
  capabilities = ["read-logs"]
}

node {
  policy = "read"
}

agent {
  policy = "read"
}

operator {
  policy = "read"
}
