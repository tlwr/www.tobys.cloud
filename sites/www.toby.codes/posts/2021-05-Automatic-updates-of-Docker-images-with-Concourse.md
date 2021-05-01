# Automatic updates of Docker images with Concourse


_Written on 2021-05-1_

This post assumes a working knowledge of Docker, OCI images, and OCI image
registries. No prior knowledge of Concourse is necessary.

## Docker

If you use Docker to package your software with its dependencies, then you will
probably use a Dockerfile, and depend on an upstream image. For example:

```
FROM golang:latest

WORKDIR /src
COPY $PWD .
RUN go install

ENTRYPOINT ["my-go-app"]
```

When you build this docker image, it will use the latest golang image published
to Docker Hub.

This is likely good enough for most purposes. Some optimisations may include:

- multi-stage builds and `FROM scratch` to reduce the final image size
- using a hardened base image
- explicitly adding a `ca-certificates` package

When building docker images for distribution, especially for interpreted
applications (rather than compiled) it is useful to distribute multiple
versions of your application, corresponding to the versions of your
dependencies.

In your Dockerfile, you could use a build argument to achieve this:

```
ARG ruby_version=latest
FROM ruby:$ruby_version
```

When running `docker build` this will by default use the latest ruby image
published to Docker Hub.

Running `docker build` with the flag `--build-arg ruby_version=3.0.1` is equivalent to:

```
FROM ruby:3.0.1
```

## Concourse

[Concourse](https://concourse-ci.org) is an open-source automation tool, or
"continuous-thing-doer". It uses containers and rich abstractions to make it
easy to write detailed, complex, and re-usable pipelines without resorting to a
masochism of Jenkins pipelines. It feels like a combination of functional and
object-oriented programming applied to automation.

The [Concourse Examples](https://concourse-ci.org/examples.html) pages are a
great primer on how Concourse works, and how the abstractions fit together. I
suggest you read some examples and the documentation.

There are five main concepts to understand about Concourse:

1. Resources encapsulate versioned state, eg a file, a git repository, an OCI
   image. Resources have certain operations: check, get, put, which are
   explained later
1. Tasks "do things", this could be compiling code, running tests, running
   shell commands
1. Jobs are collections of tasks and resource operations
1. Pipelines aggregate jobs and resources
1. Resource types are new kinds of resources. Introducing a new resource type
   into a pipeline is a way of extending Concourse (like plugins)

The concept of "resources" is a large part of what makes Concourse powerful:

* `check`: Concourse periodically checks a resource, for example checking if a
  git repository has new commits
* `get`: fetches a specific version of a resource, for example cloning a git repository for a specific commit
* `put`: creates or updates the state of a resource, for example pushing to a git repository

## Building Docker images with Concourse

We can use Concourse tasks and resources to build a Docker image, using a
pipeline.

A pipeline is a collection of resources and jobs

```
resources: []
jobs: []
```

In our example we are going build a Docker image from a git repository. In the
`resources` section of our pipeline we add a `git` resource:

```
- name: my-repo
  type: git
  source:
    uri: https://github.com/tlwr/my-repo.git
    branch: main
```

The `git` resource type comes with Concourse, so we do not have to define a new
resource type (yet).

A resource on its own does not do anything, in order to do something, we add a
job to the `jobs` section of our pipeline:

```
- name: build-my-repo
  plan:
    - get: my-repo
      trigger: true
```

This adds a new job, which is called `build-my-repo`. The `get` operation means
it will clone `my-repo` when the job runs. The `trigger` parameter means that
when the `my-repo` git repository has a new version (ie a new commit on the
`main` branch) then the `build-my-repo` job will run.

This job will clone the repository when it changes, but it does not yet build an image.

In order to build the image from the repository, we will use a `task`. There is
already [an open source task
(`oci-build-task`)](https://github.com/vito/oci-build-task) which we can
re-use.

To our `build-my-repo` job we are going to add a task to the `plan` section:

```
plan:
  - get: my-repo
    trigger: true

  - task: build
    privileged: true
    config:
      platform: linux

      image_resource:
        type: registry-image
        source:
          repository: vito/oci-build-task

      inputs:
        - name: my-repo
          path: .

      outputs:
        - name: image

      run:
        path: build
```

The
[`oci-build-task` README](https://github.com/vito/oci-build-task#oci-build-task)
explains each section in more detail. This effect of this task is similar to
running `docker build` in the `my-repo` directory.

This task builds a docker image but does not yet save it anywhere. After we
have built our image we will push it to an OCI image registry, like Docker Hub.
To do so we will add a new resource, and interact with it in our job.

First, we add a
[`registry-image` resource](https://github.com/concourse/registry-image-resource)
to the `resources` section:

```
- name: my-image
  type: registry-image
  source:
    repository: docker.io/tlwr/my-image
    username: ((docker_hub_username))
    password: ((docker_hub_password))
```

The values `((docker_hub_username))` and `((docker_hub_password))` are syntax for
[Concourse vars](https://concourse-ci.org/vars.html).
We use `vars` so we avoid putting our username/password directly in our
pipeline.

Now that we have a registry image resource, we can interact with it in our job:

```
plan:
  - get: my-repo
    trigger: true

  - task: build
    privileged: true
    config:
      platform: linux

      image_resource:
        type: registry-image
        source:
          repository: vito/oci-build-task

      inputs:
        - name: my-repo
          path: .

      outputs:
        - name: image

      run:
        path: build

  - put: my-image
    params:
      image: image/image.tar
```

Our pipeline definition is now:

```
resources:
  - name: my-repo
    type: git
    source:
      uri: https://github.com/tlwr/my-repo.git
      branch: main

  - name: my-image
    type: registry-image
    source:
      repository: docker.io/tlwr/my-image
      username: ((docker_hub_username))
      password: ((docker_hub_password))

jobs:
  - name: build-my-repo
    plan:
      - get: my-repo
        trigger: true

      - task: build
        privileged: true
        config:
          platform: linux

          image_resource:
            type: registry-image
            source:
              repository: vito/oci-build-task

          inputs:
            - name: my-repo
              path: .

          outputs:
            - name: image

          run:
            path: build

      - put: my-image
        params:
          image: image/image.tar
```

Our pipeline acts as follows:

* when the `main` branch of the git repository `github.com/tlwr/my-repo` changes
* then the `build-my-repo` job will run:
  * Concourse will clone `my-repo`
  * Concourse will build the docker image according to the Dockerfile in `my-repo`
  * Concourse will push the built docker image to `docker.io/tlwr/my-image`


## Automatically update the upstream docker image

If `my-repo` contains a Docker image which uses build arguments to change the
upstream image:

```
ARG ruby_version=latest
FROM ruby:$ruby_version
```

Then we can change this in our pipeline, in the `build-image` task, using
`params`:

```
- task: build
  privileged: true
  config:
    platform: linux

    image_resource:
      type: registry-image
      source:
        repository: vito/oci-build-task

    inputs:
      - name: my-repo
        path: .

    outputs:
      - name: image

    run:
      path: build

    params:
      BUILD_ARG_ruby_version: 3.0.1
```

Instead of the default `ruby_version` build argument of `latest` our Docker
image will use the hard-coded value of `3.0.1`

Instead of hard-coding the value `3.0.1`, we can use another Concourse resource
to change this dynamically. The
[`registry-tag-resource`](https://github.com/tlwr/registry-tag-resource) can be
used to trigger pipelines when new tags appear in an OCI image registry.

The `registry-tag` resource type is not included in Concourse by default, so we
must define it ourselves in a new `resource_types` section:

```
resource_types:
  - name: registry-tag
    type: registry-image
    source:
      repository: tlwr/registry-tag-resource
      tag: 1593696431
```

Once we have defined the resource type, we can use the tags of the `ruby`
Docker Hub image as a resource, by adding a new resource to the `resources`
section:

```
- name: ruby-img-tag
  type: registry-tag
  icon: tag
  check_every: 15m
  source:
    uri: https://hub.docker.com/v2/repositories/library/ruby
    pages: 3
    regexp: '^[0-9]+[.][0-9]+[.][0-9]+-alpine$'
    semver:
      matcher: '>= 2.7'
```

Every 15 minutes Concourse will look at the most recent tags in the `ruby`
image on Docker Hub. The resource will output the tags which match the regular
expression above (for example `2.5.0-alpine`) and are semantically greater than
or equal to`2.7` (eg `2.7.0` or `3.0.1`).

At the time of writing, this resource outputs the following tags:

* `3.0.1-alpine`
* `2.7.3-alpine`

We can now get the latest tag in our `build-my-repo` job, by getting our
`ruby-img-tag` resource.

We will trigger the `build-my-repo` job if either `my-repo` or `ruby-img-tag`
changes.  We can get `my-repo` and `ruby-img-tag` in parallel using the
`in_parallel` step:

```
jobs:
  - name: build-my-repo
    plan:
      - in_parallel:
        - get: my-repo
          trigger: true

        - get: ruby-img-tag
          trigger: true

      ...
```

We want to change the build argument `ruby_version` according to the value of
`ruby-img-tag`. We can do this using `load_var`:

```
jobs:
  - name: build-my-repo
    plan:
      - in_parallel:
        - get: my-repo
          trigger: true

        - get: ruby-img-tag
          trigger: true

      - load_var: ruby_version
        file: ruby-img-tag/tag

      ...
```

Then we can use the `ruby_version` variable in our `build-img` task:

```
- task: build-img
  privileged: true
  config:

    ...

    params:
      BUILD_ARG_ruby_version: ((.:ruby_version))
```

Now our pipeline acts as follows:

* when the `main` branch of the git repository `github.com/tlwr/my-repo` changes
* or there is a new tag of the Docker Hub `ruby` image
* then the `build-my-repo` job will run:
  * Concourse will clone `my-repo`
  * Concourse get the latest `ruby` docker image tag
  * Concourse will build the docker image according to the Dockerfile in `my-repo` using the newest `ruby` image tag produced by the registry-tag resource
  * Concourse will push the built docker image to `docker.io/tlwr/my-image`

Our pipeline now looks like:

![A rendering of our Concourse pipeline](/images/concourse-registry-tag-resource-pipeline.png)

Our pipeline definition is now:

```
resource_types:
  - name: registry-tag
    type: registry-image
    source:
      repository: tlwr/registry-tag-resource
      tag: 1593696431

resources:
  - name: my-repo
    type: git
    source:
      uri: https://github.com/tlwr/my-repo.git
      branch: main

  - name: my-image
    type: registry-image
    source:
      repository: docker.io/tlwr/my-image
      username: ((docker_hub_username))
      password: ((docker_hub_password))

  - name: ruby-img-tag
    type: registry-tag
    icon: tag
    check_every: 15m
    source:
      uri: https://hub.docker.com/v2/repositories/library/ruby
      pages: 3
      regexp: '^[0-9]+[.][0-9]+[.][0-9]+-alpine$'
      semver:
        matcher: '>= 2.7'

jobs:
  - name: build-my-repo
    plan:
      - in_parallel:
        - get: my-repo
          trigger: true

        - get: ruby-img-tag
          trigger: true

      - load_var: ruby_version
        file: ruby-img-tag/tag

      - task: build
        privileged: true
        config:
          platform: linux

          image_resource:
            type: registry-image
            source:
              repository: vito/oci-build-task

          inputs:
            - name: my-repo
              path: .

          outputs:
            - name: image

          run:
            path: build

          params:
            BUILD_ARG_ruby_version: ((.:ruby_version))

      - put: my-image
        params:
          image: image/image.tar
```

## Recap

Following the steps above, we have:

* Defined a simple pipeline to clone a git repository and build a docker image
* Modified our pipeline to push our docker image to the Docker Hub
* Added a new resource type to periodicallly get new tags from the `ruby`
  Docker Hub docker image
* Modified our pipeline to use the most recent `ruby` docker image when
  building our docker image

## Going further

The Concourse maintainers are working on an experimental feature
([RFC](https://github.com/concourse/rfcs/pull/29))
to add a new `across` step to allow plans to be run across multiple different
versions of resources.

This enables building multiple versions of docker images using multiple latest
tags from upstream OCI image repositories. For example: automatically building
new images for the latest ruby releases, whenever new tags are pushed.
