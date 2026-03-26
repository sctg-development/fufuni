/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { FC, useState, useEffect } from "react";
import { VisuallyHidden } from "@react-aria/visually-hidden";
import { Switch } from "@heroui/react";
import { clsx } from "clsx";
import { useTranslation } from "react-i18next";

import { useTheme } from "@/hooks/use-theme";
import { SunFilledIcon, MoonFilledIcon } from "@/components/icons";

export interface ThemeSwitchProps {
  className?: string;
}

export const ThemeSwitch: FC<ThemeSwitchProps> = ({ className }) => {
  const { t } = useTranslation();
  const [isMounted, setIsMounted] = useState(false);
  const { theme, toggleTheme } = useTheme();

  // Sync the switch state with current theme
  const isLightMode = theme === "light";

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Prevent Hydration Mismatch
  if (!isMounted) return <div className="w-6 h-6" />;

  return (
    <Switch
      isSelected={isLightMode}
      onChange={toggleTheme}
      aria-label={
        isLightMode ? t("switch-to-dark-mode") : t("switch-to-light-mode")
      }
      className={clsx(
        "px-px transition-opacity hover:opacity-80 cursor-pointer",
        className,
      )}
    >
      <Switch.Control>
        <Switch.Thumb>
          <VisuallyHidden>
            <input
              type="checkbox"
              checked={isLightMode}
              onChange={toggleTheme}
              aria-hidden="true"
            />
          </VisuallyHidden>
        </Switch.Thumb>
      </Switch.Control>
      <Switch.Content>
        <div className="flex items-center justify-center">
          {isLightMode ? (
            <MoonFilledIcon size={22} />
          ) : (
            <SunFilledIcon size={22} />
          )}
        </div>
      </Switch.Content>
    </Switch>
  );
};
