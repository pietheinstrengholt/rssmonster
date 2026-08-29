ARG VARIANT=22-bookworm
FROM mcr.microsoft.com/devcontainers/javascript-node:5-${VARIANT}

USER root

# sqlite3 may need to compile its native module, and the MySQL client is useful
# for inspecting the development database from the workspace container.
RUN apt-get update \
    && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install --yes --no-install-recommends \
        default-mysql-client \
        g++ \
        make \
        python3 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p \
        /workspace/client/node_modules \
        /workspace/server/node_modules \
        /workspace/inference/node_modules \
        /workspace/inference/.cache/models \
        /home/node/.npm \
    && chown -R node:node /workspace /home/node/.npm

USER node
