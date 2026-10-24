# SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
#
# SPDX-License-Identifier: MIT

# Pivot (solid-contrib/pivot, the server of solidcommunity.net) for the
# end-to-end tests (docs/testing.md): the Community Solid Server with
# Pivot's components, from the lockfile beside this file, run with
# pivot-e2e.json. Pivot's own views name their templates relative to the
# working directory, hence the link. Nothing it needs is an install script.
FROM node:22.23.4-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d
WORKDIR /srv/pivot
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev --no-audit --no-fund && ln -s node_modules/@solid/pivot/templates templates
COPY pivot-e2e.json ./
USER node
ENTRYPOINT ["node", "node_modules/@solid/community-server/bin/server.js", "-m", ".", "-c", "pivot-e2e.json"]
