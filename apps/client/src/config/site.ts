/**
 * MIT License
 *
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
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
