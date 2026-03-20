/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { Outlet, NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@heroui/react";

import { useAuth } from "../../authentication/providers/use-auth";

/**
 * Shared layout for all /account/* pages.
 * Shows a sidebar navigation and wraps child routes via <Outlet />.
 */
export default function AccountLayout() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { user, logout } = auth as any;

  const navLinks = [
    { to: "/account", label: t("account-dashboard"), end: true },
    { to: "/account/orders", label: t("account-orders") },
    { to: "/account/addresses", label: t("account-addresses") },
    {
      to: "/account/preferences",
      label: t("account-preferences"),
    },
  ];

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 p-6 max-w-6xl mx-auto">
      {/* Sidebar Navigation */}
      <nav className="w-full md:w-48 flex flex-col gap-2">
        <div className="mb-4">
          <h2 className="text-lg font-bold">
            {user?.name || user?.email || "Account"}
          </h2>
          <p className="text-sm text-gray-500">{user?.email}</p>
        </div>

        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            className={({ isActive }) =>
              `px-3 py-2 rounded-lg transition ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`
            }
            end={link.end}
            to={link.to}
          >
            {link.label}
          </NavLink>
        ))}

        <hr className="my-4" />

        <Button
          className="w-full"
          color="danger"
          size="sm"
          variant="flat"
          onClick={handleLogout}
        >
          {t("account-logout")}
        </Button>
      </nav>

      {/* Main Content */}
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
