FROM crystallang/crystal:0.29.0

WORKDIR /app

COPY $PWD/shard.yml /app
RUN shards install

COPY $PWD /app
RUN crystal build --static main.cr -o www.toby.codes

EXPOSE 3000
ENV KEMAL_ENV "production"
ENTRYPOINT ["/app/www.toby.codes"]
