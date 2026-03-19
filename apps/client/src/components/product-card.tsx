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

import React from "react";
import { useNavigate } from "react-router-dom";
import { button as buttonStyles } from "@heroui/theme";
import { StoreProduct } from "@/lib/store-api";
import { useTranslation } from "react-i18next";
import { useCart } from "@/hooks/useCart";
import { formatMoney } from "@/utils/currency";
import { resolveTitle } from "@/utils/description";

interface Props {
  product: StoreProduct;
  selectedSku?: string;
  onSelectVariant?: (productId: string, sku: string) => void;
}

export const ProductCard: React.FC<Props> = ({
  product,
  selectedSku,
  onSelectVariant,
}) => {
  const { t, i18n } = useTranslation();
  const { addItem } = useCart();
  const navigate = useNavigate();

  const displayTitle = resolveTitle(product.title, i18n.language);

  const variant =
    product.variants.find((v) => v.sku === selectedSku) ||
    product.variants[0];

  const currency = variant?.currency ?? "USD";
  const price = variant ? formatMoney(variant.price_cents, currency) : formatMoney(0, currency);

  const image =
    variant?.image_url || product.image_url ||
    "https://placehold.co/400x400/1a1a1a/666?text=No+Image";

  return (
    <div className="group">
      <div
        className="aspect-square bg-default-100 rounded-xl overflow-hidden mb-4 relative cursor-pointer"
        onClick={() => navigate(`/product/${product.id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            navigate(`/product/${product.id}`);
          }
        }}
      >
        <img
          src={image}
          alt={displayTitle}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) =>
          ((e.target as HTMLImageElement).src =
            "https://placehold.co/400x400/1a1a1a/666?text=No+Image")
          }
        />
        {product.variants.length > 1 && (
          <span className="absolute top-3 left-3 bg-black/70 text-white text-xs px-2 py-1 rounded">
            {product.variants.length} options
          </span>
        )}
      </div>
      <h3 className="font-medium text-default-900 mb-1">{displayTitle}</h3>
      <p className="text-default-500 text-sm mb-3">{price}</p>
      {product.variants.length > 1 && onSelectVariant && (
        <select
          value={selectedSku || variant.sku}
          onChange={(e) => onSelectVariant(product.id, e.target.value)}
          className="w-full bg-default-100 border border-default-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none"
        >
          {product.variants.map((v) => {
            const variantCurrency = v.currency ?? "USD";
            return (
              <option key={v.sku} value={v.sku}>
                {v.title} - {formatMoney(v.price_cents || 0, variantCurrency)}
              </option>
            );
          })}
        </select>
      )}
      <button
        onClick={() => {
          const sku = selectedSku || variant.sku;
          addItem({
            sku,
            title: `${displayTitle}${variant.title ? ` - ${variant.title}` : ""}`,
            price_cents: variant.price_cents,
            currency: variant.currency ?? "USD",
            image_url: variant.image_url || product.image_url,
            qty: 1,
          });
        }}
        className={buttonStyles({
          color: "primary",
          radius: "md",
        }) + " w-full"}
      >
        {t("add-to-cart")}
      </button>
    </div>
  );
};
