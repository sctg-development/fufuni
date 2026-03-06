import { useTranslation } from "react-i18next";
import DefaultLayout from "@/layouts/default";
import { useCart } from "@/hooks/useCart";
import { createCart, addItemsToCart, checkoutCart } from "@/lib/store-api";
import { button as buttonStyles } from "@heroui/theme";
import { Input } from "@heroui/input";
import { useState } from "react";

export default function CartPage() {
  const noImage = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExYTFhIi8+PHBhdGggZmlsbD0iIzY2NiIgZD0iTTIwLjgxNSAzNC41NzVoMS40MnY4LjY4aC0uODNxLS4xOSAwLS4zMi0uMDYtLjEzLS4wNy0uMjUtLjIybC00LjUzLTUuNzhxLjA0LjQuMDQuNzN2NS4zM2gtMS40MnYtOC42OGguODRxLjEgMCAuMTguMDEuMDcuMDEuMTMuMDR0LjExLjA4cS4wNi4wNS4xMi4xM2w0LjU1IDUuODFxLS4wMi0uMjEtLjAzLS40MS0uMDEtLjIxLS4wMS0uMzh6bTUuODQgMi40M3EuNjkgMCAxLjI1LjIydC45Ni42My42MSAxcS4yMi41OC4yMiAxLjMxdC0uMjIgMS4zMnEtLjIxLjU5LS42MSAxLS40LjQyLS45Ni42NHQtMS4yNS4yMi0xLjI1LS4yMnEtLjU3LS4yMi0uOTYtLjY0LS40LS40MS0uNjItMXQtLjIyLTEuMzIuMjItMS4zMXEuMjItLjU5LjYyLTEgLjM5LS40MS45Ni0uNjMuNTYtLjIyIDEuMjUtLjIybTAgNS4ycS43NyAwIDEuMTQtLjUyLjM3LS41MS4zNy0xLjUxIDAtLjk5LS4zNy0xLjUyLS4zNy0uNTItMS4xNC0uNTItLjc4IDAtMS4xNS41My0uMzguNTItLjM4IDEuNTF0LjM4IDEuNTFxLjM3LjUyIDEuMTUuNTJtOC45NC03LjYzdjguNjhoLTEuNjJ2LTguNjh6bTMuMTkgOC42OGgtMS40OHYtNi4xNmguOXEuMjkgMCAuMzguMjdsLjEuNDZxLjE2LS4xOC4zNC0uMzMuMTctLjE1LjM3LS4yNi4yMS0uMTEuNDQtLjE3dC41LS4wNnEuNTkgMCAuOTYuMzEuMzguMzIuNTYuODQuMTUtLjMxLjM2LS41My4yMi0uMjEuNDgtLjM1LjI1LS4xNC41NC0uMjEuMy0uMDYuNTktLjA2LjUxIDAgLjkxLjE1LjM5LjE2LjY2LjQ2dC40MS43My4xNC45OXYzLjkyaC0xLjQ4di0zLjkycTAtLjU5LS4yNi0uODgtLjI1LS4zLS43NS0uMy0uMjMgMC0uNDMuMDgtLjE5LjA4LS4zNC4yMi0uMTQuMTUtLjIzLjM3LS4wOC4yMi0uMDguNTF2My45MmgtMS40OXYtMy45MnEwLS42Mi0uMjUtLjl0LS43My0uMjhxLS4zMiAwLS42LjE2dC0uNTIuNDN6bTExLjgyLTEuNTl2LTEuMDRxLS42NC4wMy0xLjA4LjExdC0uNy4yMXEtLjI3LjEzLS4zOC4yOS0uMTEuMTctLjExLjM3IDAgLjM5LjIzLjU2dC42LjE3cS40NiAwIC43OS0uMTcuMzMtLjE2LjY1LS41bS0zLjEzLTMuMjMtLjI3LS40OHExLjA3LS45NyAyLjU2LS45Ny41NCAwIC45Ny4xOC40Mi4xNy43Mi40OS4yOS4zMS40NC43NS4xNi40NC4xNi45NnYzLjg5aC0uNjhxLS4yMSAwLS4zMi0uMDYtLjExLS4wNy0uMTgtLjI2bC0uMTMtLjQ0cS0uMjQuMjEtLjQ2LjM3dC0uNDYuMjZxLS4yNC4xMS0uNTEuMTctLjI4LjA2LS42MS4wNi0uMzkgMC0uNzItLjExLS4zMy0uMS0uNTctLjMxdC0uMzctLjUzcS0uMTMtLjMxLS4xMy0uNzIgMC0uMjQuMDgtLjQ3dC4yNS0uNDRxLjE4LS4yMS40Ni0uMzkuMjgtLjE5LjY5LS4zMy40Mi0uMTQuOTYtLjIyLjU1LS4wOSAxLjI1LS4xMXYtLjM2cTAtLjYyLS4yNi0uOTEtLjI3LS4zLS43Ny0uMy0uMzYgMC0uNTkuMDgtLjI0LjA5LS40Mi4xOS0uMTguMTEtLjMzLjE5LS4xNC4wOS0uMzIuMDktLjE2IDAtLjI3LS4wOC0uMTEtLjA5LS4xNy0uMTltOC4yMiAxLjU5cS4yNyAwIC40OC0uMDcuMi0uMDguMzQtLjIxLjEzLS4xMy4yLS4zMi4wNy0uMTguMDctLjQxIDAtLjQ1LS4yNy0uNzItLjI4LS4yNy0uODItLjI3LS41NSAwLS44Mi4yN3QtLjI3LjcycTAgLjIyLjA2LjQxLjA3LjE4LjIxLjMyLjEzLjEzLjM0LjIxLjIxLjA3LjQ4LjA3bTEuNjcgMy41MXEwLS4xOC0uMTEtLjMtLjEtLjExLS4yOS0uMTgtLjE5LS4wNi0uNDQtLjA5LS4yNC0uMDMtLjUyLS4wNC0uMjgtLjAyLS41OC0uMDN0LS41OC0uMDVxLS4yNC4xNC0uNC4zMy0uMTUuMTgtLjE1LjQzIDAgLjE2LjA4LjN0LjI2LjI0cS4xOC4xMS40Ni4xNi4yOC4wNi42OS4wNnQuNzEtLjA2cS4zLS4wNy41LS4xOC4xOS0uMTEuMjgtLjI2dC4wOS0uMzNtLS4yOS02LjIzaDEuNzd2LjU2cTAgLjI2LS4zMi4zMmwtLjU1LjFxLjEyLjMyLjEyLjcgMCAuNDUtLjE4LjgydC0uNTEuNjNxLS4zMi4yNi0uNzYuNHQtLjk1LjE0cS0uMTggMC0uMzUtLjAydC0uMzMtLjA1cS0uMjkuMTgtLjI5LjM5IDAgLjE5LjE3LjI4LjE3LjA4LjQ2LjEyLjI4LjA0LjY0LjA0LjM2LjAxLjc0LjA0LjM3LjAzLjczLjExLjM2LjA3LjY1LjI0LjI4LjE2LjQ1LjQ0dC4xNy43MXEwIC40MS0uMi44LS4yLjM4LS41OC42OHQtLjk0LjQ4cS0uNTUuMTktMS4yNi4xOS0uNyAwLTEuMjEtLjE0LS41Mi0uMTMtLjg2LS4zNi0uMzQtLjIyLS41MS0uNTItLjE3LS4yOS0uMTctLjYxIDAtLjQzLjI2LS43MnQuNzItLjQ3cS0uMjUtLjEyLS4zOS0uMzMtLjE1LS4yMS0uMTUtLjU2IDAtLjEzLjA1LS4yOC4wNi0uMTUuMTUtLjI5LjEtLjE1LjI1LS4yOC4xNS0uMTIuMzYtLjIzLS40Ny0uMjUtLjc0LS42Ny0uMjYtLjQyLS4yNi0uOTggMC0uNDYuMTgtLjgzdC41MS0uNjMuNzctLjRxLjQ1LS4xMy45OC0uMTMuMzkgMCAuNzQuMDh0LjY0LjIzbTMuODcgMi4xNmgyLjhxMC0uMjgtLjA4LS41NC0uMDgtLjI1LS4yNS0uNDUtLjE2LS4xOS0uNDEtLjN0LS41Ny0uMTFxLS42NSAwLTEuMDIuMzctLjM2LjM2LS40NyAxLjAzbTMuNzguOWgtMy44MXEuMDQuNDcuMTcuODIuMTMuMzQuMzUuNTcuMjIuMjIuNTEuMzMuMy4xMS42Ni4xMXQuNjItLjA4LjQ2LS4xOWwuMzQtLjE4cS4xNC0uMDkuMjgtLjA5LjE5IDAgLjI4LjE0bC40Mi41NHEtLjI0LjI5LS41NS40OS0uMy4xOS0uNjQuMzEtLjMzLjExLS42Ny4xNi0uMzUuMDUtLjY3LjA1LS42NCAwLTEuMi0uMjEtLjU1LS4yMi0uOTYtLjYzLS40LS40Mi0uNjQtMS4wNC0uMjMtLjYxLS4yMy0xLjQyIDAtLjYzLjItMS4xOS4yLS41NS41OS0uOTYuMzgtLjQxLjkzLS42NXQxLjI0LS4yNHEuNTggMCAxLjA3LjE4LjQ5LjE5Ljg1LjU1LjM1LjM1LjU1Ljg3dC4yIDEuMTlxMCAuMzMtLjA3LjQ1dC0uMjguMTIiLz48L3N2Zz4=";
  const { t } = useTranslation();
  const { items, updateQuantity, removeItem, clear, totalCents } = useCart();

  // checkout form state
  const [email, setEmail] = useState("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCheckout = async () => {
    // simple validation mirroring example
    if (!email || !email.includes("@")) {
      setCheckoutError(t("checkout-invalid-email"));
      return;
    }
    setCheckoutError(null);
    setIsProcessing(true);

    try {
      const cart = await createCart(email);
      await addItemsToCart(
        cart.id,
        items.map((i) => ({ sku: i.sku, qty: i.qty })),
      );
      const { checkout_url } = await checkoutCart(
        cart.id,
        window.location.origin + "/success",
        window.location.href,
      );
      clear();
      window.location.href = checkout_url;
    } catch (err: any) {
      setCheckoutError(err?.message || t("checkout-failed"));
      setIsProcessing(false);
      console.error("Checkout error:", err);
    }
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
                className="flex items-center gap-4 border p-4 rounded bg-default-50 hover:bg-default-100 transition"
              >
                <img
                  src={
                    item.image_url ||
                    noImage
                  }
                  alt={item.title}
                  className="w-16 h-16 object-cover rounded"
                  onError={(e) =>
                    ((e.target as HTMLImageElement).src =
                      noImage)
                  }
                />
                <div className="flex-1">
                  <p className="font-medium truncate">{item.title}</p>
                  <p className="text-sm text-default-500">
                    ${(item.price_cents / 100).toFixed(2)}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <div className="flex items-center border border-default-300 rounded-lg">
                      <button
                        onClick={() => updateQuantity(item.sku, item.qty - 1)}
                        className="px-3 py-1 text-default-500 hover:text-default-900"
                      >
                        –
                      </button>
                      <span className="px-2 text-default-900">{item.qty}</span>
                      <button
                        onClick={() => updateQuantity(item.sku, item.qty + 1)}
                        className="px-3 py-1 text-default-500 hover:text-default-900"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => removeItem(item.sku)}
                      className="text-sm text-default-500 hover:text-red-400"
                    >
                      {t("remove")}
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium text-default-900">
                    ${(item.price_cents * item.qty / 100).toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
            <div className="text-right font-semibold">
              {t("total")} : ${(totalCents / 100).toFixed(2)}
            </div>

            {/* email / checkout form */}
            <div className="mt-6">
              <label htmlFor="email" className="block text-sm text-default-500 mb-2">
                {t("email-label")}
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCheckout();
                }}
              />
              {checkoutError && (
                <p className="text-red-400 text-sm mt-2">{checkoutError}</p>
              )}
            </div>

            <p className="text-sm text-default-500 mb-4 mt-2">
              {t("shipping-note")}
            </p>

            <div className="flex justify-between mt-2">
              <button
                onClick={() => clear()}
                className={buttonStyles({ color: "danger" })}
              >
                {t("cart-clear")}
              </button>
              <button
                onClick={handleCheckout}
                className={buttonStyles({ color: "primary" }) +
                  (isProcessing ? " opacity-50 cursor-not-allowed" : "")}
                disabled={isProcessing}
              >
                {isProcessing ? t("processing") || "Processing..." : t("checkout")}
              </button>
            </div>
          </div>
        )}
      </div>
    </DefaultLayout>
  );
}
