# SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
#
# SPDX-License-Identifier: MIT

# The Community Solid Server 8 with Linked Web Storage (LWS) for the
# end-to-end tests (docs/testing.md): the branch of jeswr's fork that adds
# LWS to CSS 8.0.0-alpha.3 (pull request 126 there), at a commit
# (CSS_LWS_SHA), as no release or image of it is published. It is built
# without its dependencies' install scripts, then run with css-lws-e2e.json
# (css-lws) or css-lws-only-e2e.json (css-lws-only).
FROM node:22.23.4-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS build
ARG CSS_LWS_SHA=ef6d664f1253662cbfcb0f1786fe45d32849e067
ARG CSS_LWS_VERSION=8.0.0-alpha.3
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git && rm -rf /var/lib/apt/lists/*
WORKDIR /community-server
RUN git init -q . \
 && git fetch -q --depth 1 https://github.com/jeswr/CommunitySolidServer "$CSS_LWS_SHA" && git checkout -q FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "$CSS_LWS_SHA" \
 && test "$(node -p 'require("./package.json").version')" = "$CSS_LWS_VERSION" \
 && npm ci --ignore-scripts --no-audit --no-fund \
 && npm run build \
 && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM node:22.23.4-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da
WORKDIR /community-server
COPY --from=build /community-server/package.json ./
COPY --from=build /community-server/bin ./bin
COPY --from=build /community-server/config ./config
COPY --from=build /community-server/dist ./dist
COPY --from=build /community-server/node_modules ./node_modules
COPY --from=build /community-server/templates ./templates
COPY css-lws-e2e.json css-lws-only-e2e.json ./config/
USER node
ENTRYPOINT ["node", "bin/server.js"]
