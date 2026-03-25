/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Button,
  Card,
  CardBody,
  Divider,
  Avatar,
  Link as HeroUILink,
} from "@heroui/react";

import { useAuth } from "../../authentication/providers/use-auth";

import DefaultLayout from "@/layouts/default";

/**
 * Shared layout for all /account/* pages with modernized design.
 * Features responsive sidebar with smooth navigation and user profile section.
 */
export default function AccountLayout() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { user, logout } = auth as any;
  const location = useLocation();

  const navLinks = [
    { to: "/account", label: t("account-dashboard"), icon: "", end: true },
    { to: "/account/orders", label: t("account-orders"), icon: "" },
    { to: "/account/addresses", label: t("account-addresses"), icon: "" },
    {
      to: "/account/preferences",
      label: t("account-preferences"),
      icon: "",
    },
  ];

  const handleLogout = async () => {
    await logout();
  };

  const isCurrentPage = (path: string, end: boolean = false) => {
    if (end) {
      return location.pathname === path;
    }

    return location.pathname.startsWith(path);
  };

  return (
    <DefaultLayout>
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Navigation */}
        <aside className="w-full lg:w-64">
          <Card className="sticky top-6 border border-default-200">
            {/* User Profile Section */}
            <CardBody className="gap-4 py-6">
              <div className="flex items-center gap-4">
                <Avatar
                  isBordered
                  color="primary"
                  name={user?.name || user?.email || "User"}
                  radius="lg"
                  size="lg"
                />
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-bold truncate">
                    {user?.name || user?.email || "Account"}
                  </h2>
                  <p className="text-xs text-default-500 truncate">
                    {user?.email}
                  </p>
                </div>
              </div>

              <Divider className="my-2" />

              {/* Navigation Links */}
              <nav className="flex flex-col gap-2">
                {navLinks.map((link) => {
                  const isActive = isCurrentPage(link.to, link.end);

                  return (
                    <HeroUILink
                      key={link.to}
                      className={`
                        px-4 py-3 rounded-lg transition-all duration-200 font-medium
                        flex items-center gap-3 text-sm
                        ${
                          isActive
                            ? "bg-primary text-primary-foreground shadow-lg"
                            : "text-default-700 hover:bg-default-200 active:bg-default-300"
                        }
                      `}
                      color={isActive ? "primary" : "foreground"}
                      href={link.to}
                    >
                      <span className="text-lg">{link.icon}</span>
                      {link.label}
                    </HeroUILink>
                  );
                })}
              </nav>

              <Divider className="my-2" />

              {/* Logout Button */}
              <Button
                className="w-full font-semibold"
                color="danger"
                variant="light"
                onPress={handleLogout}
              >
                {t("account-logout")}
              </Button>
            </CardBody>
          </Card>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </DefaultLayout>
  );
}
