import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Radio, RadioGroup } from "@heroui/radio";
import { formatMoney } from "@/utils/currency";
import { getAvailableShippingRates, selectShippingRate, type AvailableShippingRateItem } from "@/lib/store-api";

export interface ShippingRateSelectorProps {
  cartId: string;
  isLoading?: boolean;
  onSelect: (rate: AvailableShippingRateItem) => void;
  onBack?: () => void;
}

export default function ShippingRateSelector({
  cartId,
  isLoading = false,
  onSelect,
  onBack,
}: ShippingRateSelectorProps) {
  const { t } = useTranslation();
  const [rates, setRates] = useState<AvailableShippingRateItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available rates when component mounts
  useEffect(() => {
    const loadRates = async () => {
      try {
        setLoading(true);
        const data = await getAvailableShippingRates(cartId);
        setRates(data.items ?? []);
        
        // Pre-select the first (cheapest) option automatically
        if (data.items?.length > 0) {
          setSelectedId(data.items[0].id);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadRates();
  }, [cartId]);

  const handleConfirm = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError(null);

    try {
      const selected = rates.find((r) => r.id === selectedId)!;
      await selectShippingRate(cartId, selectedId);
      onSelect(selected);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardBody className="text-center py-8">
          <p className="text-default-500">{t("loading-shipping-rates") || "Loading shipping options…"}</p>
        </CardBody>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full border-red-300">
        <CardBody>
          <p className="text-red-500 text-sm">{error}</p>
          {onBack && (
            <Button size="sm" variant="flat" onClick={onBack} className="mt-4">
              {t("back") || "Back"}
            </Button>
          )}
        </CardBody>
      </Card>
    );
  }

  if (rates.length === 0) {
    return (
      <Card className="w-full border-yellow-300">
        <CardBody>
          <p className="text-yellow-600 text-sm">
            {t("no-shipping-options") || "No shipping options available for your address."}
          </p>
          {onBack && (
            <Button size="sm" variant="flat" onClick={onBack} className="mt-4">
              {t("back-change-address") || "Back to Change Address"}
            </Button>
          )}
        </CardBody>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <h2 className="text-lg font-semibold">{t("shipping-method") || "Shipping Method"}</h2>
      </CardHeader>
      <CardBody>
        <RadioGroup value={selectedId || ""} onValueChange={setSelectedId} size="lg" className="space-y-3">
          {rates.map((rate) => (
            <div
              key={rate.id}
              className={`flex items-center gap-4 p-4 rounded-lg border-2 transition cursor-pointer ${
                selectedId === rate.id
                  ? "border-primary bg-primary-50"
                  : "border-default-200 hover:border-default-300"
              }`}
            >
              <Radio value={rate.id} className="shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-default-900">{rate.display_name}</p>
                {rate.description && <p className="text-xs text-default-500 mt-0.5">{rate.description}</p>}
                {rate.min_delivery_days && rate.max_delivery_days && (
                  <p className="text-xs text-default-400 mt-0.5">
                    {t("delivery-days") || "Delivery"}: {rate.min_delivery_days}–{rate.max_delivery_days}{" "}
                    {t("business-days") || "business days"}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold text-default-900">
                  {rate.amount_cents === 0 ? t("free") || "Free" : formatMoney(rate.amount_cents, rate.currency)}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>

        {error && <p className="text-red-500 text-sm mt-4">{error}</p>}

        <div className="flex gap-3 mt-6">
          {onBack && (
            <Button
              variant="flat"
              color="default"
              onClick={onBack}
              isDisabled={saving || isLoading}
              fullWidth
            >
              {t("previous") || "Previous"}
            </Button>
          )}
          <Button
            color="primary"
            onClick={handleConfirm}
            isLoading={saving || isLoading}
            isDisabled={!selectedId || saving || isLoading}
            fullWidth
          >
            {t("continue-to-payment") || "Continue to Payment"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
