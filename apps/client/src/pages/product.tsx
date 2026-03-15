/**
 * MIT License
 *
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardBody } from "@heroui/card";
import { Spinner } from "@heroui/spinner";

import DefaultLayout from "@/layouts/default";
import { getProduct, StoreProduct } from "@/lib/store-api";
import { ProductCardFull } from "@/components/product-card-full";

export default function ProductPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const {
    data: product,
    isLoading,
    isError,
    error,
  } = useQuery<StoreProduct, Error>({
    queryKey: ["product", id],
    queryFn: () => {
      if (!id) throw new Error("Product ID not provided");
      return getProduct(id);
    },
    enabled: !!id,
  });

  return (
    <DefaultLayout>
      <div className="px-4 py-6">
        {isLoading && (
          <div className="flex justify-center items-center py-20">
            <Spinner size="lg" />
          </div>
        )}

        {isError && (
          <Card className="border-red-200 bg-red-50">
            <CardBody className="text-red-800">
              <p className="font-semibold mb-2">{t("error")}</p>
              <p>{error?.message || t("admin-products-loading-error")}</p>
            </CardBody>
          </Card>
        )}

        {product && (
          <div className="max-w-2xl">
            <ProductCardFull product={product} />
          </div>
        )}

        {!isLoading && !product && !isError && (
          <Card>
            <CardBody className="text-center text-default-500">
              {t("admin-products-empty")}
            </CardBody>
          </Card>
        )}
      </div>
    </DefaultLayout>
  );
}
