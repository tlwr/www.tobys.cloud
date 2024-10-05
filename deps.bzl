load("@bazel_gazelle//:deps.bzl", "go_repository")

def go_dependencies():
    go_repository(
        name = "com_github_fsnotify_fsnotify",
        build_file_proto_mode = "disable_global",
        importpath = "github.com/fsnotify/fsnotify",
        sum = "h1:n+5WquG0fcWoWp6xPWfHdbskMCQaFnG6PfBrh1Ky4HY=",
        version = "v1.6.0",
    )
    go_repository(
        name = "com_github_go_logr_logr",
        build_file_proto_mode = "disable_global",
        importpath = "github.com/go-logr/logr",
        sum = "h1:6pFjapn8bFcIbiKo3XT4j/BhANplGihG6tvd+8rYgrY=",
        version = "v1.4.2",
    )
    go_repository(
        name = "com_github_go_task_slim_sprig_v3",
        build_file_proto_mode = "disable_global",
        importpath = "github.com/go-task/slim-sprig/v3",
        sum = "h1:sUs3vkvUymDpBKi3qH1YSqBQk9+9D/8M2mN1vB6EwHI=",
        version = "v3.0.0",
    )
    go_repository(
        name = "com_github_google_go_cmp",
        build_file_proto_mode = "disable_global",
        importpath = "github.com/google/go-cmp",
        sum = "h1:ofyhxvXcZhMsU5ulbFiLKl/XBFqE1GSq7atu8tAmTRI=",
        version = "v0.6.0",
    )
    go_repository(
        name = "com_github_google_pprof",
        build_file_proto_mode = "disable_global",
        importpath = "github.com/google/pprof",
        sum = "h1:5iH8iuqE5apketRbSFBy+X1V0o+l+8NF1avt4HWl7cA=",
        version = "v0.0.0-20240827171923-fa2c70bbbfe5",
    )
    go_repository(
        name = "com_github_kr_pretty",
        build_file_proto_mode = "disable_global",
        importpath = "github.com/kr/pretty",
        sum = "h1:flRD4NNwYAUpkphVc1HcthR4KEIFJ65n8Mw5qdRn3LE=",
        version = "v0.3.1",
    )
    go_repository(
        name = "com_github_meatballhat_negroni_logrus",
        build_file_proto_mode = "disable_global",
        importpath = "github.com/meatballhat/negroni-logrus",
        sum = "h1:eDgsDdJYy97gI9kr+YS/uDKCaqK4S6CUQLPG0vNDqZA=",
        version = "v1.1.1",
    )
    go_repository(
        name = "com_github_onsi_ginkgo_v2",
        build_file_proto_mode = "disable_global",
        importpath = "github.com/onsi/ginkgo/v2",
        sum = "h1:7NVCeyIWROIAheY21RLS+3j2bb52W0W82tkberYytp4=",
        version = "v2.20.2",
    )
    go_repository(
        name = "com_github_onsi_gomega",
        build_file_proto_mode = "disable_global",
        importpath = "github.com/onsi/gomega",
        sum = "h1:pNCwDkzrsv7MS9kpaQvVb1aVLahQXyJ/Tv5oAZMI3i8=",
        version = "v1.34.2",
    )
    go_repository(
        name = "com_github_rogpeppe_go_internal",
        build_file_proto_mode = "disable_global",
        importpath = "github.com/rogpeppe/go-internal",
        sum = "h1:TMyTOH3F/DB16zRVcYyreMH6GnZZrwQVAoYjRBZyWFQ=",
        version = "v1.10.0",
    )
    go_repository(
        name = "com_github_sirupsen_logrus",
        build_file_proto_mode = "disable_global",
        importpath = "github.com/sirupsen/logrus",
        sum = "h1:dueUQJ1C2q9oE3F7wvmSGAaVtTmUizReu6fjN8uqzbQ=",
        version = "v1.9.3",
    )
    go_repository(
        name = "com_github_unrolled_render",
        build_file_proto_mode = "disable_global",
        importpath = "github.com/unrolled/render",
        sum = "h1:1yke01/tZiZpiXfUG+zqB+6fq3G4I+KDmnh0EhPq7So=",
        version = "v1.7.0",
    )
    go_repository(
        name = "com_github_unrolled_secure",
        build_file_proto_mode = "disable_global",
        importpath = "github.com/unrolled/secure",
        sum = "h1:XgdAsS/Zl50ZfZPRJK6WpicFttfrsFYFd0+ONDBJubU=",
        version = "v1.16.0",
    )
    go_repository(
        name = "com_github_urfave_negroni",
        build_file_proto_mode = "disable_global",
        importpath = "github.com/urfave/negroni",
        sum = "h1:kIimOitoypq34K7TG7DUaJ9kq/N4Ofuwi1sjz0KipXc=",
        version = "v1.0.0",
    )
    go_repository(
        name = "in_gopkg_check_v1",
        build_file_proto_mode = "disable_global",
        importpath = "gopkg.in/check.v1",
        sum = "h1:Hei/4ADfdWqJk1ZMxUNpqntNwaWcugrBjAiHlqqRiVk=",
        version = "v1.0.0-20201130134442-10cb98267c6c",
    )
    go_repository(
        name = "in_gopkg_yaml_v3",
        build_file_proto_mode = "disable_global",
        importpath = "gopkg.in/yaml.v3",
        sum = "h1:fxVm/GzAzEWqLHuvctI91KS9hhNmmWOoWu0XTYJS7CA=",
        version = "v3.0.1",
    )
    go_repository(
        name = "org_golang_x_net",
        build_file_proto_mode = "disable_global",
        importpath = "golang.org/x/net",
        sum = "h1:a9JDOJc5GMUJ0+UDqmLT86WiEy7iWyIhz8gz8E4e5hE=",
        version = "v0.28.0",
    )
    go_repository(
        name = "org_golang_x_sys",
        build_file_proto_mode = "disable_global",
        importpath = "golang.org/x/sys",
        sum = "h1:Twjiwq9dn6R1fQcyiK+wQyHWfaz/BJB+YIpzU/Cv3Xg=",
        version = "v0.24.0",
    )
    go_repository(
        name = "org_golang_x_text",
        build_file_proto_mode = "disable_global",
        importpath = "golang.org/x/text",
        sum = "h1:XtiM5bkSOt+ewxlOE/aE/AKEHibwj/6gvWMl9Rsh0Qc=",
        version = "v0.17.0",
    )
    go_repository(
        name = "org_golang_x_tools",
        build_file_proto_mode = "disable_global",
        importpath = "golang.org/x/tools",
        sum = "h1:J1shsA93PJUEVaUSaay7UXAyE8aimq3GW0pjlolpa24=",
        version = "v0.24.0",
    )
