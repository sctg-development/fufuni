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
    },
    // {
    //   label: i18next.t("api"),
    //   href: "/api",
    // },
    // {
    //   label: i18next.t("pricing"),
    //   href: "/pricing",
    // },
    // {
    //   label: i18next.t("blog"),
    //   href: "/blog",
    // },
    // {
    //   label: i18next.t("about"),
    //   href: "/about",
    // },

    // admin pages - visible to all for now. guards can be handled on the page itself
    {
      label: i18next.t("admin-products-title"),
      href: "/admin/products",
    },
    {
      label: i18next.t("admin-customers-title"),
      href: "/admin/customers",
    },
    {
      label: i18next.t("admin-inventory-title"),
      href: "/admin/inventory",
    },
    {
      label: i18next.t("admin-orders-title"),
      href: "/admin/orders",
    },
    {
      label: i18next.t("admin-webhooks-title"),
      href: "/admin/webhooks",
    },
  ],
  navMenuItems: [
    {
      label: i18next.t("home"),
      href: "/",
    },
    {
      label: i18next.t("api"),
      href: "/api",
    },
    {
      label: i18next.t("pricing"),
      href: "/pricing",
    },
    {
      label: i18next.t("blog"),
      href: "/blog",
    },
    {
      label: i18next.t("about"),
      href: "/about",
    },
    {
      label: i18next.t("admin-products-title"),
      href: "/admin/products",
    },
    {
      label: i18next.t("admin-customers-title"),
      href: "/admin/customers",
    },
    {
      label: i18next.t("admin-inventory-title"),
      href: "/admin/inventory",
    },
    {
      label: i18next.t("admin-orders-title"),
      href: "/admin/orders",
    },
    {
      label: i18next.t("admin-webhooks-title"),
      href: "/admin/webhooks",
    },
  ],
  links: {
    github:
      "https://github.com/sctg-development/fufuni",
    twitter: "https://twitter.com/hero_ui",
    docs: "https://github.com/sctg-development/fufuni/blob/main/README.md",
    discord: "https://discord.gg/9b6yyZKmH4",
    sponsor: "https://github.com/sponsors/sctg-development",
  },
});
