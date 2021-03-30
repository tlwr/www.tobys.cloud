terraform {
  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
    }
  }
  required_version = ">= 0.13"
}

provider "cloudflare" {
  version = "~> 2"
}

data "cloudflare_zones" "tobys_cloud" {
  filter {
    name = "tobys.cloud"
  }
}

locals {
  tobys_cloud_zone_id = data.cloudflare_zones.tobys_cloud.zones[0].id
}

resource "cloudflare_worker_script" "pom" {
  name    = "pom"
  content = file("${path.cwd}/files/pom.js")
}

resource "cloudflare_worker_route" "pom_tobys_cloud" {
  zone_id = local.tobys_cloud_zone_id
  pattern = "pom.tobys.cloud/*"
  script_name = cloudflare_worker_script.pom.name
}
