/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardBody, CardHeader, Spinner, Button } from "@heroui/react";
import { Link } from "react-router-dom";

import { useAuth } from "../../authentication/providers/use-auth";

interface CustomerProfile {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  locale: string | null;
  accepts_marketing: number;
  order_count: number;
  total_spent_cents: number;
  last_order_at: string | null;
}

/**
 * Customer account dashboard page.
 * Displays profile summary and quick links to orders, addresses, etc.
 */
export default function Dashboard() {
  const { t } = useTranslation();
  const auth = useAuth() as any;
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const apiBase =
    import.meta.env.VITE_API_BASE_URL || import.meta.env.API_BASE_URL;

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const url = `${apiBase}/v1/me/profile`;
        const result = await auth.getJson(url);

        setProfile(result);
      } catch (error) {
        console.error("Error fetching profile:", error);
      } finally {
        setLoading(false);
      }
    };

    if (auth?.getJson) {
      fetchProfile();
    }
  }, [auth, apiBase]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner label={t("loading", "Loading...")} />
      </div>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardBody>{t("account-error", "Failed to load profile")}</CardBody>
      </Card>
    );
  }

  const totalSpentUSD = (profile.total_spent_cents / 100).toFixed(2);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          {t("account-welcome", "Welcome")}, {profile.name || profile.email}
        </h1>
      </div>

      {/* Profile Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex gap-3">
            <div className="flex flex-col">
              <p className="text-lg font-bold">{profile.order_count}</p>
              <p className="text-gray-500">
                {t("account-total-orders", "Total Orders")}
              </p>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="flex gap-3">
            <div className="flex flex-col">
              <p className="text-lg font-bold">${totalSpentUSD}</p>
              <p className="text-gray-500">
                {t("account-total-spent", "Total Spent")}
              </p>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="flex gap-3">
            <div className="flex flex-col">
              <p className="text-lg font-bold">{profile.email}</p>
              <p className="text-gray-500">{t("account-email", "Email")}</p>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex gap-3 justify-between">
            <h2 className="text-lg font-semibold">
              {t("account-recent-orders", "Recent Orders")}
            </h2>
            <Link to="/account/orders">
              <Button size="sm" variant="light">
                {t("account-view-all", "View All")}
              </Button>
            </Link>
          </CardHeader>
          <CardBody>
            {profile.order_count === 0 ? (
              <p className="text-gray-500">
                {t("account-no-orders", "No orders yet")}
              </p>
            ) : (
              <p>
                {t("account-last-order", "Last order")}:{" "}
                {profile.last_order_at
                  ? new Date(profile.last_order_at).toLocaleDateString()
                  : "N/A"}
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex gap-3 justify-between">
            <h2 className="text-lg font-semibold">
              {t("account-profile", "Profile")}
            </h2>
            <Link to="/account/preferences">
              <Button size="sm" variant="light">
                {t("account-edit", "Edit")}
              </Button>
            </Link>
          </CardHeader>
          <CardBody>
            <p>
              <strong>{t("account-name", "Name")}:</strong>{" "}
              {profile.name || t("account-not-set", "Not set")}
            </p>
            <p>
              <strong>{t("account-phone", "Phone")}:</strong>{" "}
              {profile.phone || t("account-not-set", "Not set")}
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
