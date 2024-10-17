def _provide_kubeconfig_impl(ctx):
    home = ctx.getenv("HOME")
    kubeconfig = ctx.read(home + "/.kube/config")
    ctx.file("kubeconfig.yaml", content = kubeconfig)
    ctx.file("BUILD.bazel", 'exports_files(["kubeconfig.yaml"])')

provide_kubeconfig = repository_rule(
    implementation = _provide_kubeconfig_impl,
    attrs = {
    },
)

