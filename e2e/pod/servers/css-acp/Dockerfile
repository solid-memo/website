# SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
#
# SPDX-License-Identifier: MIT

# The Community Solid Server 7 with Access Control Policies, for the
# end-to-end tests (docs/testing.md): css-7's image, the same release, run
# with acp-e2e.json, its default configuration with ACP in place of Web
# Access Control. Renovate keeps it on 7 and on css-7's release
# (renovate.json5).
FROM solidproject/community-server:7.3.0@sha256:58073541889f0cd113dc482b4ddbb834bcd39463dc077d49fd1cf9f55337c4b6
COPY acp-e2e.json /community-server/config/acp-e2e.json
