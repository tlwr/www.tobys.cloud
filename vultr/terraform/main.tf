terraform {
  backend "remote" {
    organization = "tlwr"

    workspaces {
      name = "www-tobys-cloud"
    }
  }
}
