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

import { Kbd } from "@heroui/react";
import { Input } from "@heroui/react";
import { Dropdown,
  Label,
} from "@heroui/react";
import { Button } from "@heroui/react";

import { clsx } from "clsx";
import { Trans, useTranslation } from "react-i18next";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { useState } from "react";
import { I18nIcon, LanguageSwitch } from "./language-switch";

import { AuthenticationGuardWithPermission, useAuth } from "@/authentication";
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
import { LoginModal } from '../modals/LoginModal';
import { useOverlayState } from '@heroui/react';
import { UserListsMenu } from "./user-lists-menu";

export const Navbar = () => {
  const { t } = useTranslation();
  const { count: cartCount } = useCart();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const modalState = useOverlayState();

  const submitSearch = () => {
    const q = searchValue.trim();
    if (q) {
      navigate(`/?q=${encodeURIComponent(q)}`);
      setSearchValue("");
    }
  };

  const searchInput = (
    <div className="flex items-center bg-default-100 rounded-lg px-3 py-2">
      <SearchIcon className="text-base text-default-400 pointer-events-none shrink-0 mr-2" />
      <Input
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            submitSearch();
          }
        }}
        aria-label={t("search")}
        className="bg-transparent border-0"
        placeholder={`${t("search")}…`}
        type="search"
      />
      <Kbd className="hidden lg:inline-block ml-2">
        <Kbd.Abbr keyValue="command" />
        <Kbd.Content>K</Kbd.Content>
      </Kbd>
    </div>
  );

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-separator bg-background/70 backdrop-blur-lg">
      <header className="flex h-16 items-center justify-between px-6 max-w-6xl mx-auto">
        {/* Logo */}
        <RouterLink
          className="flex justify-start items-center gap-1 text-foreground hover:opacity-80 transition-opacity shrink-0"
          to="/"
        >
          <Logo />
          <p className="font-bold text-inherit">Fufuni</p>
        </RouterLink>

        {/* Desktop Navigation */}
        <ul className="hidden lg:flex gap-4 justify-start items-center ml-2">
          {siteConfig().navItems.filter(item => !item.permissions || item.permissions.length === 0).map((item) => (
            <li key={item.href}>
              <RouterLink
                className={clsx(
                  "text-foreground hover:opacity-80 transition-opacity",
                  "data-[active=true]:text-primary data-[active=true]:font-medium",
                )}
                to={item.href}
              >
                {item.label}
              </RouterLink>
            </li>
          ))}
          {!isAuthenticated && (
            <li>
              <Button onPress={modalState.open}>
                {t('log-in')}
              </Button>
            </li>
          )}
          <LoginModal isOpen={modalState.isOpen} onClose={() => modalState.setOpen(false)} />
          <AuthenticationGuardWithPermission permission="admin:store">
            <li>
              <Dropdown>
                <Dropdown.Trigger>
                  <Button
                    className="p-0 bg-transparent data-[hover=true]:bg-transparent"
                    variant="tertiary"
                  >
                    {t("nav-admin")}
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </Dropdown.Trigger>
                <Dropdown.Popover>
                  <Dropdown.Menu
                    aria-label="Admin actions"
                    className="w-85"
                  >
                    {siteConfig().navItems.filter(item => item.permissions && item.permissions.includes("admin:store")).map((item) => (
                      <Dropdown.Item
                        key={item.href}
                        id={item.href}
                        textValue={item.label}
                        className="gap-4"
                        onPress={() => navigate(item.href)}
                      >
                        <div className="flex gap-4 w-full items-center">
                          <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                          <div className="flex flex-col flex-1">
                            <Label>{item.label}</Label>
                            <p className="text-xs text-default-400">{item.href}</p>
                          </div>
                        </div>
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            </li>
          </AuthenticationGuardWithPermission>
        </ul>

        {/* Desktop Right Items */}
        <ul className="hidden sm:flex gap-2 items-center ml-auto">
          <li className="hidden sm:flex gap-2 items-center">
            <UserListsMenu />
            <RouterLink
              to="/cart"
              className="relative text-foreground hover:opacity-80 transition-opacity"
            >
              <ShoppingCart size={20} />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-danger text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                  {cartCount}
                </span>
              )}
            </RouterLink>
            <a
              href={siteConfig().links.twitter}
              target="_blank"
              rel="noopener noreferrer"
              title={t("twitter")}
              className="text-foreground hover:opacity-80 transition-opacity"
            >
              <TwitterIcon className="text-default-500" />
            </a>
            <a
              href={siteConfig().links.discord}
              target="_blank"
              rel="noopener noreferrer"
              title={t("discord")}
              className="text-foreground hover:opacity-80 transition-opacity"
            >
              <DiscordIcon className="text-default-500" />
            </a>
            <a
              href={siteConfig().links.github}
              target="_blank"
              rel="noopener noreferrer"
              title={t("github")}
              className="text-foreground hover:opacity-80 transition-opacity"
            >
              <GithubIcon className="text-default-500" />
            </a>
            <ThemeSwitch />
            <LanguageSwitch
              availableLanguages={availableLanguages}
              icon={I18nIcon}
            />
          </li>
          <li className="hidden lg:flex">{searchInput}</li>
          <li className="hidden md:flex">
            <a
              href={siteConfig().links.sponsor}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-normal text-default-600 bg-default-100 px-2 py-1 rounded hover:opacity-80 transition-opacity inline-flex items-center gap-2"
            >
              <HeartFilledIcon className="text-danger" />
              <Trans i18nKey="sponsor" />
            </a>
          </li>
        </ul>

        {/* Mobile Menu Icon */}
        <div className="sm:hidden flex gap-2 items-center ml-auto">
          <a
            href={siteConfig().links.github}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:opacity-80 transition-opacity"
          >
            <GithubIcon className="text-default-500" />
          </a>
          <ThemeSwitch />
          <Button
            isIconOnly
            className="text-current"
            onPress={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            variant="ghost"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </Button>
        </div>
      </header>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="sm:hidden border-t border-separator bg-background">
          <div className="p-4 space-y-4">
            {searchInput}
            <LanguageSwitch
              availableLanguages={availableLanguages}
              icon={I18nIcon}
            />
            <div className="flex flex-col gap-2">
              {siteConfig().navMenuItems.map((item, index) => (
                <div key={`${item}-${index}`}>
                  {item.permissions && item.permissions.length > 0 ? (
                    <AuthenticationGuardWithPermission
                      permission={item.permissions[0]}
                    >
                      <RouterLink
                        to={item.href}
                        className={clsx(
                          "block text-lg hover:opacity-80 transition-opacity py-2",
                          index === 2
                            ? "text-accent-600 font-semibold"
                            : index === siteConfig().navMenuItems.length - 1
                              ? "text-danger"
                              : "text-foreground"
                        )}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {item.label}
                      </RouterLink>
                    </AuthenticationGuardWithPermission>
                  ) : (
                    <RouterLink
                      to={item.href}
                      className={clsx(
                        "block text-lg hover:opacity-80 transition-opacity py-2",
                        index === 2
                          ? "text-accent-600 font-semibold"
                          : index === siteConfig().navMenuItems.length - 1
                            ? "text-danger"
                            : "text-foreground"
                      )}
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {item.label}
                    </RouterLink>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};
