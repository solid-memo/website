#!/bin/sh

# SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
#
# SPDX-License-Identifier: MIT

# Run by the image, as www-data, once Nextcloud is installed: enables the
# Solid app and opens alice's pod to anyone, before a Solid request finds
# no root ACL and writes the owner-only default. Pretty URLs (/apps/solid/
# without /index.php) need the URL the server is reached at, E2E_PORT on
# 127.0.0.1; the request's path must match the one Nextcloud makes.
set -e
# By its relative name: the Solid app reads the request's path, which a
# script named by its absolute path makes Nextcloud refuse on the command
# line ("The requested uri() cannot be processed by the script").
cd /var/www/html
occ() { php occ "$@"; }
occ app:enable solid
occ config:system:set skeletondirectory --value=''
occ config:system:set overwrite.cli.url --value="http://127.0.0.1:${E2E_PORT}"
occ maintenance:update:htaccess
# The pod's folder, with its root ACL, made in alice's files and scanned
# in (files:put makes no folder).
mkdir -p data/alice/files/solid
cp /opt/open.acl data/alice/files/solid/.acl
occ files:scan --path=alice/files/solid
