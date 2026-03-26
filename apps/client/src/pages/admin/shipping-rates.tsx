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

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@heroui/react";
import { Input, TextField, Label } from "@heroui/react";
import { Select,  ListBox } from "@heroui/react";
import {
  Table,
} from "@heroui/react";
import {
  Modal,
  useOverlayState,
} from "@heroui/react";
import { Card } from "@heroui/react";
import { Tooltip } from "@heroui/react";
import { Switch } from "@heroui/react";
import { Plus, Edit2, Trash2 } from "lucide-react";

import { SearchIcon } from "@/components/icons";
import DefaultLayout from "@/layouts/default";
import { useSecuredApi } from "@/authentication";
import { formatMoney } from "@/utils/currency";
import { resolveTaxName } from "@/utils/description";

/**
 * Defines a shipping rate available in a region, including weight and
 * delivery constraints.
 */
interface ShippingRate {
  id: string;
  display_name: string;
  description?: string;
  max_weight_g?: number;
  min_delivery_days?: number;
  max_delivery_days?: number;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  price_cents?: number;
  currency_code?: string;
  tax_code?: string | null;
  tax_inclusive?: boolean;
}

interface Currency {
  id: string;
  code: string;
  display_name: string;
  symbol: string;
  decimal_places: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ShippingClass {
  id: string;
  code: string;
  display_name: string;
  description?: string;
  resolution: "exclusive" | "additive";
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

/**
 * Available status choices for shipping rates.
 */
const STATUS_OPTIONS = ["active", "inactive"];

export default function ShippingRatesPage() {
  const { t, i18n } = useTranslation();
  const { getJson, postJson, deleteJson, patchJson } = useSecuredApi();

  const apiBase = (import.meta as any).env?.API_BASE_URL
    ? (import.meta as any).env.API_BASE_URL
    : "";

  // List state
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [shippingClasses, setShippingClasses] = useState<ShippingClass[]>([]);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [taxRates, setTaxRates] = useState<
    { tax_code: string | null; display_name: string }[]
  >([]);

  // Modal state
  const modalState = useOverlayState();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingRate, setEditingRate] = useState<ShippingRate | null>(null);
  const [pricesByDivisa, setPricesByDivisa] = useState<Record<string, number>>(
    {},
  );
  const [formData, setFormData] = useState({
    display_name: "",
    description: "",
    max_weight_g: "",
    min_delivery_days: "",
    max_delivery_days: "",
    status: "active" as "active" | "inactive",
    price: "",
    currency_id: "",
    shipping_class_id: "",
    tax_code: "",
    tax_inclusive: false,
  });

  // Shipping Classes Modal state
  const classModalState = useOverlayState();
  const [isClassEditMode, setIsClassEditMode] = useState(false);
  const [editingClass, setEditingClass] = useState<ShippingClass | null>(null);
  const [classFormData, setClassFormData] = useState({
    code: "",
    display_name: "",
    description: "",
    resolution: "exclusive" as "exclusive" | "additive",
    status: "active" as "active" | "inactive",
  });

  // Load shipping rates
  /**
   * Fetch the list of shipping rates from the server and update state.
   * Shows loading indicator while fetching.
   */
  const loadData = async () => {
    try {
      const apiUrl = `${apiBase}/v1/regions/shipping-rates?limit=100`;

      console.log("📍 Loading shipping rates from:", apiUrl);

      const ratesResp = await getJson(apiUrl);

      console.log("Rates Response:", ratesResp);

      if (!ratesResp || !ratesResp.items) {
        console.warn("⚠️ Rates response invalid:", ratesResp);
        setShippingRates([]);

        return;
      }

      // First, set rates without prices to show them immediately
      const rates: ShippingRate[] = ratesResp.items || [];

      console.log("✅ Found rates:", rates.length);
      setShippingRates(rates);

      // Then, load currencies and prices asynchronously
      try {
        const currenciesResp = await getJson(
          `${apiBase}/v1/regions/currencies?limit=100`,
        );
        const currencies: Currency[] = currenciesResp.items || [];

        setCurrencies(currencies);
        console.log("💱 Currencies loaded:", currencies.length);

        const defaultCurrency = currencies[0];

        if (!defaultCurrency) {
          console.warn("⚠️ No default currency found");

          return;
        }

        // Load prices for each rate
        const ratesWithPrices = await Promise.all(
          rates.map(async (rate) => {
            try {
              const priceResp = await getJson(
                `${apiBase}/v1/regions/shipping-rates/${rate.id}/prices?currency_id=${defaultCurrency.id}`,
              );
              const priceItem = Array.isArray(priceResp.items)
                ? priceResp.items[0]
                : null;

              return {
                ...rate,
                price_cents: priceItem?.amount_cents,
                currency_code: defaultCurrency.code,
              };
            } catch (err) {
              console.warn(`⚠️ No price for rate ${rate.id}:`, err);

              return { ...rate, currency_code: defaultCurrency.code };
            }
          }),
        );

        console.log("💰 Rates with prices:", ratesWithPrices.length);
        setShippingRates(ratesWithPrices);
      } catch (priceErr) {
        console.warn(
          "⚠️ Failed to load prices, showing rates without prices:",
          priceErr,
        );
        // Keep the rates without prices - they're already set above
      }
    } catch (err) {
      console.error("❌ Failed to load shipping rates:", err);
      setShippingRates([]);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Load shipping classes for selector
  useEffect(() => {
    const loadShippingClasses = async () => {
      try {
        const resp = await getJson(
          `${apiBase}/v1/regions/shipping-classes?limit=100`,
        );

        setShippingClasses(resp.items || []);
      } catch (err) {
        console.error("Failed to load shipping classes", err);
      }
    };

    loadShippingClasses();
  }, []);

  // Load tax rates for dropdown
  useEffect(() => {
    const loadTaxRates = async () => {
      try {
        const resp = await getJson(`${apiBase}/v1/tax-rates?limit=500`);
        const uniqueRates = new Map<string | null, string>();

        (resp.items || []).forEach((r: any) => {
          uniqueRates.set(r.tax_code, r.display_name);
        });
        setTaxRates(
          Array.from(uniqueRates.entries()).map(([tax_code, display_name]) => ({
            tax_code,
            display_name,
          })),
        );
      } catch (err) {
        console.error("Failed to load tax rates", err);
      }
    };

    loadTaxRates();
  }, []);

  // Filtered shipping rates
  /**
   * Compute the list of rates matching the current status and search filter.
   * Memoized for performance.
   */
  const displayed = useMemo(() => {
    let filtered = shippingRates;

    if (statusFilter) {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }
    const term = globalFilter.trim().toLowerCase();

    if (term) {
      filtered = filtered.filter(
        (r) =>
          r.display_name.toLowerCase().includes(term) ||
          r.description?.toLowerCase().includes(term),
      );
    }

    return filtered;
  }, [shippingRates, statusFilter, globalFilter]);

  /**
   * Reset the form and show the modal for creating a new shipping rate.
   */
  const handleOpenCreate = () => {
    setIsEditMode(false);
    setEditingRate(null);
    setPricesByDivisa({});
    setFormData({
      display_name: "",
      description: "",
      max_weight_g: "",
      min_delivery_days: "",
      max_delivery_days: "",
      status: "active",
      price: "",
      currency_id: currencies[0]?.id ?? "",
      shipping_class_id: "",
      tax_code: "",
      tax_inclusive: false,
    });
    modalState.open();
  };

  /**
   * Populate the form with an existing rate and open modal for editing.
   *
   * @param rate - shipping rate to modify
   */
  const handleOpenEdit = async (rate: ShippingRate) => {
    setIsEditMode(true);
    setEditingRate(rate);

    const defaultCurrency = currencies[0];
    let price = "";
    let currency_id = defaultCurrency?.id ?? "";

    // Load prices for ALL currencies to cache them
    const priceCache: Record<string, number> = {};

    if (currencies.length > 0) {
      await Promise.all(
        currencies.map(async (currency) => {
          try {
            const priceResp = await getJson(
              `${apiBase}/v1/regions/shipping-rates/${rate.id}/prices?currency_id=${currency.id}`,
            );

            console.log(
              `💰 Price for currency ${currency.code} (${currency.id}):`,
              priceResp,
            );
            const priceItem = Array.isArray(priceResp.items)
              ? priceResp.items[0]
              : null;

            if (priceItem?.amount_cents != null) {
              priceCache[currency.id] = priceItem.amount_cents;
              console.log(
                `✅ Cached ${currency.code}: ${priceItem.amount_cents} cents`,
              );
            } else {
              console.warn(`⚠️ No price found for ${currency.code}`);
            }
          } catch (err) {
            console.warn(`⚠️ Failed to load price for ${currency.code}:`, err);
          }
        }),
      );
    }
    console.log("Final price cache:", priceCache);
    setPricesByDivisa(priceCache);

    // Use default currency price
    if (defaultCurrency && priceCache[defaultCurrency.id] != null) {
      price = (priceCache[defaultCurrency.id] / 100).toFixed(2);
      currency_id = defaultCurrency.id;
    }

    setFormData({
      display_name: rate.display_name,
      description: rate.description || "",
      max_weight_g: rate.max_weight_g ? rate.max_weight_g.toString() : "",
      min_delivery_days: rate.min_delivery_days
        ? rate.min_delivery_days.toString()
        : "",
      max_delivery_days: rate.max_delivery_days
        ? rate.max_delivery_days.toString()
        : "",
      status: rate.status,
      price,
      currency_id,
      shipping_class_id: (rate as any).shipping_class_id || "",
      tax_code: (rate as any).tax_code || "",
      tax_inclusive: (rate as any).tax_inclusive || false,
    });
    modalState.open();
  };

  /**
   * Send either a create or update request to the API using current form
   * values. Optimistically update local list or reload on failure, then close
   * the modal.
   */
  const handleSave = async () => {
    try {
      const saveData = {
        display_name: formData.display_name,
        description: formData.description || null,
        max_weight_g: formData.max_weight_g
          ? parseInt(formData.max_weight_g)
          : null,
        min_delivery_days: formData.min_delivery_days
          ? parseInt(formData.min_delivery_days)
          : null,
        max_delivery_days: formData.max_delivery_days
          ? parseInt(formData.max_delivery_days)
          : null,
        status: formData.status,
        shipping_class_id: formData.shipping_class_id || null,
        tax_code: formData.tax_code || null,
        tax_inclusive: formData.tax_inclusive,
      };

      const upsertPrice = async (rateId: string) => {
        if (!formData.currency_id || !formData.price) return;
        const amount = parseFloat(formData.price);

        if (Number.isNaN(amount)) return;
        const amount_cents = Math.round(amount * 100);

        await postJson(
          `${apiBase}/v1/regions/shipping-rates/${rateId}/prices`,
          {
            currency_id: formData.currency_id,
            amount_cents,
          },
        );
      };

      const currencyCode = currencies.find(
        (c) => c.id === formData.currency_id,
      )?.code;

      if (isEditMode && editingRate) {
        const response = await patchJson(
          `${apiBase}/v1/regions/shipping-rates/${editingRate.id}`,
          saveData,
        );

        await upsertPrice(editingRate.id);

        // Mettre à jour le state local
        if (response) {
          setShippingRates(
            shippingRates.map((r) =>
              r.id === editingRate.id
                ? {
                    ...response,
                    price_cents: formData.price
                      ? Math.round(parseFloat(formData.price) * 100)
                      : r.price_cents,
                    currency_code: currencyCode ?? r.currency_code,
                  }
                : r,
            ),
          );
        } else {
          await loadData();
        }
      } else {
        const response = await postJson(
          `${apiBase}/v1/regions/shipping-rates`,
          saveData,
        );

        // Ajouter le nouveau tarif
        if (response) {
          await upsertPrice(response.id);
          setShippingRates([
            ...shippingRates,
            {
              ...response,
              price_cents: formData.price
                ? Math.round(parseFloat(formData.price) * 100)
                : undefined,
              currency_code: currencyCode,
            },
          ]);
        } else {
          await loadData();
        }
      }
      modalState.close();
    } catch (err) {
      console.error("Failed to save shipping rate", err);
    }
  };

  /**
   * Prompt the user and remove a shipping rate if confirmed, then refresh
   * the list.
   *
   * @param id - identifier of the rate to delete
   */
  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this shipping rate?")) {
      try {
        await deleteJson(`${apiBase}/v1/regions/shipping-rates/${id}`);
        await loadData();
      } catch (err) {
        console.error("Failed to delete shipping rate", err);
      }
    }
  };

  // ─── Shipping Classes Handlers ─────────────────────────────────────────

  /**
   * Reset the form and show the modal for creating a new shipping class.
   */
  const handleOpenCreateClass = () => {
    setIsClassEditMode(false);
    setEditingClass(null);
    setClassFormData({
      code: "",
      display_name: "",
      description: "",
      resolution: "exclusive",
      status: "active",
    });
    classModalState.open();
  };

  /**
   * Populate the form with an existing class and open modal for editing.
   *
   * @param cls - shipping class to modify
   */
  const handleOpenEditClass = (cls: ShippingClass) => {
    setIsClassEditMode(true);
    setEditingClass(cls);
    setClassFormData({
      code: cls.code,
      display_name: cls.display_name,
      description: cls.description || "",
      resolution: cls.resolution,
      status: cls.status,
    });
    classModalState.open();
  };

  /**
   * Send either a create or update request for a shipping class to the API.
   * Update local list or reload on failure, then close the modal.
   */
  const handleSaveClass = async () => {
    try {
      const saveData = {
        code: classFormData.code,
        display_name: classFormData.display_name,
        description: classFormData.description || null,
        resolution: classFormData.resolution,
        status: classFormData.status,
      };

      if (isClassEditMode && editingClass) {
        const response = await patchJson(
          `${apiBase}/v1/regions/shipping-classes/${editingClass.id}`,
          saveData,
        );

        if (response) {
          setShippingClasses(
            shippingClasses.map((c) =>
              c.id === editingClass.id ? response : c,
            ),
          );
        } else {
          // Reload if response is null
          const resp = await getJson(
            `${apiBase}/v1/regions/shipping-classes?limit=100`,
          );

          setShippingClasses(resp.items || []);
        }
      } else {
        const response = await postJson(
          `${apiBase}/v1/regions/shipping-classes`,
          saveData,
        );

        if (response) {
          setShippingClasses([...shippingClasses, response]);
        } else {
          // Reload if response is null
          const resp = await getJson(
            `${apiBase}/v1/regions/shipping-classes?limit=100`,
          );

          setShippingClasses(resp.items || []);
        }
      }
      classModalState.close();
    } catch (err) {
      console.error("Failed to save shipping class", err);
    }
  };

  /**
   * Delete a shipping class after confirmation and refresh the list.
   *
   * @param id - identifier of the class to delete
   */
  const handleDeleteClass = async (id: string) => {
    if (confirm("Are you sure you want to delete this shipping class?")) {
      try {
        await deleteJson(`${apiBase}/v1/regions/shipping-classes/${id}`);
        setShippingClasses(shippingClasses.filter((c) => c.id !== id));
      } catch (err) {
        console.error("Failed to delete shipping class", err);
      }
    }
  };

  return (
    <DefaultLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">
            {t("admin-shipping-rates-title")}
          </h1>
          <Button
            variant="primary"
            onPress={handleOpenCreate}
          >
            <Plus className="w-4 h-4" />
            {t("admin-shipping-rates-add")}
          </Button>
        </div>

        <Card className="mb-6">
          <Card.Content className="flex gap-4">
            <TextField
              className="w-full flex-1"
              name="search"
              value={globalFilter}
              onChange={(value: string) => setGlobalFilter(value)}
            >
              <Label className="hidden">{t("admin-common-search")}</Label>
              <Input
                placeholder={t("admin-common-search")}
                className="pl-8"
              />
              <SearchIcon className="w-4 h-4 absolute left-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-default-400" />
            </TextField>
            <Select
              value={statusFilter || ""}
              onChange={(value) => setStatusFilter(value as string || "")}
              className="w-48"
            >
              <Label>{t("admin-common-status")}</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="" textValue="All">
                    All
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="active" textValue="Active">
                    Active
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                  <ListBox.Item id="inactive" textValue="Inactive">
                    Inactive
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                </ListBox>
              </Select.Popover>
            </Select>
          </Card.Content>
        </Card>

        <Card>
          <Card.Content>
            <Table>
              <Table.Header>
                <Table.Column key="display_name">
                  {t("admin-common-name")}
                </Table.Column>
                <Table.Column key="description">
                  {t("admin-common-description")}
                </Table.Column>
                <Table.Column key="max_weight">
                  {t("admin-shipping-rates-max-weight")}
                </Table.Column>
                <Table.Column key="price">
                  {t("admin-shipping-rates-price")}
                </Table.Column>
                <Table.Column key="delivery_days">
                  {t("admin-shipping-rates-delivery-days")}
                </Table.Column>
                <Table.Column key="status">
                  {t("admin-common-status")}
                </Table.Column>
                <Table.Column key="actions">
                  {t("admin-common-actions")}
                </Table.Column>
              </Table.Header>
              <Table.Body
                renderEmptyState={() => <div>{t("admin-common-empty")}</div>}
                items={displayed}
              >
                {(rate) => (
                  <Table.Row key={rate.id} className="odd:bg-default-50">
                    <Table.Cell>{rate.display_name}</Table.Cell>
                    <Table.Cell>
                      {rate.description
                        ? rate.description.substring(0, 50)
                        : "-"}
                    </Table.Cell>
                    <Table.Cell>
                      {rate.max_weight_g ? `${rate.max_weight_g}g` : "-"}
                    </Table.Cell>
                    <Table.Cell>
                      {rate.price_cents != null && rate.currency_code
                        ? formatMoney(rate.price_cents, rate.currency_code)
                        : "-"}
                    </Table.Cell>
                    <Table.Cell>
                      {rate.min_delivery_days || rate.max_delivery_days
                        ? `${rate.min_delivery_days || "?"}-${rate.max_delivery_days || "?"} days`
                        : "-"}
                    </Table.Cell>
                    <Table.Cell>
                      <span
                        className={
                          rate.status === "active"
                            ? "text-green-600"
                            : "text-gray-600"
                        }
                      >
                        {rate.status}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex gap-2">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="tertiary"
                          onPress={() => handleOpenEdit(rate)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="danger"
                          onPress={() => handleDelete(rate.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table>
          </Card.Content>
        </Card>

        {/* ─── Shipping Classes Section ──────────────────────────────────── */}
        <div className="mt-12 pt-6 border-t">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">
              {t("admin-shipping-classes-title")}
            </h2>
            <Button
              variant="primary"
              onPress={handleOpenCreateClass}
            >
              <Plus className="w-4 h-4" />
              {t("admin-shipping-classes-btn-new")}
            </Button>
          </div>

          <Card>
            <Card.Content>
              <Table>
                <Table.Header>
                  <Table.Column key="code">
                    {t("admin-shipping-classes-col-code")}
                  </Table.Column>
                  <Table.Column key="display_name">
                    {t("admin-shipping-classes-col-name")}
                  </Table.Column>
                  <Table.Column key="resolution">
                    {t("admin-shipping-classes-col-resolution")}
                  </Table.Column>
                  <Table.Column key="description">
                    {t("admin-shipping-classes-col-description")}
                  </Table.Column>
                  <Table.Column key="status">
                    {t("admin-shipping-classes-col-status")}
                  </Table.Column>
                  <Table.Column key="actions">
                    {t("admin-shipping-classes-col-actions")}
                  </Table.Column>
                </Table.Header>
                <Table.Body
                  renderEmptyState={() => <div>{t("admin-shipping-classes-empty")}</div>}
                  items={shippingClasses}
                >
                  {(cls) => (
                    <Table.Row key={cls.id} className="odd:bg-default-50">
                      <Table.Cell>
                        <code className="text-xs bg-default-100 px-2 py-0.5 rounded">
                          {cls.code}
                        </code>
                      </Table.Cell>
                      <Table.Cell className="font-medium">
                        {cls.display_name}
                      </Table.Cell>
                      <Table.Cell>
                        <span
                          className="text-xs px-2 py-1 rounded"
                          style={{
                            backgroundColor:
                              cls.resolution === "exclusive"
                                ? "#fed7aa"
                                : "#dbeafe",
                            color:
                              cls.resolution === "exclusive"
                                ? "#92400e"
                                : "#0c2340",
                          }}
                        >
                          {cls.resolution === "exclusive"
                            ? t("admin-shipping-classes-exclusive")
                            : t("admin-shipping-classes-additive")}
                        </span>
                      </Table.Cell>
                      <Table.Cell className="text-default-500 text-sm">
                        {cls.description
                          ? cls.description.substring(0, 40) +
                            (cls.description.length > 40 ? "..." : "")
                          : "—"}
                      </Table.Cell>
                      <Table.Cell>
                        <span
                          className={
                            cls.status === "active"
                              ? "text-green-600 font-medium"
                              : "text-gray-400"
                          }
                        >
                          {cls.status}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex gap-2">
                          <Tooltip>
                            <Tooltip.Trigger>
                              <Button
                                isIconOnly
                                size="sm"
                                variant="tertiary"
                                onPress={() => handleOpenEditClass(cls)}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content>
                              {t(
                                "admin-shipping-classes-btn-edit",
                                "Edit",
                              )}
                            </Tooltip.Content>
                          </Tooltip>
                          <Tooltip>
                            <Tooltip.Trigger>
                              <Button
                                isIconOnly
                                size="sm"
                                variant="danger"
                                onPress={() => handleDeleteClass(cls.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </Tooltip.Trigger>
                            <Tooltip.Content>
                              {t(
                                "admin-shipping-classes-btn-delete",
                                "Delete",
                              )}
                            </Tooltip.Content>
                          </Tooltip>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table>
            </Card.Content>
          </Card>
        </div>

        {/* Create / Edit Shipping Rate Modal */}
        <Modal state={modalState}>
          <Modal.Backdrop />
          <Modal.Container size="lg">
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.Header className="flex flex-col gap-1">
                    <Modal.Heading>
                      {isEditMode
                        ? t("admin-shipping-rates-edit")
                        : t("admin-shipping-rates-create")}
                    </Modal.Heading>
                  </Modal.Header>
                  <Modal.Body>
              <Tooltip>
                <Tooltip.Trigger>
                  <TextField>
                    <Label>{t("admin-common-name")}</Label>
                    <Input
                      placeholder="Standard Shipping"
                      value={formData.display_name}
                      onChange={(e) =>
                        setFormData({ ...formData, display_name: e.target.value })
                      }
                    />
                  </TextField>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-common-name",
                    "Display name for this shipping rate",
                  )}
                </Tooltip.Content>
              </Tooltip>
              <Tooltip>
                <Tooltip.Trigger>
                  <TextField>
                    <Label>{t("admin-common-description")}</Label>
                    <Input
                      placeholder="Fast delivery option"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                    />
                  </TextField>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-common-description",
                    "Describe this shipping option",
                  )}
                </Tooltip.Content>
              </Tooltip>
              <Tooltip>
                <Tooltip.Trigger>
                  <TextField>
                    <Label>{t("admin-shipping-rates-max-weight")}</Label>
                    <Input
                      min={0}
                      placeholder="5000"
                      type="number"
                      value={formData.max_weight_g}
                      onChange={(e) =>
                        setFormData({ ...formData, max_weight_g: e.target.value })
                      }
                    />
                  </TextField>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-shipping-rates-max-weight-help",
                    "Maximum package weight for this rate",
                  )}
                </Tooltip.Content>
              </Tooltip>
              <Tooltip>
                <Tooltip.Trigger>
                  <Select
                    value={formData.shipping_class_id || ""}
                    onChange={(value) => {
                      setFormData({ ...formData, shipping_class_id: (value as string) || "" });
                    }}
                  >
                    <Label>Classe d'expédition (optionnel)</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item id="" textValue="Universel — tous produits standards">
                          Universel — tous produits standards
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        {shippingClasses.map((cls) => (
                          <ListBox.Item
                            key={cls.id}
                            id={cls.id}
                            textValue={`[${cls.resolution === "exclusive" ? "EXCL" : "ADD"}] ${cls.display_name}`}
                          >
                            {`[${cls.resolution === "exclusive" ? "EXCL" : "ADD"}] ${cls.display_name}`}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-shipping-rates-shipping-class-help",
                    "Classe d'expédition (laissez vide pour un tarif universel)",
                  )}
                </Tooltip.Content>
              </Tooltip>
              <Tooltip>
                <Tooltip.Trigger>
                  <TextField>
                    <Label>{t(
                      "admin-shipping-rates-min-delivery-days",
                      "Min Delivery Days",
                    )}</Label>
                    <Input
                      min={0}
                      placeholder="1"
                      type="number"
                      value={formData.min_delivery_days}
                      onChange={(e) =>
                        setFormData({ ...formData, min_delivery_days: e.target.value })
                      }
                    />
                  </TextField>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-shipping-rates-min-delivery-days-help",
                    "Minimum days until delivery",
                  )}
                </Tooltip.Content>
              </Tooltip>
              <Tooltip>
                <Tooltip.Trigger>
                  <TextField>
                    <Label>{t(
                      "admin-shipping-rates-max-delivery-days",
                      "Max Delivery Days",
                    )}</Label>
                    <Input
                      min={0}
                      placeholder="7"
                      type="number"
                      value={formData.max_delivery_days}
                      onChange={(e) =>
                        setFormData({ ...formData, max_delivery_days: e.target.value })
                      }
                    />
                  </TextField>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-shipping-rates-max-delivery-days-help",
                    "Maximum days until delivery",
                  )}
                </Tooltip.Content>
              </Tooltip>
              <Tooltip>
                <Tooltip.Trigger>
                  <Select
                    value={formData.status}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        status: value as "active" | "inactive",
                      })
                    }
                  >
                    <Label>{t("admin-common-status")}</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {STATUS_OPTIONS.map((opt) => (
                          <ListBox.Item key={opt} id={opt} textValue={opt}>
                            {opt}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t("admin-common-status")}
                </Tooltip.Content>
              </Tooltip>
              <Tooltip>
                <Tooltip.Trigger>
                  <Select
                    value={formData.tax_code || ""}
                    onChange={(value) => {
                      setFormData({ ...formData, tax_code: (value as string) || "" });
                    }}
                  >
                    <Label>{t(
                      "admin-shipping-rates-tax-code",
                      "Code de taxe (optionnel)",
                    )}</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item
                          id=""
                          textValue="Aucune taxe spécifique"
                        >
                          Aucune taxe spécifique
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        {(taxRates as {
                          tax_code: string | null;
                          display_name: string;
                        }[]).map((rate: any) => (
                          <ListBox.Item
                            key={rate.tax_code || "null"}
                            id={rate.tax_code || "null"}
                            textValue={
                              rate.tax_code
                                ? `${resolveTaxName(rate.display_name, i18n.language)} (${rate.tax_code})`
                                : rate.display_name
                            }
                          >
                            {rate.tax_code
                              ? `${resolveTaxName(rate.display_name, i18n.language)} (${rate.tax_code})`
                              : rate.display_name}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-shipping-rates-tax-code-help",
                    "Tax code for this shipping rate (e.g. VAT for Chronopost)",
                  )}
                </Tooltip.Content>
              </Tooltip>

              <div className="flex items-center gap-4 mt-2 mb-4">
                <Switch
                  isSelected={formData.tax_inclusive}
                  onChange={(val) =>
                    setFormData({ ...formData, tax_inclusive: val })
                  }
                >
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Switch.Content>
                    <Label>
                      {t(
                        "admin-shipping-rates-tax-inclusive",
                        "Les prix incluent les taxes",
                      )}
                    </Label>
                  </Switch.Content>
                </Switch>
                <Tooltip>
                  <Tooltip.Trigger>
                    <div className="text-xs text-default-400 cursor-help underline decoration-dotted">
                      {t("common-help")}
                    </div>
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    {t(
                      "admin-shipping-rates-tax-inclusive-help",
                      "Cochez si le tarif de livraison configuré est TTC",
                    )}
                  </Tooltip.Content>
                </Tooltip>
              </div>

              <Tooltip>
                <Tooltip.Trigger>
                  <div className="flex gap-2">
                    <Select
                      className="w-32"
                      value={formData.currency_id || ""}
                      onChange={(newCurrencyId) => {
                        const currencyId = (newCurrencyId as string) || "";
                        console.log("💱 Changing currency to:", currencyId);
                        console.log("pricesByDivisa:", pricesByDivisa);
                        console.log(
                          "💰 Price for this currency:",
                          pricesByDivisa[currencyId],
                        );

                        const newPrice =
                          pricesByDivisa[currencyId] !== undefined
                            ? (pricesByDivisa[currencyId] / 100).toFixed(2)
                            : "";

                        console.log("✅ Setting price to:", newPrice);

                        setFormData({
                          ...formData,
                          currency_id: currencyId,
                          price: newPrice,
                        });
                      }}
                    >
                      <Label>{t("admin-common-currency")}</Label>
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          {currencies.map((c) => (
                            <ListBox.Item key={c.id} id={c.id} textValue={c.code}>
                              {c.code}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                    <TextField className="flex-1">
                      <Label>{t("admin-shipping-rates-price")}</Label>
                      <Input
                        min={0}
                        placeholder="0.00"
                        step={0.01}
                        type="number"
                        value={formData.price}
                        onChange={(e) =>
                          setFormData({ ...formData, price: e.target.value })
                        }
                      />
                    </TextField>
                  </div>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-shipping-rates-price-help",
                    "Shipping cost for this rate (in selected currency)",
                  )}
                </Tooltip.Content>
              </Tooltip>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button
                      variant="tertiary"
                      onPress={close}
                    >
                      {t("admin-common-cancel")}
                    </Button>
                    <Button
                      variant="primary"
                      isDisabled={!formData.display_name}
                      onPress={handleSave}
                    >
                      {t("admin-common-save")}
                    </Button>
                  </Modal.Footer>
                  </>
                )}
              </Modal.Dialog>
            </Modal.Container>
          </Modal>

        {/* Create / Edit Shipping Class Modal */}
        <Modal state={classModalState}>
          <Modal.Backdrop />
          <Modal.Container>
            <Modal.Dialog>
              {({ close: classClose }) => (
                <>
                  <Modal.Header className="flex flex-col gap-1">
                    <Modal.Heading>
                      {isClassEditMode
                        ? t(
                            "admin-shipping-classes-modal-title-edit",
                            "Edit Shipping Class",
                  )
                        : t(
                            "admin-shipping-classes-modal-title-create",
                            "New Shipping Class",
                          )}
                    </Modal.Heading>
                  </Modal.Header>
                  <Modal.Body className="gap-4">
              <Tooltip>
                <Tooltip.Trigger>
                  <TextField isRequired isDisabled={isClassEditMode}>
                    <Label>{t("admin-shipping-classes-code")}</Label>
                    <Input
                      placeholder={t(
                        "admin-shipping-classes-code-placeholder",
                        "e.g., oversized",
                      )}
                      value={classFormData.code}
                      onChange={(e) =>
                        setClassFormData({
                          ...classFormData,
                          code: e.target.value.toLowerCase(),
                        })
                      }
                    />
                  </TextField>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-shipping-classes-code-help",
                    "Unique lowercase identifier",
                  )}
                </Tooltip.Content>
              </Tooltip>
              <TextField isRequired>
                <Label>{t("admin-shipping-classes-display-name")}</Label>
                <Input
                  placeholder={t(
                    "admin-shipping-classes-display-name-placeholder",
                    "e.g., Oversized Items",
                  )}
                  value={classFormData.display_name}
                  onChange={(e) =>
                    setClassFormData({ ...classFormData, display_name: e.target.value })
                  }
                />
              </TextField>
              <TextField>
                <Label>{t(
                  "admin-shipping-classes-description",
                  "Description (optional)",
                )}</Label>
                <Input
                  placeholder={t(
                    "admin-shipping-classes-description-placeholder",
                    "e.g., For items > 50kg",
                  )}
                  value={classFormData.description}
                  onChange={(e) =>
                    setClassFormData({ ...classFormData, description: e.target.value })
                  }
                />
              </TextField>
              <Select
                isRequired
                value={classFormData.resolution}
                onChange={(value) =>
                  setClassFormData({
                    ...classFormData,
                    resolution: value as any,
                  })
                }
              >
                <Label>{t(
                  "admin-shipping-classes-resolution-mode",
                  "Resolution Mode",
                )}</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item key="exclusive" id="exclusive" textValue={t(
                      "admin-shipping-classes-resolution-exclusive-label",
                      "Exclusive — replaces other rates",
                    )}>
                      {t(
                        "admin-shipping-classes-resolution-exclusive-label",
                        "Exclusive — replaces other rates",
                      )}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    <ListBox.Item key="additive" id="additive" textValue={t(
                      "admin-shipping-classes-resolution-additive-label",
                      "Additive — adds to other rates",
                    )}>
                      {t(
                        "admin-shipping-classes-resolution-additive-label",
                        "Additive — adds to other rates",
                      )}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
              {isClassEditMode && (
                <Select
                  value={classFormData.status}
                  onChange={(value) =>
                    setClassFormData({
                      ...classFormData,
                      status: value as any,
                    })
                  }
                >
                  <Label>{t("admin-shipping-classes-status")}</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item key="active" id="active" textValue={t("admin-shipping-classes-active")}>
                        {t("admin-shipping-classes-active")}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      <ListBox.Item key="inactive" id="inactive" textValue={t("admin-shipping-classes-inactive")}>
                        {t("admin-shipping-classes-inactive")}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    </ListBox>
                  </Select.Popover>
                </Select>
              )}
                </Modal.Body>
                <Modal.Footer>
                  <Button
                    variant="tertiary"
                    onPress={classClose}
                  >
                    {t("admin-shipping-classes-modal-cancel")}
                  </Button>
                  <Button
                    variant="primary"
                    isDisabled={!classFormData.code || !classFormData.display_name}
                    onPress={handleSaveClass}
                  >
                    {t("admin-shipping-classes-modal-save")}
                  </Button>
                </Modal.Footer>
                </>
              )}
            </Modal.Dialog>
          </Modal.Container>
        </Modal>
      </div>
    </DefaultLayout>
  );
}
