job "acceptance-tests" {
  datacenters = ["jvg"]

  constraint {
    attribute = "${attr.unique.hostname}"
    value     = "thinkcentre"
  }

  type = "batch"

  periodic {
    crons            = ["*/30 * * * *"]
    prohibit_overlap = true
  }

  group "tests" {
    restart {
      attempts = 0
    }

    task "rspec" {
      driver = "docker"

      config {
        image      = "ghcr.io/tlwr/www-tobys-cloud-acceptance:latest"
        force_pull = true
        work_dir   = "/acceptance"
        command    = "bundle"
        args       = ["exec", "rspec", "--format=documentation"]
      }

      # Optional. Spec helper posts a Discord summary ~1/48 runs when set.
      #   nomad var put nomad/jobs/acceptance-tests webhook_url=https://discord.com/api/webhooks/...
      template {
        data = <<-EOH
          {{ if nomadVarExists "nomad/jobs/acceptance-tests" }}
          {{ with nomadVar "nomad/jobs/acceptance-tests" }}
          DISCORD_WEBHOOK_URL="{{ .webhook_url }}"
          {{ end }}
          {{ end }}
        EOH

        destination = "secrets/file.env"
        env         = true
      }

      resources {
        cpu    = 200
        memory = 256
      }
    }
  }
}
