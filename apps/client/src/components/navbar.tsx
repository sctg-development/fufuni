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

import { Kbd } from "@heroui/kbd";
import { Input } from "@heroui/input";
import {
  Navbar as HeroUINavbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenuToggle,
  NavbarMenu,
  NavbarMenuItem,
} from "@heroui/navbar";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/dropdown";
import { Button } from "@heroui/button";
import { link as linkStyles } from "@heroui/theme";
import { clsx } from "@heroui/shared-utils";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

import { LinkUniversal } from "./link-universal";
import { I18nIcon, LanguageSwitch } from "./language-switch";

import { AuthenticationGuardWithPermission } from "@/authentication";
import { siteConfig } from "@/config/site";
import { ThemeSwitch } from "@/components/theme-switch";
import {
  TwitterIcon,
  GithubIcon,
  DiscordIcon,
  HeartFilledIcon,
  SearchIcon,
} from "@/components/icons";
import { Logo } from "@/components/icons";
import { useCart } from "@/hooks/useCart";
import { ShoppingCart, ChevronDown, ShieldCheck } from "lucide-react";
import { availableLanguages } from "@/i18n";

export const Navbar = () => {
  const { t } = useTranslation();
  const { count: cartCount } = useCart();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState("");

  const submitSearch = () => {
    const q = searchValue.trim();
    if (q) {
      navigate(`/?q=${encodeURIComponent(q)}`);
      setSearchValue("");
    }
  };

  const searchInput = (
    <Input
      value={searchValue}
      onChange={(e) => setSearchValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          submitSearch();
        }
      }}
      aria-label={t("search")}
      classNames={{
        inputWrapper: "bg-default-100",
        input: "text-sm",
      }}
      endContent={
        <Kbd className="hidden lg:inline-block" keys={["command"]}>
          K
        </Kbd>
      }
      labelPlacement="outside"
      placeholder={`${t("search")}…`}
      startContent={
        <SearchIcon className="text-base text-default-400 pointer-events-none shrink-0" />
      }
      type="search"
    />
  );

  return (
    <HeroUINavbar maxWidth="xl" position="sticky">
      <NavbarContent className="basis-1/5 sm:basis-full" justify="start">
        <NavbarBrand className="gap-3 max-w-fit">
          <LinkUniversal
            className="flex justify-start items-center gap-1"
            color="foreground"
            href="/"
          >
            <Logo />
            <p className="font-bold text-inherit">Fufuni</p>
          </LinkUniversal>
        </NavbarBrand>
        <div className="hidden lg:flex gap-4 justify-start ml-2">
          {siteConfig().navItems.filter(item => !item.permissions || item.permissions.length === 0).map((item) => (
            <NavbarItem key={item.href}>
              <LinkUniversal
                className={clsx(
                  linkStyles({ color: "foreground" }),
                  "data-[active=true]:text-primary data-[active=true]:font-medium",
                )}
                color="foreground"
                href={item.href}
              >
                {item.label}
              </LinkUniversal>
            </NavbarItem>
          ))}
          
          <AuthenticationGuardWithPermission permission="admin:store">
            <NavbarItem>
              <Dropdown>
                <DropdownTrigger>
                  <Button
                    disableRipple
                    className="p-0 bg-transparent data-[hover=true]:bg-transparent"
                    endContent={<ChevronDown className="w-4 h-4" />}
                    radius="sm"
                    variant="light"
                  >
                    {t("nav-admin")}
                  </Button>
                </DropdownTrigger>
                <DropdownMenu
                  aria-label="Admin actions"
                  className="w-[340px]"
                  itemClasses={{
                    base: "gap-4",
                  }}
                >
                  {siteConfig().navItems.filter(item => item.permissions && item.permissions.includes("admin:store")).map((item) => (
                    <DropdownItem
                      key={item.href}
                      description={item.href}
                      startContent={<ShieldCheck className="w-4 h-4 text-primary" />}
                      onPress={() => navigate(item.href)}
                    >
                      {item.label}
                    </DropdownItem>
                  ))}
                </DropdownMenu>
              </Dropdown>
            </NavbarItem>
          </AuthenticationGuardWithPermission>
        </div>
      </NavbarContent>

      <NavbarContent
        className="hidden sm:flex basis-1/5 sm:basis-full"
        justify="end"
      >
        <NavbarItem className="hidden sm:flex gap-2 items-center">
          <LinkUniversal href="/cart" className="relative">
            <ShoppingCart size={20} />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-danger text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                {cartCount}
              </span>
            )}
          </LinkUniversal>
          <LinkUniversal
            isExternal
            isInternet
            href={siteConfig().links.twitter}
            title={t("twitter")}
          >
            <TwitterIcon className="text-default-500" />
          </LinkUniversal>
          <LinkUniversal
            isExternal
            isInternet
            href={siteConfig().links.discord}
            title={t("discord")}
          >
            <DiscordIcon className="text-default-500" />
          </LinkUniversal>
          <LinkUniversal
            isExternal
            isInternet
            href={siteConfig().links.github}
            title={t("github")}
          >
            <GithubIcon className="text-default-500" />
          </LinkUniversal>
          <ThemeSwitch />
          <LanguageSwitch
            availableLanguages={availableLanguages}
            icon={I18nIcon}
          />
        </NavbarItem>
        <NavbarItem className="hidden lg:flex">{searchInput}</NavbarItem>
        <NavbarItem className="hidden md:flex">
          <LinkUniversal
            isExternal
            isInternet
            className="text-sm font-normal text-default-600 bg-default-100"
            color="foreground"
            href={siteConfig().links.sponsor}
          >
            <HeartFilledIcon className="text-danger" />
            <Trans i18nKey="sponsor" />
          </LinkUniversal>
        </NavbarItem>
      </NavbarContent>

      <NavbarContent className="sm:hidden basis-1 pl-4" justify="end">
        <LinkUniversal isExternal isInternet href={siteConfig().links.github}>
          <GithubIcon className="text-default-500" />
        </LinkUniversal>
        <ThemeSwitch />
        <NavbarMenuToggle />
      </NavbarContent>

      <NavbarMenu>
        {searchInput}
        <LanguageSwitch
          availableLanguages={availableLanguages}
          icon={I18nIcon}
        />
        <div className="mx-4 mt-2 flex flex-col gap-2">
          {siteConfig().navMenuItems.map((item, index) => (
            <NavbarMenuItem key={`${item}-${index}`}>
              {item.permissions && item.permissions.length > 0 ? (
                <AuthenticationGuardWithPermission
                  permission={item.permissions[0]}
                >
                  <LinkUniversal
                    color={
                      index === 2
                        ? "primary"
                        : index === siteConfig().navMenuItems.length - 1
                          ? "danger"
                          : "foreground"
                    }
                    href={item.href}
                    size="lg"
                  >
                    {item.label}
                  </LinkUniversal>
                </AuthenticationGuardWithPermission>
              ) : (
                <LinkUniversal
                  color={
                    index === 2
                      ? "primary"
                      : index === siteConfig().navMenuItems.length - 1
                        ? "danger"
                        : "foreground"
                  }
                  href={item.href}
                  size="lg"
                >
                  {item.label}
                </LinkUniversal>
              )}
            </NavbarMenuItem>
          ))}
          <NavbarMenuItem key="login-logout">
            </NavbarMenuItem>
        </div>
      </NavbarMenu>
    </HeroUINavbar>
  );
};
