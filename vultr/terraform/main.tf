terraform {
  backend "remote" {
    organization = "tlwr"

    workspaces {
      name = "www-tobys-cloud"
    }
  }

  required_providers {
    vultr = {
      source  = "vultr/vultr"
      version = "2.3.0"
    }
  }
}

provider "vultr" {
  api_key = var.vultr_api_key
}
