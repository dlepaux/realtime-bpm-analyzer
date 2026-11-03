# RBA-59's data job: the pipeline in Node and the trackers in Python. Apart from the tuning image, so
# its torch and its checkpoint do not weigh down a job that needs neither. Build context: the repo
# root, narrowed by data.Dockerfile.dockerignore, so no audio can reach the image.
FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c AS build
WORKDIR /src
COPY . .
RUN npm ci --ignore-scripts
WORKDIR /src/packages/realtime-bpm-analyzer/benchmark
RUN mkdir dist && ../../../node_modules/.bin/esbuild free-data.ts \
  --bundle --platform=node --format=esm --target=node22 --log-level=warning --outdir=dist --out-extension:.js=.mjs

# librosa 1.0.0 needs Python 3.12, which bookworm's apt does not have
FROM python:3.12-slim-bookworm@sha256:e697c81897302a4c4333bade000d98038fbb21eb064f8ee1fd42d02ebcd9d337
COPY --from=build /usr/local/bin/node /usr/local/bin/node
RUN apt-get update \
  && apt-get install --yes --no-install-recommends bzip2 ca-certificates curl ffmpeg unzip \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/packages/realtime-bpm-analyzer/benchmark/job/requirements-data.txt /tmp/requirements-data.txt
RUN pip install --no-cache-dir -r /tmp/requirements-data.txt
# Baked in, as the job's network fence reaches 443 but a job should not depend on a university's host.
# Beat This! weights: MIT, labelling use only, nothing of them ships.
ENV TORCH_HOME=/opt/torch
RUN mkdir -p /opt/torch/hub/checkpoints \
  && curl -fsSL -o /opt/torch/hub/checkpoints/beat_this-final0.ckpt https://cloud.cp.jku.at/public.php/dav/files/7ik4RrBKTS273gp/final0.ckpt \
  && echo "8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331  /opt/torch/hub/checkpoints/beat_this-final0.ckpt" | sha256sum -c - \
  && chmod -R a+rX /opt/torch
RUN useradd --uid 1000 --create-home node
WORKDIR /app/benchmark
COPY --from=build /src/packages/realtime-bpm-analyzer/benchmark/dist dist
COPY --from=build /src/packages/realtime-bpm-analyzer/benchmark/splits splits
COPY --from=build /src/packages/realtime-bpm-analyzer/benchmark/job job
ENV RBA_TEMPO_ROOT=/data/rba-tempo RBA_BENCHMARK_DIR=/app/benchmark
LABEL org.opencontainers.image.source=https://github.com/dlepaux/realtime-bpm-analyzer
USER node
CMD ["/app/benchmark/job/free-data.sh", "all"]
