import React from "react";
import { button as buttonStyles } from "@heroui/theme";
import { StoreProduct } from "@/lib/store-api";
import { useTranslation } from "react-i18next";
import { useCart } from "@/hooks/useCart";

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
  const { t } = useTranslation();
  const { addItem } = useCart();

  const variant =
    product.variants.find((v) => v.sku === selectedSku) ||
    product.variants[0];

  const price = variant ? (variant.price_cents / 100).toFixed(2) : "0.00";
  const image =
    variant?.image_url || product.image_url ||
    "https://placehold.co/400x400/1a1a1a/666?text=No+Image";

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
      <h3 className="font-medium text-default-900 mb-1">{product.title}</h3>
      <p className="text-default-500 text-sm mb-3">${price}</p>
      {product.variants.length > 1 && onSelectVariant && (
        <select
          value={selectedSku || variant.sku}
          onChange={(e) => onSelectVariant(product.id, e.target.value)}
          className="w-full bg-default-100 border border-default-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none"
        >
          {product.variants.map((v) => (
            <option key={v.sku} value={v.sku}>
              {v.title} - ${((v.price_cents || 0) / 100).toFixed(2)}
            </option>
          ))}
        </select>
      )}
      <button
        onClick={() => {
          const sku = selectedSku || variant.sku;
          addItem({
            sku,
            title: `${product.title}${variant.title ? ` - ${variant.title}` : ""}`,
            price_cents: variant.price_cents,
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
