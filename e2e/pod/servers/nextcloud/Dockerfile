# SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
#
# SPDX-License-Identifier: MIT

# Solid-Nextcloud (pdsinterop/solid-nextcloud) for the end-to-end tests
# (docs/testing.md): Nextcloud 32, the newest its Solid app's CI requires
# to pass (33 to 35 may fail there), with the app at a commit of its main
# branch (SOLID_NEXTCLOUD_SHA), its PHP dependencies from its lockfile.
# On the first start, which with no volume is every start, the image
# installs Nextcloud on SQLite, then runs open-pod.sh.
FROM nextcloud:32.0.15-apache@sha256:45afe3bebd1eef20b402cafcb87206e3d9f3a27dbc514a21ab8e124d97bbfe8c
# v0.11.0, for Nextcloud 31 to 35, with the December 2025 authorization
# fix (CLN-012); Renovate follows the branch (renovate.json5).
# renovate: datasource=git-refs depName=https://github.com/pdsinterop/solid-nextcloud branch=main
ARG SOLID_NEXTCLOUD_SHA=a7315d90a145ae669762ba5b4fc4465101f42df5
COPY --from=composer:2.10.3@sha256:b6dcd72ca98fa19d0e5b8476de179859704891fad06dd9e0b96833d4c430a5fc /usr/bin/composer /usr/local/bin/composer
RUN apt-get update && apt-get install -y --no-install-recommends git unzip && rm -rf /var/lib/apt/lists/* \
 && git init -q /tmp/solid-nextcloud && cd /tmp/solid-nextcloud \
 && git fetch -q --depth 1 https://github.com/pdsinterop/solid-nextcloud "$SOLID_NEXTCLOUD_SHA" && git checkout -q FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "$SOLID_NEXTCLOUD_SHA" \
 && mv solid /usr/src/nextcloud/apps/solid && cd / && rm -rf /tmp/solid-nextcloud \
 && composer install -q --no-dev --no-scripts --no-plugins --no-interaction --prefer-dist --working-dir=/usr/src/nextcloud/apps/solid \
 && rm /usr/local/bin/composer
COPY --chmod=644 open.acl /opt/open.acl
COPY --chmod=755 open-pod.sh /docker-entrypoint-hooks.d/post-installation/50-open-pod.sh
