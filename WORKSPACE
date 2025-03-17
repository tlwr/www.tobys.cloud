workspace(name = "go-bazel")

load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")

http_archive(
    name = "io_bazel_rules_go",
    sha256 = "c8035e8ae248b56040a65ad3f0b7434712e2037e5dfdcebfe97576e620422709",
    urls = [
        "https://github.com/bazelbuild/rules_go/releases/download/v0.44.0/rules_go-v0.44.0.zip",
        "https://mirror.bazel.build/github.com/bazelbuild/rules_go/releases/download/v0.44.0/rules_go-v0.44.0.zip",
    ],
)

http_archive(
    name = "bazel_gazelle",
    sha256 = "32938bda16e6700063035479063d9d24c60eda8d79fd4739563f50d331cb3209",
    urls = [
        "https://github.com/bazelbuild/bazel-gazelle/releases/download/v0.35.0/bazel-gazelle-v0.35.0.tar.gz",
        "https://mirror.bazel.build/github.com/bazelbuild/bazel-gazelle/releases/download/v0.35.0/bazel-gazelle-v0.35.0.tar.gz",
    ],
)

load("@bazel_gazelle//:deps.bzl", "gazelle_dependencies")
load("@io_bazel_rules_go//go:deps.bzl", "go_register_toolchains", "go_rules_dependencies")
load("//:deps.bzl", "go_dependencies")

# gazelle:repository_macro deps.bzl%go_dependencies
go_dependencies()
go_rules_dependencies()
go_register_toolchains(version = "1.23.7")
gazelle_dependencies()

# tar
load("@bazel_tools//tools/build_defs/repo:http.bzl", "http_archive")
http_archive(
    name = "rules_pkg",
    urls = [
        "https://github.com/bazelbuild/rules_pkg/releases/download/1.0.1/rules_pkg-1.0.1.tar.gz",
    ],
    sha256 = "d20c951960ed77cb7b341c2a59488534e494d5ad1d30c4818c736d57772a9fef",
)
load("@rules_pkg//:deps.bzl", "rules_pkg_dependencies")
rules_pkg_dependencies()

# containers
http_archive(
    name = "rules_oci",
    sha256 = "d007e6c96eb62c88397b68f329e4ca56e0cfe31204a2c54b0cb17819f89f83c8",
    strip_prefix = "rules_oci-2.0.0",
    url = "https://github.com/bazel-contrib/rules_oci/releases/download/v2.0.0/rules_oci-v2.0.0.tar.gz",
)
load("@rules_oci//oci:dependencies.bzl", "rules_oci_dependencies")
rules_oci_dependencies()
load("@rules_oci//oci:repositories.bzl", "oci_register_toolchains")
oci_register_toolchains(name = "oci")
load("@rules_oci//oci:pull.bzl", "oci_pull")
oci_pull(
    name = "go_alpine_linux",
    image = "index.docker.io/library/golang",
    tag = "1.21",
    platforms = [
        "linux/amd64",
    ],
)

# kubeconfig
load("//:rules.bzl", "provide_kubeconfig")
provide_kubeconfig(name = "kubeconfig_home")

# ruby deps
http_archive(
    name = "bazel_skylib",
    sha256 = "74d544d96f4a5bb630d465ca8bbcfe231e3594e5aae57e1edbf17a6eb3ca2506",
    urls = [
        "https://mirror.bazel.build/github.com/bazelbuild/bazel-skylib/releases/download/1.3.0/bazel-skylib-1.3.0.tar.gz",
        "https://github.com/bazelbuild/bazel-skylib/releases/download/1.3.0/bazel-skylib-1.3.0.tar.gz",
    ],
)

# ruby
http_archive(
    name = "rules_ruby",
    sha256 = "9bcf239ef669b19b53e041827a3b5fb54439b3505e1d93680d6839cbdcc80d52",
    strip_prefix = "rules_ruby-0.12.1",
    url = "https://github.com/bazel-contrib/rules_ruby/releases/download/v0.12.1/rules_ruby-v0.12.1.tar.gz",
)

load("@rules_ruby//ruby:deps.bzl", "rb_register_toolchains", "rb_bundle_fetch")

rb_register_toolchains(version_file = "//:.ruby-version")

rb_bundle_fetch(
    name = "bundle",
    gemfile = "//:Gemfile",
    gemfile_lock = "//:Gemfile.lock",
)
