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
FROM node:24.22.2-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9
ARG MAJOR
WORKDIR /srv/solid
COPY ${MAJOR}/package.json ${MAJOR}/package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev --no-audit --no-fund
COPY --chown=node seed/ ./
RUN mkdir db && chown node . db
# The signed-in instance's templates: the package's, and the .acl files its
# npm package leaves out, without which an account's pod would have none.
# Its server's root folder is made here: two of its starting steps make it
# at once otherwise, and node-solid-server 5 can exit on the second.
COPY signed-in/templates/ /tmp/signed-in-templates/
RUN mkdir -p signed-in/data/localhost signed-in/config/templates \
 && cp -r node_modules/solid-server/default-templates/server node_modules/solid-server/default-templates/new-account signed-in/config/templates/ \
 && cp -r /tmp/signed-in-templates/. signed-in/config/templates/ && rm -rf /tmp/signed-in-templates \
 && chown -R node signed-in
USER node
ENTRYPOINT ["node", "node_modules/solid-server/bin/solid"]
