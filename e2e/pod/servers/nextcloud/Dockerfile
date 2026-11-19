# SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
#
# SPDX-License-Identifier: MIT

# Solid-Nextcloud (pdsinterop/solid-nextcloud) for the end-to-end tests
# (docs/testing.md): Nextcloud 32, the newest its Solid app's CI requires
# to pass (33 to 35 may fail there), with the app at a commit of its main
# branch (SOLID_NEXTCLOUD_SHA), its PHP dependencies from its lockfile.
# On the first start, which with no volume is every start, the image
# installs Nextcloud on SQLite, then runs open-pod.sh.
FROM nextcloud:32.0.15-apache@sha256:db18aaa3a58302d7363dc59905c310f6df5141800bc8f336ab9cdec5577c6211
# v0.11.0, for Nextcloud 31 to 35, with the December 2025 authorization
# fix (CLN-012); Renovate follows the branch (renovate.json5).
# renovate: datasource=git-refs depName=https://github.com/pdsinterop/solid-nextcloud branch=main
ARG SOLID_NEXTCLOUD_SHA=dc4135ad3c9bf14d65b4895913ed4b4692c04826
COPY --from=composer:2.11.2@sha256:919efe8e62179c71dfd31fad035fd671fe7454211c6b2aa30a10af0ab4acedba /usr/bin/composer /usr/local/bin/composer
RUN apt-get update && apt-get install -y --no-install-recommends git unzip && rm -rf /var/lib/apt/lists/* \
 && git init -q /tmp/solid-nextcloud && cd /tmp/solid-nextcloud \
 && git fetch -q --depth 1 https://github.com/pdsinterop/solid-nextcloud "$SOLID_NEXTCLOUD_SHA" && git checkout -q FETCH_HEAD \
 && test "$(git rev-parse HEAD)" = "$SOLID_NEXTCLOUD_SHA" \
 && mv solid /usr/src/nextcloud/apps/solid && cd / && rm -rf /tmp/solid-nextcloud \
 && composer install -q --no-dev --no-scripts --no-plugins --no-interaction --prefer-dist --working-dir=/usr/src/nextcloud/apps/solid \
 && rm /usr/local/bin/composer
COPY --chmod=644 open.acl /opt/open.acl
COPY --chmod=755 open-pod.sh /docker-entrypoint-hooks.d/post-installation/50-open-pod.sh
