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

import { LinkUniversal } from "@/components/link-universal";
import { button as buttonStyles } from "@heroui/react";
import { Trans, useTranslation } from "react-i18next";

import { useAuth } from "@/authentication";
import { LoginButton, LogoutButton } from "@/authentication";
import { siteConfig } from "@/config/site";
import { title, subtitle } from "@/components/primitives";
import { GithubIcon } from "@/components/icons";
import DefaultLayout from "@/layouts/default";

import { useState } from "react";

import { StoreProduct, searchProducts, getProducts } from "@/lib/store-api";
import { ProductCard } from "@/components/product-card";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";


export default function IndexPage() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();

  // check for search query in URL
  const [searchParams] = useSearchParams();
  const term = searchParams.get("q") || "";

  const {
    data: products,
    isLoading: productsLoading,
    isError: productsError,
  } = useQuery<StoreProduct[], Error>({
    queryKey: ["products", term],
    queryFn: async () => {
      if (term) {
        return await searchProducts(term);
      }
      // no term => default product list
      return await getProducts();
    },
  });

  const safeProducts: StoreProduct[] = products || [];
  const [selectedVariants, setSelectedVariants] =
    useState<Record<string, string>>({});

  const handleVariantChange = (productId: string, sku: string) => {
    setSelectedVariants((prev) => ({ ...prev, [productId]: sku }));
  };


  return (
    <DefaultLayout>
      <section className="flex flex-col items-center justify-center gap-4 py-8 md:py-10">
        <div className="inline-block max-w-lg text-center justify-center">
          <span className={title()}>{t("make")}&nbsp;</span>
          <span className={title({ color: "violet" })}>
            {t("beautiful")}&nbsp;
          </span>
          <br />
          <span className={title()}>
            <Trans i18nKey="websites-regardless-of-your-design-experience" />
          </span>
          <div className={subtitle({ class: "mt-4" })}>
            <Trans i18nKey="beautiful-fast-and-modern-react-ui-library" />
          </div>
        </div>

        {/* call-to-action buttons */}
        <div className="flex gap-3">
          <LinkUniversal
            isExternal
            className={buttonStyles({
              color: "primary",
              radius: "full",
              variant: "shadow",
            })}
            href={siteConfig().links.docs}
          >
            <Trans i18nKey="documentation" />
          </LinkUniversal>
          <LinkUniversal
            isExternal
            className={buttonStyles({ variant: "bordered", radius: "full" })}
            href={siteConfig().links.github}
          >
            <GithubIcon size={20} />
            GitHub
          </LinkUniversal>
        </div>

        {/* dynamic area depending on auth state */}
        <div className="mt-8 text-center">
          {!isAuthenticated ? (
            <>
              <LoginButton />
              <p className="mt-4 text-sm">
                <Trans i18nKey="template_login_prompt" />
              </p>
              <div className="mt-2">
                <LinkUniversal
                  className={buttonStyles({
                    variant: "bordered",
                    radius: "full",
                  })}
                  href="/openapi"
                >
                  {t("openapi-docs")}
                </LinkUniversal>
                <p className="text-xs mt-1 opacity-70">
                  <Trans i18nKey="template_login_required" />
                </p>
              </div>
            </>
          ) : (
            <>
              <p>
                <Trans
                  i18nKey="template_welcome_back"
                  values={{ name: user?.nickname || user?.name }}
                />
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center mt-4">
                <LinkUniversal
                  className={buttonStyles({
                    variant: "bordered",
                    radius: "full",
                  })}
                  href="/api"
                >
                  {t("api")}
                </LinkUniversal>
                <LinkUniversal
                  className={buttonStyles({
                    variant: "bordered",
                    radius: "full",
                  })}
                  href="/openapi"
                >
                  {t("openapi-docs")}
                </LinkUniversal>
              </div>
              <div className="mt-4">
                <LogoutButton text={t("log-out")} />
              </div>
            </>
          )}
        </div>

      </section>

      {/* products grid */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-semibold mb-6 text-center">
          {t("shop-products-title")}
        </h2>
        {productsLoading ? (
          <p className="text-center">{t("admin-products-loading")}</p>
        ) : productsError ? (
          <p className="text-center text-red-500">{t("products-error")}</p>
        ) : safeProducts.length === 0 ? (
          <p className="text-center">{t("admin-products-empty")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {safeProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                selectedSku={selectedVariants[product.id]}
                onSelectVariant={handleVariantChange}
              />
            ))}
          </div>
        )}
      </section>
    </DefaultLayout>
  );
}
