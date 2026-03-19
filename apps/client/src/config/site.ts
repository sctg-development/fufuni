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

export type SiteConfig = typeof siteConfig;

import i18next from "../i18n";

export const siteConfig = () => ({
  name: i18next.t("vite-heroui"),
  needCookieConsent: true, // Set to false if you don't need cookie consent
  description: i18next.t(
    "make-beautiful-websites-regardless-of-your-design-experience",
  ),
  navItems: [
    {
      label: i18next.t("home"),
      href: "/",
      permissions: [], // No permissions required, visible to all
    },
    // admin pages - visible to all for now. guards can be handled on the page itself
    {
      label: i18next.t("admin-products-title"),
      href: "/admin/products",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-customers-title"),
      href: "/admin/customers",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-inventory-title"),
      href: "/admin/inventory",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-orders-title"),
      href: "/admin/orders",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-webhooks-title"),
      href: "/admin/webhooks",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-regions-title"),
      href: "/admin/regions",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-currencies-title"),
      href: "/admin/currencies",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-countries-title"),
      href: "/admin/countries",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-warehouses-title"),
      href: "/admin/warehouses",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-shipping-rates-title"),
      href: "/admin/shipping-rates",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-shipping-classes-title"),
      href: "/admin/shipping-classes",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
  ],
  navMenuItems: [
    {
      label: i18next.t("home"),
      href: "/",
      permissions: [], // No permissions required, visible to all
    },
    {
      label: i18next.t("admin-products-title"),
      href: "/admin/products",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-customers-title"),
      href: "/admin/customers",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-inventory-title"),
      href: "/admin/inventory",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-orders-title"),
      href: "/admin/orders",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-webhooks-title"),
      href: "/admin/webhooks",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-regions-title"),
      href: "/admin/regions",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-currencies-title"),
      href: "/admin/currencies",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-countries-title"),
      href: "/admin/countries",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-warehouses-title"),
      href: "/admin/warehouses",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-shipping-rates-title"),
      href: "/admin/shipping-rates",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
    {
      label: i18next.t("admin-shipping-classes-title"),
      href: "/admin/shipping-classes",
      permissions: ["admin:store"], // Only visible to users with "admin:store" permission
    },
  ],
  links: {
    github: "https://github.com/sctg-development/fufuni",
    twitter: "https://twitter.com/hero_ui",
    docs: "https://github.com/sctg-development/fufuni/blob/main/README.md",
    discord: "https://discord.gg/9b6yyZKmH4",
    sponsor: "https://github.com/sponsors/sctg-development",
  },
});
