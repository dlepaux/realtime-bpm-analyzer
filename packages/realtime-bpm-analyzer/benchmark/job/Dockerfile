# The RBA-51 batch job. Build context: the repo root, narrowed by Dockerfile.dockerignore to the
# manifests, the library source and this directory, so no audio can reach the image.
FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS build
WORKDIR /src
COPY . .
RUN npm ci --ignore-scripts
WORKDIR /src/packages/realtime-bpm-analyzer/benchmark
RUN mkdir dist && ../../../node_modules/.bin/esbuild job.ts tune.ts run.ts \
  --bundle --platform=node --format=esm --target=node22 --log-level=warning --outdir=dist --out-extension:.js=.mjs

FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl ffmpeg git unzip \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/benchmark
COPY --from=build /src/packages/realtime-bpm-analyzer/benchmark/dist dist
COPY --from=build /src/packages/realtime-bpm-analyzer/benchmark/splits splits
COPY --from=build /src/packages/realtime-bpm-analyzer/benchmark/job job
COPY --from=build /src/packages/realtime-bpm-analyzer/benchmark/run.sh run.sh
ARG RBA_BENCHMARK_SHA=
# Names the code of a held-out look: an image has no git tree to read it from
ENV RBA_BENCHMARK_SHA=$RBA_BENCHMARK_SHA RBA_TEMPO_ROOT=/data/rba-tempo
LABEL org.opencontainers.image.source=https://github.com/dlepaux/realtime-bpm-analyzer
USER node
ENTRYPOINT ["/app/benchmark/job/entrypoint.sh"]
CMD ["tune"]
