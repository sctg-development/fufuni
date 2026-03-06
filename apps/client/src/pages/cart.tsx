import { useTranslation } from "react-i18next";
import DefaultLayout from "@/layouts/default";
import { useCart } from "@/hooks/useCart";
import { button as buttonStyles } from "@heroui/theme";
import { Input } from "@heroui/input";
import { useState } from "react";
import { LinkUniversal } from "@/components/link-universal";

export default function CartPage() {
  const { t } = useTranslation();
  const { items, updateQuantity, removeItem, clear, totalCents } = useCart();
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<number>(0);

  const startEdit = (sku: string, qty: number) => {
    setEditingSku(sku);
    setEditQty(qty);
  };

  const saveEdit = () => {
    if (editingSku) {
      updateQuantity(editingSku, editQty);
    }
    setEditingSku(null);
  };

  return (
    <DefaultLayout>
      <div className="max-w-4xl mx-auto py-12">
        <h1 className="text-2xl font-semibold mb-6">{t("cart")}</h1>
        {items.length === 0 ? (
          <p>{t("cart-empty")}</p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div
                key={item.sku}
                className="flex items-center justify-between border p-4 rounded"
              >
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-default-500">
                    ${(item.price_cents / 100).toFixed(2)} x {item.qty}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {editingSku === item.sku ? (
                    <>
                      <Input
                        type="number"
                        classNames={{ input: "w-20" }}
                        value={editQty.toString()}
                        onChange={(e) => setEditQty(Number(e.target.value))}
                      />
                      <button
                        onClick={saveEdit}
                        className={buttonStyles({ color: "primary" })}
                      >
                        {t("save")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(item.sku, item.qty)}
                        className={buttonStyles({ variant: "bordered" })}
                      >
                        {t("edit")}
                      </button>
                      <button
                        onClick={() => removeItem(item.sku)}
                        className={buttonStyles({ color: "danger" })}
                      >
                        {t("remove")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            <div className="text-right font-semibold">
              {t("total")} : ${(totalCents / 100).toFixed(2)}
            </div>
            <div className="flex justify-between mt-6">
              <button
                onClick={() => clear()}
                className={buttonStyles({ color: "danger" })}
              >
                {t("cart-clear")}
              </button>
              <LinkUniversal
                className={buttonStyles({ color: "primary" })}
                href="/checkout"
              >
                {t("checkout")}
              </LinkUniversal>
            </div>
          </div>
        )}
      </div>
    </DefaultLayout>
  );
}
