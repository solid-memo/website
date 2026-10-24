# SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
#
# SPDX-License-Identifier: MIT

# node-solid-server for the end-to-end tests (docs/testing.md), built from
# the lockfile of one major (MAJOR: 5 or 6), as ../nss-<major>/compose.yml
# asks. Without install scripts: solid-server depends on its own commit-hook
# tool, @fastify/pre-commit, whose script would install a git hook. The
# seed is a root that lets anyone read and write, and the root ACL
# template solid-server 6.0.0 copies on first start but does not ship.
# What the server stores stays in the container, gone with it.
FROM node:24.22.0-bookworm-slim@sha256:91acba91b842bec0bf7ea6f5e09c644c7ccad72c4996ed9616d861d1c7cd60d4
ARG MAJOR
WORKDIR /srv/solid
COPY ${MAJOR}/package.json ${MAJOR}/package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev --no-audit --no-fund
COPY --chown=node seed/ ./
RUN mkdir db && chown node . db
USER node
ENTRYPOINT ["node", "node_modules/solid-server/bin/solid"]
