# SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
#
# SPDX-License-Identifier: MIT

# JavaScript Solid Server for the end-to-end tests (docs/testing.md), from
# the lockfile beside this file, as published (AGPL-3.0: unmodified, and
# built only where the tests run, never pushed). It keeps its pods as
# files under /data, gone with the container.
FROM node:24.22.1-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53
WORKDIR /srv/jss
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev --omit=optional --no-audit --no-fund && mkdir /data && chown node /data
USER node
ENTRYPOINT ["node", "node_modules/javascript-solid-server/bin/jss.js", "start"]
