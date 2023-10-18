ARG go_version=1.21-alpine
FROM golang:$go_version AS build

RUN apk --no-cache add ca-certificates \
  && update-ca-certificates

WORKDIR /app

COPY $PWD/go.mod /app
COPY $PWD/go.sum /app
RUN go mod download

COPY $PWD /app
RUN CGO_ENABLED=0 go build -o server

FROM scratch AS run

WORKDIR /app
COPY --from=build /app/server /app/server
COPY --from=build /app/templates /app/templates
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
EXPOSE 8080
ENTRYPOINT ["/app/server"]
