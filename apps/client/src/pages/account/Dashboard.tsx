/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  Spinner,
  Button,
  Tabs,
  Avatar,
  Chip,
  Separator,
  Link as HeroUILink,
} from "@heroui/react";
import { Link } from "react-router-dom";

import { useAuth } from "../../authentication/providers/use-auth";

import { useWishlist } from "@/hooks/useWishlist";
import { useSavedCarts } from "@/hooks/useSavedCarts";
import { SavedCartsManager } from "@/components/saved-carts-manager";
import { WishlistManager } from "@/components/wishlist-manager";
import { formatMoney } from "@/utils/currency";

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
 * Modern e-commerce customer dashboard.
 * Features: Profile summary, saved carts, wishlist, recent orders, quick actions.
 */
export default function Dashboard() {
  const { t } = useTranslation();
  const auth = useAuth() as any;
  const { wishlist } = useWishlist();
  const { savedCarts } = useSavedCarts();

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState("overview");

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

  const displayName = useMemo(() => {
    if (!profile) return "";

    return profile.name && !profile.name.endsWith("@auth0.local")
      ? profile.name
      : profile.email;
  }, [profile]);

  const savedCartsCount = useMemo(() => {
    return savedCarts.length;
  }, [savedCarts]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="flex flex-col items-center gap-2">
          <Spinner size="lg" />
          <span className="text-default-500">{t("loading")}</span>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <Card className="border-danger-200 bg-danger-50">
        <Card.Content className="text-danger-700">{t("account-error")}</Card.Content>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-linear-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar
              className="border-2 border-blue-400"
              color="default"
              size="lg"
            >
              {displayName.charAt(0).toUpperCase()}
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold text-default-900">
                {t("account-welcome")}, {displayName}
              </h1>
              <p className="text-default-500 mt-1">{profile.email}</p>
            </div>
          </div>
          <Link to="/account/preferences">
            <Button
              className="md:self-start"
              size="lg"
              variant="primary"
            >
              {t("account-edit")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Orders */}
        <Card className="bg-linear-to-br from-blue-500/10 to-blue-600/10 border border-blue-200">
          <Card.Content className="pb-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-default-500 font-medium">
                  {t("account-total-orders")}
                </p>
                <p className="text-4xl font-bold text-blue-600 mt-2">
                  {profile.order_count}
                </p>
                <Chip className="mt-3" color="accent" size="sm" variant="tertiary">
                  {t("account-orders-count", { count: profile.order_count })}
                </Chip>
              </div>
            </div>
          </Card.Content>
        </Card>

        {/* Total Spent */}
        <Card className="bg-linear-to-br from-green-500/10 to-green-600/10 border border-green-200">
          <Card.Content className="pb-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-default-500 font-medium">
                  {t("account-total-spent")}
                </p>
                <p className="text-3xl font-bold text-green-600 mt-2">
                  {formatMoney(profile ? profile.total_spent_cents : 0, "")}
                </p>
              </div>
              <Chip
                className="font-semibold"
                color="success"
                size="lg"
                variant="tertiary"
              >
                {t("account-total-spent-status")}
              </Chip>
            </div>
          </Card.Content>
        </Card>

        {/* Saved Carts */}
        <Card
          
          className="bg-linear-to-br from-purple-500/10 to-purple-600/10 border border-purple-200 cursor-pointer hover:border-purple-400 transition-colors"
          onClick={() => setSelectedTab("saved-carts")}
        >
          <Card.Content className="pb-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-default-500 font-medium">
                  {t("account-saved-carts", { count: savedCartsCount })}
                </p>
                <p className="text-4xl font-bold text-purple-600 mt-2">
                  {savedCartsCount}
                </p>
                <Chip
                  className="mt-3"
                  color="default"
                  size="sm"
                  variant="tertiary"
                >
                  {t("account-saved-carts-count", { count: savedCartsCount })}
                </Chip>
              </div>
            </div>
          </Card.Content>
        </Card>

        {/* Wishlist */}
        <Card
          
          className="bg-linear-to-br from-pink-500/10 to-pink-600/10 border border-pink-200 cursor-pointer hover:border-pink-400 transition-colors"
          onClick={() => setSelectedTab("wishlist")}
        >
          <Card.Content className="pb-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-default-500 font-medium">
                  {t("account-wishlist", { count: wishlist.length })}
                </p>
                <p className="text-4xl font-bold text-pink-600 mt-2">
                  {wishlist.length}
                </p>
                <Chip className="mt-3" color="danger" size="sm" variant="tertiary">
                  {t("account-wishlist-count", { count: wishlist.length })}
                </Chip>
              </div>
            </div>
          </Card.Content>
        </Card>
      </div>

      {/* Tabbed Content Area */}
      <Card className="border border-default-200">
        <Card.Content className="p-0">
          <Tabs
            aria-label={t("account-dashboard-tabs")}
            selectedKey={selectedTab}
            onSelectionChange={(key) => setSelectedTab(key as string)}
          >
            <Tabs.ListContainer>
              <Tabs.List className="grid w-full grid-cols-1 md:grid-cols-4">
                <Tabs.Tab id="overview" className="text-center font-semibold">
                  {t("account-overview")}
                  <Tabs.Indicator />
                </Tabs.Tab>

                <Tabs.Tab id="saved-carts" className="text-center font-semibold">
                  {t("account-saved-carts-tab", { count: savedCartsCount })}
                  <Tabs.Indicator />
                </Tabs.Tab>

                <Tabs.Tab id="wishlist" className="text-center font-semibold">
                  {t("account-wishlist-tab", { count: wishlist.length })}
                  <Tabs.Indicator />
                </Tabs.Tab>

                <Tabs.Tab id="recent-orders" className="text-center font-semibold">
                  {t("account-recent-orders-tab", { count: profile.order_count })}
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>

            {/* Overview Panel */}
            <Tabs.Panel id="overview">
              <div className="space-y-6 py-6 px-6">
                {/* Last Order Card */}
                <Card className="border border-default-100">
                  <Card.Header className="flex gap-3 items-center">
                    <div className="flex flex-col">
                      <p className="text-lg font-semibold">
                        {t("account-last-order")}
                      </p>
                    </div>
                  </Card.Header>
                  <Separator />
                  <Card.Content>
                    {profile.order_count === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-default-500 text-lg">
                          {t("account-no-orders")}
                        </p>
                        <Link to="/">
                          <Button
                            className="mt-4"
                            variant="primary"
                          >
                            {t("start-shopping")}
                          </Button>
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-default-600">{t("date")}:</span>
                          <span className="font-semibold text-default-900">
                            {profile.last_order_at
                              ? new Date(
                                  profile.last_order_at,
                                ).toLocaleDateString(undefined, {
                                  year: "numeric",
                                  month: "long",
                                  day: "numeric",
                                })
                              : t("not-available")}
                          </span>
                        </div>
                        <Link to="/account/orders">
                          <Button
                            className="w-full mt-4"
                            variant="tertiary"
                          >
                            {t("account-view-all")}
                          </Button>
                        </Link>
                      </div>
                    )}
                  </Card.Content>
                </Card>

                {/* Quick Links */}
                <Card className="border border-default-100">
                  <Card.Header>
                    <p className="text-lg font-semibold">
                      {t("quick-actions")}
                    </p>
                  </Card.Header>
                  <Separator />
                  <Card.Content>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Link to="/account/orders">
                        <Button className="w-full" variant="primary">
                          {t("account-orders")}
                        </Button>
                      </Link>
                      <Link to="/account/addresses">
                        <Button className="w-full" variant="primary">
                          {t("account-addresses")}
                        </Button>
                      </Link>
                      <Link to="/account/preferences">
                        <Button className="w-full" variant="primary">
                          {t("account-preferences")}
                        </Button>
                      </Link>
                      <Link to="/">
                        <Button className="w-full" variant="primary">
                          {t("continue-shopping")}
                        </Button>
                      </Link>
                    </div>
                  </Card.Content>
                </Card>
              </div>
            </Tabs.Panel>

            {/* Saved Carts Panel */}
            <Tabs.Panel id="saved-carts">
              <div className="py-6 px-6">
                <SavedCartsManager />
              </div>
            </Tabs.Panel>

            {/* Wishlist Panel */}
            <Tabs.Panel id="wishlist">
              <div className="py-6 px-6">
                <WishlistManager />
              </div>
            </Tabs.Panel>

            {/* Recent Orders Panel */}
            <Tabs.Panel id="recent-orders">
              <div className="py-6 px-6">
                {profile.order_count === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-default-500 text-lg mb-4">
                      {t("account-no-orders")}
                    </p>
                    <Link to="/">
                      <Button variant="primary">
                        {t("start-shopping")}
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-default-500 mb-4">
                      {t("account-orders-summary-info")}
                    </p>
                    <Link to="/account/orders">
                      <Button className="w-full" variant="primary">
                        {t("account-view-all")}
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </Tabs.Panel>
          </Tabs>
        </Card.Content>
      </Card>

      {/* Bottom Info */}
      <Card className="bg-default-50 border border-default-200">
        <Card.Content className="py-4">
          <p className="text-sm text-default-500 text-center">
            {t("account-help-text")} &nbsp;
            <HeroUILink className="font-semibold text-blue-600" href="#">
              {t("help-center")}
            </HeroUILink>
          </p>
        </Card.Content>
      </Card>
    </div>
  );
}
