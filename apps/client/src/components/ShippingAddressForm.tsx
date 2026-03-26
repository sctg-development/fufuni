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

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input, TextField, Label } from "@heroui/react";
import { Select, ListBox } from "@heroui/react";
import { Button } from "@heroui/react";
import { Card} from "@heroui/react";
import { setShippingAddress } from "@/lib/store-api";

const COUNTRIES = [
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "BE", name: "Belgium" },
  { code: "CH", name: "Switzerland" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "AT", name: "Austria" },
  { code: "NL", name: "Netherlands" },
  { code: "LU", name: "Luxembourg" },
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "FI", name: "Finland" },
  { code: "PL", name: "Poland" },
  { code: "CZ", name: "Czech Republic" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
];

interface ShippingAddressFormProps {
  cartId: string;
  onSuccess: (address: any) => void;
  isLoading?: boolean;
}

export default function ShippingAddressForm({ cartId, onSuccess, isLoading = false }: ShippingAddressFormProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "FR",
    billing_same_as_shipping: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const cart = await setShippingAddress(cartId, {
        name: form.name,
        line1: form.line1,
        line2: form.line2,
        city: form.city,
        state: form.state,
        postal_code: form.postal_code,
        country: form.country,
        billing_same_as_shipping: form.billing_same_as_shipping,
      });
      onSuccess(cart);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = form.name && form.line1 && form.city && form.postal_code && form.country;

  return (
    <Card className="w-full">
      <Card.Header>
        <h2 className="text-lg font-semibold">{t("shipping-address") || "Shipping Address"}</h2>
      </Card.Header>
      <Card.Content>
        <form onSubmit={handleSubmit} className="space-y-4">
          <TextField isRequired isDisabled={submitting || isLoading}>
            <Label>{t("full-name") || "Full Name"}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </TextField>

          <TextField isRequired isDisabled={submitting || isLoading}>
            <Label>{t("address-line-1") || "Address Line 1"}</Label>
            <Input
              value={form.line1}
              onChange={(e) => setForm((f) => ({ ...f, line1: e.target.value }))}
            />
          </TextField>

          <TextField isDisabled={submitting || isLoading}>
            <Label>{t("address-line-2") || "Address Line 2 (optional)"}</Label>
            <Input
              value={form.line2}
              onChange={(e) => setForm((f) => ({ ...f, line2: e.target.value }))}
            />
          </TextField>

          <div className="grid grid-cols-2 gap-3">
            <TextField isRequired isDisabled={submitting || isLoading}>
              <Label>{t("city") || "City"}</Label>
              <Input
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </TextField>

            <TextField isRequired isDisabled={submitting || isLoading}>
              <Label>{t("postal-code") || "Postal Code"}</Label>
              <Input
                value={form.postal_code}
                onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
              />
            </TextField>
          </div>

          <TextField isDisabled={submitting || isLoading}>
            <Label>{t("state-region") || "State / Region (optional)"}</Label>
            <Input
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
            />
          </TextField>

          <Select
            value={form.country}
            onChange={(value) => setForm((f) => ({ ...f, country: (value as string) || "" }))}
            isRequired
            isDisabled={submitting || isLoading}
          >
            <Label>{t("country") || "Country"}</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {COUNTRIES.map((c) => (
                  <ListBox.Item key={c.code} id={c.code} textValue={c.name}>
                    {c.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <Button
            type="submit"
            variant="primary"
            isPending={submitting || isLoading}
            isDisabled={!isValid || submitting || isLoading}
            fullWidth
          >
            {t("continue-to-shipping-rates") || "Continue to Shipping Options"}
          </Button>
        </form>
      </Card.Content>
    </Card>
  );
}
