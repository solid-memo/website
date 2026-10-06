# node-solid-server for the end-to-end tests (docs/testing.md), built from
# the lockfile of one major (MAJOR: 5 or 6), as ../nss-<major>/compose.yml
# asks. Without install scripts: solid-server depends on its own commit-hook
# tool, @fastify/pre-commit, whose script would install a git hook. The
# seed is a root that lets anyone read and write, and the root ACL
# template solid-server 6.0.0 copies on first start but does not ship.
# What the server stores stays in the container, gone with it.
FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
ARG MAJOR
WORKDIR /srv/solid
COPY ${MAJOR}/package.json ${MAJOR}/package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev --no-audit --no-fund
COPY --chown=node seed/ ./
RUN mkdir db && chown node . db
USER node
ENTRYPOINT ["node", "node_modules/solid-server/bin/solid"]
