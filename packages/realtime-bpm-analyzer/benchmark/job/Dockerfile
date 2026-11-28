# The engine study's batch job. Build context: the repo root, narrowed by Dockerfile.dockerignore to the
# manifests, the library source and this directory, so no audio can reach the image.
FROM node:24.22.2-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS build
WORKDIR /src
COPY . .
RUN npm ci --ignore-scripts
WORKDIR /src/packages/realtime-bpm-analyzer/benchmark
RUN mkdir dist && ../../../node_modules/.bin/esbuild job.ts tune.ts run.ts retune2.ts free-verdict.ts hysteresis.ts calibration-samples.ts \
  --bundle --platform=node --format=esm --target=node22 --log-level=warning --outdir=dist --out-extension:.js=.mjs

FROM node:24.22.2-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl ffmpeg git python3 unzip \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app/benchmark
COPY --from=build /src/packages/realtime-bpm-analyzer/benchmark/dist dist
COPY --from=build /src/packages/realtime-bpm-analyzer/benchmark/splits splits
COPY --from=build /src/packages/realtime-bpm-analyzer/benchmark/job job
COPY --from=build /src/packages/realtime-bpm-analyzer/benchmark/run.sh run.sh
# The calibration study's held-out calibration check: calibration.py judges the committed tables, which it reads from results/
COPY --from=build /src/packages/realtime-bpm-analyzer/benchmark/calibration.py /src/packages/realtime-bpm-analyzer/benchmark/calibration_test.py ./
COPY --from=build /src/packages/realtime-bpm-analyzer/benchmark/results/rba-106-calibration-dev.json results/
# No CI runs the calibration's Python, so the image tests it on the Python the check runs on
RUN python3 -I calibration_test.py
ARG RBA_BENCHMARK_SHA=
# Names the code of a held-out look: an image has no git tree to read it from
ENV RBA_BENCHMARK_SHA=$RBA_BENCHMARK_SHA RBA_TEMPO_ROOT=/data/rba-tempo
LABEL org.opencontainers.image.source=https://github.com/dlepaux/realtime-bpm-analyzer
USER node
ENTRYPOINT ["/app/benchmark/job/entrypoint.sh"]
CMD ["tune"]
