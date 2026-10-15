# SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
#
# SPDX-License-Identifier: MIT

# JavaScript Solid Server for the end-to-end tests (docs/testing.md), from
# the lockfile beside this file, as published (AGPL-3.0: unmodified, and
# built only where the tests run, never pushed). It keeps its pods as
# files under /data, gone with the container.
FROM node:24-alpine@sha256:44fce696f38ba8c987c4db89954051000bbd05ffd8d8659ba15ed4a8602e937f
WORKDIR /srv/jss
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev --omit=optional --no-audit --no-fund && mkdir /data && chown node /data
USER node
ENTRYPOINT ["node", "node_modules/javascript-solid-server/bin/jss.js", "start"]
