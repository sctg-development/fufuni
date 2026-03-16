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

import { useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { button as buttonStyles } from "@heroui/theme";
import { useTranslation } from "react-i18next";

import DefaultLayout from "@/layouts/default";
import { useCart } from "@/hooks/useCart";

export default function SuccessPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { clear } = useCart();

  useEffect(() => {
    // Clear local cart when landing on the success page
    clear();
  }, [clear]);

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

          <h1 className="text-3xl font-bold mb-4">
            {t("success")}
          </h1>

          <p className="text-default-400 mb-6">
            {t("checkout-success-message", "Thanks for your purchase. We've sent a confirmation email with your order details.")}
          </p>

          {sessionId ? (
            <div className="mb-6 p-4 bg-default-900 rounded-lg text-left">
              <p className="text-sm text-default-500">{t("checkout-session-id", "Session ID")}</p>
              <p className="text-sm font-mono break-all text-default-200">{sessionId}</p>
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              className={buttonStyles({ color: "primary", radius: "full" })}
              to="/"
            >
              {t("continue-shopping", "Continue shopping")}
            </Link>
            <Link
              className={buttonStyles({ variant: "bordered", radius: "full" })}
              to="/cart"
            >
              {t("view-cart", "View cart")}
            </Link>
          </div>
        </div>
      </div>
    </DefaultLayout>
  );
}
