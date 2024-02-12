ARG ruby_version=3.2
FROM ruby:$ruby_version

RUN apk add --no-cache ca-certificates curl

COPY $PWD/Gemfile .
COPY $PWD/Gemfile.lock .

RUN bundle install

COPY $PWD /acceptance
WORKDIR /acceptance
