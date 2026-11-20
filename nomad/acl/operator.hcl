# Day-to-day operator. The management token stays in 1Password.
# namespace write includes alloc-exec, read-logs, and submit-job.
# alloc-node-exec and sentinel-override stay off.

namespace "*" {
  policy = "write"

  variables {
    path "*" {
      capabilities = ["write", "read", "list", "destroy"]
    }
  }
}

node {
  policy = "write"
}

agent {
  policy = "read"
}

operator {
  policy = "write"
}
