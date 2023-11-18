ARG ruby_version=3.2
FROM ruby:$ruby_version

COPY $PWD/Gemfile .
COPY $PWD/Gemfile.lock .

RUN bundle install

COPY $PWD /acceptance

RUN bundle exec rspec
