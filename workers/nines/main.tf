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

resource "cloudflare_worker_script" "nines" {
  name    = "nines"
  content = file("${path.cwd}/files/nines.js")
}

resource "cloudflare_worker_route" "nines_tobys_cloud" {
  zone_id = local.tobys_cloud_zone_id
  pattern = "nines.tobys.cloud"
  script_name = cloudflare_worker_script.nines.name
}
