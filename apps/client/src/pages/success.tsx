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

import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { button as buttonStyles } from "@heroui/react";
import { useTranslation } from "react-i18next";

import DefaultLayout from "@/layouts/default";
import { useCart } from "@/hooks/useCart";
import { resolveTaxName } from "@/utils/description";

// Shape of the order returned by GET /v1/orders/lookup
interface OrderDetails {
  number: string;
  status: string;
  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  shipping_cents: number;
  total_cents: number;
  created_at: string;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  taxes?: { name: string; amount_cents: number }[];
  items: { sku: string; title: string; qty: number; unit_price_cents: number }[];
}

// Format a price in cents to a localized string, e.g. 2999 → "29,99 EUR"
function formatPrice(cents: number, currency: string, locale: string = "en-US") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

// Format a date string
function formatDate(dateStr: string, locale: string = "en-US") {
  try {
    return new Date(dateStr).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function SuccessPage() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { clear } = useCart();

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Clear local cart when landing on the success page
    clear();
  }, [clear]);

  useEffect(() => {
    if (!sessionId) return;

    setLoading(true);
    setError(null);

    // Call the public lookup endpoint — no auth token needed
    const merchantAPI = import.meta.env.API_BASE_URL || "http://localhost:8787";
    fetch(`${merchantAPI}/v1/orders/lookup?session_id=${encodeURIComponent(sessionId)}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.status === 404 ? "Order not found" : "Failed to load order");
        }
        return res.json();
      })
      .then((data) => setOrder(data))
      .catch((err) => {
        console.error("Failed to load order details:", err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (!sessionId) {
    // User arrived on /success without a session_id — generic message
    return (
      <DefaultLayout>
        <div className="max-w-3xl mx-auto py-12 px-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/10 rounded-full mb-6">
              <svg
                className="w-10 h-10 text-green-500"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 className="text-3xl font-bold mb-4">{t("success")}</h1>
            <p className="text-default-400 mb-8">
              {t("checkout-success-message")}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link className={buttonStyles({ color: "primary", radius: "full" })} to="/">
                {t("continue-shopping")}
              </Link>
              <Link className={buttonStyles({ variant: "bordered", radius: "full" })} to="/cart">
                {t("view-cart")}
              </Link>
            </div>
          </div>
        </div>
      </DefaultLayout>
    );
  }

  if (loading) {
    return (
      <DefaultLayout>
        <div className="max-w-3xl mx-auto py-12 px-6 text-center">
          <p className="text-default-500">{t("loading")}</p>
        </div>
      </DefaultLayout>
    );
  }

  if (error || !order) {
    return (
      <DefaultLayout>
        <div className="max-w-3xl mx-auto py-12 px-6 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/10 rounded-full mb-6">
            <svg
              className="w-10 h-10 text-green-500"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-4">{t("success")}</h1>
          <p className="text-default-400 mb-8">
            {t("checkout-success-message")}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link className={buttonStyles({ color: "primary", radius: "full" })} to="/">
              {t("continue-shopping")}
            </Link>
            <Link className={buttonStyles({ variant: "bordered", radius: "full" })} to="/cart">
              {t("view-cart")}
            </Link>
          </div>
        </div>
      </DefaultLayout>
    );
  }

  // Translate order status
  const statusLabels: Record<string, string> = {
    pending: t("status-pending"),
    paid: t("status-paid"),
    processing: t("status-processing"),
    shipped: t("status-shipped"),
    delivered: t("status-delivered"),
    refunded: t("status-refunded"),
    canceled: t("status-canceled"),
  };

  return (
    <DefaultLayout>
      <div className="max-w-2xl mx-auto py-12 px-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/10 rounded-full mb-6">
            <svg
              className="w-10 h-10 text-green-500"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-2">{t("order-confirmed")}</h1>
          <p className="text-default-500">
            {t("order-number")}<strong>{order.number}</strong>
          </p>
          <p className="text-sm text-default-400 mt-1">{formatDate(order.created_at, i18n.language)}</p>
        </div>

        {/* Status Badge */}
        <div className="bg-default-100 rounded-lg p-4 mb-6 flex items-center justify-between">
          <span className="text-sm font-medium text-default-600">{t("status")}</span>
          <span className="bg-success-100 text-success-700 text-xs font-semibold px-3 py-1 rounded-full">
            {statusLabels[order.status] ?? order.status}
          </span>
        </div>

        {/* Items */}
        <div className="border border-default-200 rounded-lg divide-y mb-6">
          {order.items.map((item) => (
            <div key={item.sku} className="flex justify-between items-center p-4">
              <div>
                <p className="font-medium text-sm">{item.title}</p>
                <p className="text-xs text-default-400">{t("qty")}: {item.qty}</p>
              </div>
              <p className="font-medium text-sm">
                {formatPrice(item.unit_price_cents * item.qty, order.currency, i18n.language)}
              </p>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="bg-default-50 rounded-lg p-4 space-y-2 text-sm mb-6">
          <div className="flex justify-between">
            <span className="text-default-600">{t("subtotal")}</span>
            <span>{formatPrice(order.subtotal_cents, order.currency, i18n.language)}</span>
          </div>
          {order.discount_cents > 0 && (
            <div className="flex justify-between text-success-600">
              <span>{t("discount")}</span>
              <span>−{formatPrice(order.discount_cents, order.currency, i18n.language)}</span>
            </div>
          )}
          {order.taxes && order.taxes.length > 0 ? (
            order.taxes.map((tax, index) => (
              <div key={index} className="flex justify-between">
                <span className="text-default-600">{resolveTaxName(tax.name, i18n.language)}</span>
                <span>{formatPrice(tax.amount_cents, order.currency, i18n.language)}</span>
              </div>
            ))
          ) : order.tax_cents > 0 ? (
            <div className="flex justify-between">
              <span className="text-default-600">{t("tax")}</span>
              <span>{formatPrice(order.tax_cents, order.currency, i18n.language)}</span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span className="text-default-600">{t("shipping")}</span>
            <span>{formatPrice(order.shipping_cents, order.currency, i18n.language)}</span>
          </div>
          <div className="flex justify-between font-bold text-base pt-2 border-t border-default-200">
            <span>{t("total")}</span>
            <span>{formatPrice(order.total_cents, order.currency, i18n.language)}</span>
          </div>
        </div>

        {/* Tracking (if available) */}
        {order.tracking_number && (
          <div className="bg-primary-50 rounded-lg p-4 mb-6">
            <p className="font-medium text-sm mb-1">{t("tracking")}</p>
            <p className="text-xs text-default-500 mb-2">{t("tracking-number")} {order.tracking_number}</p>
            {order.shipped_at && (
              <p className="text-xs text-default-400 mb-2">
                {t("shipped-on")} {formatDate(order.shipped_at, i18n.language)}
              </p>
            )}
            {order.tracking_url && (
              <a
                href={order.tracking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-xs underline"
              >
                {t("track-on-carrier")} →
              </a>
            )}
          </div>
        )}

        {/* Message */}
        <p className="text-center text-xs text-default-400 mb-8">
          {t("confirmation-email-sent")}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link className={buttonStyles({ color: "primary", radius: "full" })} to="/">
            {t("continue-shopping")}
          </Link>
          <Link className={buttonStyles({ variant: "bordered", radius: "full" })} to="/cart">
            {t("view-cart")}
          </Link>
        </div>
      </div>
    </DefaultLayout>
  );
}
