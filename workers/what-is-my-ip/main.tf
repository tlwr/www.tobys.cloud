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

resource "cloudflare_worker_script" "what_is_my_ip" {
  name    = "what-is-my-ip"
  content = file("${path.cwd}/files/what-is-my-ip.js")
}

resource "cloudflare_worker_route" "what_is_my_ip_tobys_cloud" {
  zone_id = local.tobys_cloud_zone_id
  pattern = "what-is-my-ip.tobys.cloud"
  script_name = cloudflare_worker_script.what_is_my_ip.name
}
