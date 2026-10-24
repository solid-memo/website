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
FROM node:24.22.1-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
ARG MAJOR
WORKDIR /srv/solid
COPY ${MAJOR}/package.json ${MAJOR}/package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev --no-audit --no-fund
COPY --chown=node seed/ ./
RUN mkdir db && chown node . db
USER node
ENTRYPOINT ["node", "node_modules/solid-server/bin/solid"]
