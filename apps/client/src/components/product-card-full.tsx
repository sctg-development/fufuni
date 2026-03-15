import React, { useState } from "react";
import { button as buttonStyles } from "@heroui/theme";
import { StoreProduct } from "@/lib/store-api";
import { useTranslation } from "react-i18next";
import { useCart } from "@/hooks/useCart";
import { formatMoney } from "@/utils/currency";
import { resolveDescription, resolveTitle } from "@/utils/description";
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
  const { t } = useTranslation();
  const { i18n } = useTranslation();
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

      {/* Rich description section */}
      {descriptionHtml && (
        <div
          className="prose prose-sm max-w-none mb-4 text-default-700"
          dangerouslySetInnerHTML={{ __html: descriptionHtml }}
        />
      )}

      <p className="text-default-500 text-sm mb-4 font-semibold">{price}</p>

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
