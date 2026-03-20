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

import React, { useState } from "react";
import { button as buttonStyles } from "@heroui/theme";
import { StoreProduct } from "@/lib/store-api";
import { useTranslation } from "react-i18next";
import { useCart } from "@/hooks/useCart";
import { formatMoney } from "@/utils/currency";
import { resolveDescription, resolveTitle, resolveVendor, resolveTags, resolveHandle, getTaxNameForLocale } from "@/utils/description";
import { Button } from "@heroui/button";

interface Props {
  product: StoreProduct;
}

/**
 * Full product card component with rich HTML description.
 * Displays product details, variants, and localized description content.
 * Manages variant selection through local state.
 */
export const ProductCardFull: React.FC<Props> = ({ product }) => {
  const { t, i18n } = useTranslation();
  const { addItem } = useCart();

  // Local state for managing variant selection
  const [selectedSku, setSelectedSku] = useState<string>(
    product.variants[0]?.sku || ""
  );

  const variant =
    product.variants.find((v) => v.sku === selectedSku) ||
    product.variants[0];

  const currency = variant?.currency ?? "USD";
  const price = variant ? formatMoney(variant.price_cents, currency) : formatMoney(0, currency);
  const comparePrice = variant?.compare_at_price_cents
    ? formatMoney(variant.compare_at_price_cents, currency)
    : null;

  const vendor = resolveVendor(product.vendor ?? "", i18n.language);
  const tagsRaw = Array.isArray(product.tags) ? product.tags.join(",") : product.tags ?? "";
  const tags = resolveTags(tagsRaw, i18n.language)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const handle = resolveHandle(product.handle ?? "", i18n.language);

  const image =
    variant?.image_url || product.image_url ||
    "https://placehold.co/400x400/1a1a1a/666?text=No+Image";

  // Resolve description for current locale
  const descriptionHtml = resolveDescription(
    product.description ?? '',
    i18n.language
  );

  // Resolve title for current locale
  const displayTitle = resolveTitle(product.title, i18n.language);

  const taxRate = variant?.tax_rate_percentage ?? 0;
  const taxInclusive = !!variant?.tax_inclusive;
  const taxDisplayName = variant?.tax_display_name
    ? getTaxNameForLocale(variant.tax_display_name, i18n.language)
    : "";

  // User request: when tax_inclusive true, treat base price as composable with tax (59.99 * 20% = 12.00)
  // (Previous behavior computed reverse-inclusive portion as 10.00 for 59.99@20%)
  const taxAmountCents =
    variant && taxRate > 0
      ? Math.round(variant.price_cents * (taxRate / 100))
      : null;

  const taxAmount =
    taxAmountCents !== null && taxAmountCents !== undefined
      ? formatMoney(taxAmountCents, currency)
      : null;

  const resolvedTaxName = taxDisplayName || t("product-card-tax-default");
  const taxLabel = taxInclusive
    ? t("product-card-tax-included", { name: resolvedTaxName })
    : t("product-card-tax", { name: resolvedTaxName });

  /**
   * Handle variant selection and update state
   */
  const handleVariantChange = (sku: string) => {
    setSelectedSku(sku);
  };

  return (
    <div className="group">
      <div className="aspect-square bg-default-100 rounded-xl overflow-hidden mb-4 relative">
        <img
          src={image}
          alt={product.title}
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

      <h3 className="font-medium text-default-900 mb-2">{displayTitle}</h3>

      {vendor && (
        <p className="text-xs text-default-500 mb-1">
          {t("vendor")}: {vendor}
        </p>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-default-200 px-2 py-1 text-[11px] font-semibold text-default-700"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {handle && (
        <p className="text-xs text-default-400 mb-2">
          {t("handle")}: {handle}
        </p>
      )}

      {/* Rich description section */}
      {descriptionHtml && (
        <div
          className="prose prose-sm max-w-none mb-4 text-default-700"
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
        />
      )}

      <p className="text-default-500 text-sm mb-2 font-semibold">
        {price}
        {comparePrice && (
          <span className="ml-2 text-default-400 line-through">{comparePrice}</span>
        )}
      </p>

      {/* Variants selection */}
      {product.variants.length > 1 && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-default-700 mb-2">
            {t("admin-products-field-variant-title", "Variant")}
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {product.variants.map((v) => {
              const isSelected = selectedSku === v.sku;
              return (
                <Button
                  key={v.sku}
                  size="sm"
                  variant={isSelected ? "solid" : "bordered"}
                  color={isSelected ? "primary" : "default"}
                  onPress={() => handleVariantChange(v.sku)}
                  className="text-xs"
                >
                  {v.title}
                </Button>
              );
            })}
          </div>
          {/* Alternative: Dropdown selector (hidden on small screens in favor of buttons) */}
          <select
            value={selectedSku}
            onChange={(e) => handleVariantChange(e.target.value)}
            className="hidden md:block w-full bg-default-100 border border-default-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
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
        </div>
      )}

      {/* Variant details (optional enrichment fields) */}
      {(variant?.barcode || variant?.tax_code || taxAmount || variant?.requires_shipping !== undefined) && (
        <div className="mb-4 text-xs text-default-600">
          {variant?.barcode && (
            <p>
              <span className="font-semibold">{t("barcode")}:</span> {variant.barcode}
            </p>
          )}
          {taxAmount ? (
            <p>
              <span className="font-semibold">{taxLabel}:</span> {taxAmount}
            </p>
          ) : (
            variant?.tax_code && (
              <p>
                <span className="font-semibold">{t("tax-code")}:</span> {variant.tax_code}
              </p>
            )
          )}
          {variant?.requires_shipping !== undefined && (
            <p>
              <span className="font-semibold">{t("requires-shipping")}:</span>{' '}
              {variant.requires_shipping ? t("yes") : t("no")}
            </p>
          )}
        </div>
      )}

      {/* Add to cart button */}
      <button
        onClick={() => {
          addItem({
            sku: selectedSku,
            title: `${product.title}${variant.title ? ` - ${variant.title}` : ""}`,
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
