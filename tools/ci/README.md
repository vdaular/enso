# CI Tools

This folder contains miscellaneous utilities for CI.

# Docker

## Building

A custom docker image requires a certain number of directories to be present
from a desired _edition_. The root directory of the docker build context can be
provided in the `docker build` command:

```bash
docker build \
  -t runtime:latest \
  -f tools/ci/docker/Dockerfile \
  --build-context docker-tools=tools/ci/docker \
  built-distribution/enso-engine-0.0.0-dev-linux-amd64/enso-0.0.0-dev
```

## Running

To start Language Server with a default configuration, run the built image and
mount the project directory:

```bash
docker run -it --rm \
  --network=host \
  --mount type=bind,src=~/Documents/enso-projects/NewProject,dst=/volumes/workspace/project_root \
  runtime:latest
```

# Ydoc NodeJS Docker

## Building

To build a NodeJS-based Ydoc, you need to first ensure that you have the
distributable sources:

```bash
pnpm -r compile
```

the resulting artifacts are located in `app/ydoc-server-nodejs/dist` directory.
Having the right NodeJS sources in place, one can now build the docker image:

```bash
ocker build -t ydoc-server-nodejs:latest -f tools/ci/docker/ydoc-server/Dockerfile --build-context docker-tools=tools/ci/docker/ydoc-server app/ydoc-server-nodejs
```

## Running

One should always start Ydoc with the right configuration:

- PORT - the port number under which Ydoc will be available
- HOSTNAME - the hostname under which Ydoc will be available
- LANGUAGE_SERVER_URL - the full url (with port number) of the language server
  to connect to

```bash
docker run -it -e PORT=1234 -e HOSTNAME='0.0.0.0' -e LANGUAGE_SERVER_URL=ws://localhost:59876 ydoc-server-nodejs:latest
```

When correctly setup the network layer one can also hit Ydoc's healthcheck
endpoint:

```bash
> curl http://${HOSTNAME}:${PORT}/_health
OK
```
