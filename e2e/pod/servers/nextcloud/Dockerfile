# Solid-Nextcloud (pdsinterop/solid-nextcloud) for the end-to-end tests
# (docs/testing.md): Nextcloud 30, the newest its Solid app supports, with
# the app at a commit of its main branch (SOLID_NEXTCLOUD_SHA), its PHP
# dependencies from its lockfile. On the first start, which with no volume
# is every start, the image installs Nextcloud on SQLite, then runs
# open-pod.sh.
FROM nextcloud:30.0.17-apache@sha256:fb966733647ea03f0446b0c22eac9733c8eb616d37b960caca9d4c3010e14a08
# v0.10.0 and the December 2025 authorization fix (CLN-012); Renovate
# follows the branch (renovate.json5).
# renovate: datasource=git-refs depName=https://github.com/pdsinterop/solid-nextcloud branch=main
ARG SOLID_NEXTCLOUD_SHA=a7315d90a145ae669762ba5b4fc4465101f42df5
COPY --from=composer:2@sha256:af98f42dfff7c68ba8d53c2164fd9fde1087b7d449514baa38c418b1f6bc4bac /usr/bin/composer /usr/local/bin/composer
RUN apt-get update && apt-get install -y --no-install-recommends git unzip && rm -rf /var/lib/apt/lists/* \
 && git init -q /tmp/solid-nextcloud && cd /tmp/solid-nextcloud \
 && git fetch -q --depth 1 https://github.com/pdsinterop/solid-nextcloud "$SOLID_NEXTCLOUD_SHA" && git checkout -q FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "$SOLID_NEXTCLOUD_SHA" \
 && mv solid /usr/src/nextcloud/apps/solid && cd / && rm -rf /tmp/solid-nextcloud \
 && composer install -q --no-dev --no-scripts --no-plugins --no-interaction --prefer-dist --working-dir=/usr/src/nextcloud/apps/solid \
 && rm /usr/local/bin/composer
COPY --chmod=644 open.acl /opt/open.acl
COPY --chmod=755 open-pod.sh /docker-entrypoint-hooks.d/post-installation/50-open-pod.sh
