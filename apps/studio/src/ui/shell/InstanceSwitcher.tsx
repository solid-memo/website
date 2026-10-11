// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import type { Instance } from "@solid-memo/domain/instance";
import { ActionsMenu, MenuLink, MenuSeparator } from "@solid-memo/ui/ActionsMenu";
import { useI18n } from "@solid-memo/ui/i18n";
import { studioRouteToHash } from "../router";

/**
 * The open instance in the header, as a menu of the user's other
 * instances, each at its decks, and of all of them (the picker). Only a
 * user with several instances has one: with one, there is nothing to
 * switch to.
 */
export function InstanceSwitcher({
  instances,
  instance,
}: {
  instances: readonly Instance[];
  instance: Instance;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (instances.length < 2) return null;
  return (
    <ActionsMenu
      label={t("studio.shell.switchInstance", { instance: instance.name })}
      text={instance.name}
      buttonClass="studio-switcher"
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
    >
      {instances
        .filter((other) => other.url !== instance.url)
        .map((other) => (
          <MenuLink
            key={other.url}
            href={studioRouteToHash({ screen: "home", instanceUrl: other.url })}
          >
            {other.name}
          </MenuLink>
        ))}
      <MenuSeparator />
      <MenuLink href={studioRouteToHash({ screen: "instances" })}>
        {t("studio.shell.allInstances")}
      </MenuLink>
    </ActionsMenu>
  );
}
