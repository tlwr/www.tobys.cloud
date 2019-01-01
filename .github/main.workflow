workflow "Deploy www.toby.codes" {
  on = "push"
  resolves = ["Deploy"]
}

action "Master" {
  uses = "actions/bin/filter@b2bea07"
  args = "branch master"
}

action "Deploy" {
  uses = "tlwr/actions/cf-cli@ae63d55cb27f4e5598b9b81b76304d0771ff871e"
  needs = ["Master"]
  args = "cf install-plugin -f blue-green-deploy; cf bgd www-toby-codes"
  env = {
    CF_API = "https://api.run.pivotal.io"
    CF_ORG = "tobyscloud"
    CF_SPACE = "production"
    WORKDIR = "www.toby.codes"
  }
  secrets = ["CF_USER", "CF_PASS"]
}
