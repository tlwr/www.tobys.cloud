ARG go_version=1.14-alpine
FROM golang:$go_version AS build

WORKDIR /app

COPY $PWD/go.mod /app
COPY $PWD/go.sum /app
RUN go mod download

COPY $PWD /app
RUN CGO_ENABLED=0 go build -o server

FROM scratch AS run

WORKDIR /app
COPY --from=build /app/public /app/public
COPY --from=build /app/server /app/server
EXPOSE 8080
ENTRYPOINT ["/app/server"]
