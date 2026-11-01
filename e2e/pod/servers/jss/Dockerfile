# SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
#
# SPDX-License-Identifier: MIT

# JavaScript Solid Server for the end-to-end tests (docs/testing.md), from
# the lockfile beside this file, as published (AGPL-3.0: unmodified, and
# built only where the tests run, never pushed). It keeps its pods as
# files under /data, gone with the container.
FROM node:24.22.2-alpine3.24@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85
WORKDIR /srv/jss
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev --omit=optional --no-audit --no-fund && mkdir /data && chown node /data
USER node
ENTRYPOINT ["node", "node_modules/javascript-solid-server/bin/jss.js", "start"]
