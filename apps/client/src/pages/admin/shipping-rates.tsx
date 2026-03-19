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
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/modal";
import { Card, CardBody } from "@heroui/card";
import { Tooltip } from "@heroui/tooltip";
import { Switch } from "@heroui/switch";
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
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [taxRates, setTaxRates] = useState<{ tax_code: string | null; display_name: string }[]>([]);

  // Modal state
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingRate, setEditingRate] = useState<ShippingRate | null>(null);
  const [pricesByDivisa, setPricesByDivisa] = useState<Record<string, number>>({});
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
  const {
    isOpen: isClassModalOpen,
    onOpen: onClassModalOpen,
    onOpenChange: onClassModalOpenChange
  } = useDisclosure();
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
    setLoading(true);
    try {
      const apiUrl = `${apiBase}/v1/regions/shipping-rates?limit=100`;
      console.log('📍 Loading shipping rates from:', apiUrl);

      const ratesResp = await getJson(apiUrl);
      console.log('📦 Rates Response:', ratesResp);

      if (!ratesResp || !ratesResp.items) {
        console.warn('⚠️ Rates response invalid:', ratesResp);
        setShippingRates([]);
        setLoading(false);
        return;
      }

      // First, set rates without prices to show them immediately
      const rates: ShippingRate[] = ratesResp.items || [];
      console.log('✅ Found rates:', rates.length);
      setShippingRates(rates);

      // Then, load currencies and prices asynchronously
      try {
        const currenciesResp = await getJson(`${apiBase}/v1/regions/currencies?limit=100`);
        const currencies: Currency[] = currenciesResp.items || [];
        setCurrencies(currencies);
        console.log('💱 Currencies loaded:', currencies.length);

        const defaultCurrency = currencies[0];
        if (!defaultCurrency) {
          console.warn('⚠️ No default currency found');
          return;
        }

        // Load prices for each rate
        const ratesWithPrices = await Promise.all(
          rates.map(async (rate) => {
            try {
              const priceResp = await getJson(
                `${apiBase}/v1/regions/shipping-rates/${rate.id}/prices?currency_id=${defaultCurrency.id}`,
              );
              const priceItem = Array.isArray(priceResp.items) ? priceResp.items[0] : null;
              return {
                ...rate,
                price_cents: priceItem?.amount_cents,
                currency_code: defaultCurrency.code,
              };
            } catch (err) {
              console.warn(`⚠️ No price for rate ${rate.id}:`, err);
              return { ...rate, currency_code: defaultCurrency.code };
            }
          })
        );

        console.log('💰 Rates with prices:', ratesWithPrices.length);
        setShippingRates(ratesWithPrices);
      } catch (priceErr) {
        console.warn('⚠️ Failed to load prices, showing rates without prices:', priceErr);
        // Keep the rates without prices - they're already set above
      }
    } catch (err) {
      console.error('❌ Failed to load shipping rates:', err);
      setShippingRates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Load shipping classes for selector
  useEffect(() => {
    const loadShippingClasses = async () => {
      try {
        const resp = await getJson(`${apiBase}/v1/regions/shipping-classes?limit=100`);
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
        setTaxRates(Array.from(uniqueRates.entries()).map(([tax_code, display_name]) => ({ tax_code, display_name })));
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
    onOpen();
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
            console.log(`💰 Price for currency ${currency.code} (${currency.id}):`, priceResp);
            const priceItem = Array.isArray(priceResp.items) ? priceResp.items[0] : null;
            if (priceItem?.amount_cents != null) {
              priceCache[currency.id] = priceItem.amount_cents;
              console.log(`✅ Cached ${currency.code}: ${priceItem.amount_cents} cents`);
            } else {
              console.warn(`⚠️ No price found for ${currency.code}`);
            }
          } catch (err) {
            console.warn(`⚠️ Failed to load price for ${currency.code}:`, err);
          }
        })
      );
    }
    console.log('📦 Final price cache:', priceCache);
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
    onOpen();
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

      const currencyCode =
        currencies.find((c) => c.id === formData.currency_id)?.code;

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
                  price_cents: formData.price ? Math.round(parseFloat(formData.price) * 100) : r.price_cents,
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
              price_cents: formData.price ? Math.round(parseFloat(formData.price) * 100) : undefined,
              currency_code: currencyCode,
            },
          ]);
        } else {
          await loadData();
        }
      }
      onOpenChange();
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
    onClassModalOpen();
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
    onClassModalOpen();
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
          const resp = await getJson(`${apiBase}/v1/regions/shipping-classes?limit=100`);
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
          const resp = await getJson(`${apiBase}/v1/regions/shipping-classes?limit=100`);
          setShippingClasses(resp.items || []);
        }
      }
      onClassModalOpenChange();
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
            color="primary"
            endContent={<Plus className="w-4 h-4" />}
            onPress={handleOpenCreate}
          >
            {t("admin-shipping-rates-add")}
          </Button>
        </div>

        <Card className="mb-6">
          <CardBody className="flex gap-4">
            <Input
              isClearable
              className="w-full"
              placeholder={t("admin-common-search", "Search...")}
              startContent={<SearchIcon className="w-4 h-4" />}
              value={globalFilter}
              onValueChange={setGlobalFilter}
            />
            <Select
              label={t("admin-common-status", "Status")}
              selectedKeys={statusFilter ? [statusFilter] : []}
              onSelectionChange={(key) =>
                setStatusFilter(Array.from(key).join(""))
              }
            >
              <SelectItem key="">All</SelectItem>
              <SelectItem key="active">Active</SelectItem>
              <SelectItem key="inactive">Inactive</SelectItem>
            </Select>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Table isStriped>
              <TableHeader>
                <TableColumn key="display_name">
                  {t("admin-common-name", "Name")}
                </TableColumn>
                <TableColumn key="description">
                  {t("admin-common-description", "Description")}
                </TableColumn>
                <TableColumn key="max_weight">
                  {t("admin-shipping-rates-max-weight", "Max Weight (g)")}
                </TableColumn>
                <TableColumn key="price">
                  {t("admin-shipping-rates-price", "Price")}
                </TableColumn>
                <TableColumn key="delivery_days">
                  {t("admin-shipping-rates-delivery-days", "Delivery Days")}
                </TableColumn>
                <TableColumn key="status">
                  {t("admin-common-status", "Status")}
                </TableColumn>
                <TableColumn key="actions">
                  {t("admin-common-actions", "Actions")}
                </TableColumn>
              </TableHeader>
              <TableBody
                emptyContent={<div>{t("admin-common-empty", "No data")}</div>}
                isLoading={loading}
                items={displayed}
                loadingContent={
                  <div>{t("admin-common-loading", "Loading...")}</div>
                }
              >
                {(rate) => (
                  <TableRow key={rate.id}>
                    <TableCell>{rate.display_name}</TableCell>
                    <TableCell>
                      {rate.description
                        ? rate.description.substring(0, 50)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {rate.max_weight_g ? `${rate.max_weight_g}g` : "-"}
                    </TableCell>
                    <TableCell>
                      {rate.price_cents != null && rate.currency_code
                        ? formatMoney(rate.price_cents, rate.currency_code)
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {rate.min_delivery_days || rate.max_delivery_days
                        ? `${rate.min_delivery_days || "?"}-${rate.max_delivery_days || "?"} days`
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          rate.status === "active"
                            ? "text-green-600"
                            : "text-gray-600"
                        }
                      >
                        {rate.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onPress={() => handleOpenEdit(rate)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          isIconOnly
                          color="danger"
                          size="sm"
                          variant="light"
                          onPress={() => handleDelete(rate.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardBody>
        </Card>

        {/* ─── Shipping Classes Section ──────────────────────────────────── */}
        <div className="mt-12 pt-6 border-t">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">
              {t("admin-shipping-classes-title", "Shipping Classes")}
            </h2>
            <Button
              color="primary"
              endContent={<Plus className="w-4 h-4" />}
              onPress={handleOpenCreateClass}
            >
              {t("admin-shipping-classes-btn-new", "New Class")}
            </Button>
          </div>

          <Card>
            <CardBody>
              <Table isStriped>
                <TableHeader>
                  <TableColumn key="code">
                    {t("admin-shipping-classes-col-code", "Code")}
                  </TableColumn>
                  <TableColumn key="display_name">
                    {t("admin-shipping-classes-col-name", "Name")}
                  </TableColumn>
                  <TableColumn key="resolution">
                    {t("admin-shipping-classes-col-resolution", "Mode")}
                  </TableColumn>
                  <TableColumn key="description">
                    {t("admin-shipping-classes-col-description", "Description")}
                  </TableColumn>
                  <TableColumn key="status">
                    {t("admin-shipping-classes-col-status", "Status")}
                  </TableColumn>
                  <TableColumn key="actions">
                    {t("admin-shipping-classes-col-actions", "Actions")}
                  </TableColumn>
                </TableHeader>
                <TableBody
                  emptyContent={<div>{t("admin-shipping-classes-empty", "No shipping classes")}</div>}
                  items={shippingClasses}
                >
                  {(cls) => (
                    <TableRow key={cls.id}>
                      <TableCell>
                        <code className="text-xs bg-default-100 px-2 py-0.5 rounded">
                          {cls.code}
                        </code>
                      </TableCell>
                      <TableCell className="font-medium">
                        {cls.display_name}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs px-2 py-1 rounded" style={{
                          backgroundColor: cls.resolution === 'exclusive' ? '#fed7aa' : '#dbeafe',
                          color: cls.resolution === 'exclusive' ? '#92400e' : '#0c2340'
                        }}>
                          {cls.resolution === 'exclusive'
                            ? t("admin-shipping-classes-exclusive", "Exclusive")
                            : t("admin-shipping-classes-additive", "Additive")}
                        </span>
                      </TableCell>
                      <TableCell className="text-default-500 text-sm">
                        {cls.description ? cls.description.substring(0, 40) + (cls.description.length > 40 ? '...' : '') : '—'}
                      </TableCell>
                      <TableCell>
                        <span className={cls.status === 'active' ? 'text-green-600 font-medium' : 'text-gray-400'}>
                          {cls.status}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Tooltip content={t("admin-shipping-classes-btn-edit", "Edit")}>
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              onPress={() => handleOpenEditClass(cls)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          </Tooltip>
                          <Tooltip content={t("admin-shipping-classes-btn-delete", "Delete")} color="danger">
                            <Button
                              isIconOnly
                              color="danger"
                              size="sm"
                              variant="light"
                              onPress={() => handleDeleteClass(cls.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardBody>
          </Card>
        </div>

        {/* Create / Edit Shipping Rate Modal */}
        <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
          <ModalContent>
            <ModalHeader className="flex flex-col gap-1">
              {isEditMode
                ? t("admin-shipping-rates-edit")
                : t("admin-shipping-rates-create")}
            </ModalHeader>
            <ModalBody>
              <Tooltip
                content={t(
                  "admin-common-name",
                  "Display name for this shipping rate",
                )}
              >
                <Input
                  label={t("admin-common-name", "Name")}
                  placeholder="Standard Shipping"
                  value={formData.display_name}
                  onValueChange={(value) =>
                    setFormData({ ...formData, display_name: value })
                  }
                />
              </Tooltip>
              <Tooltip
                content={t(
                  "admin-common-description",
                  "Describe this shipping option",
                )}
              >
                <Input
                  label={t("admin-common-description", "Description")}
                  placeholder="Fast delivery option"
                  value={formData.description}
                  onValueChange={(value) =>
                    setFormData({ ...formData, description: value })
                  }
                />
              </Tooltip>
              <Tooltip
                content={t(
                  "admin-shipping-rates-max-weight-help",
                  "Maximum package weight for this rate",
                )}
              >
                <Input
                  label={t("admin-shipping-rates-max-weight", "Max Weight (g)")}
                  min={0}
                  placeholder="5000"
                  type="number"
                  value={formData.max_weight_g}
                  onValueChange={(value) =>
                    setFormData({ ...formData, max_weight_g: value })
                  }
                />
              </Tooltip>
              <Tooltip
                content={t(
                  "admin-shipping-rates-shipping-class-help",
                  "Classe d'expédition (laissez vide pour un tarif universel)",
                )}
              >
                <Select
                  label="Classe d'expédition (optionnel)"
                  description="Laissez vide pour un tarif universel (tous les produits standards)"
                  selectedKeys={formData.shipping_class_id ? [formData.shipping_class_id] : []}
                  onSelectionChange={(keys) => {
                    const val = Array.from(keys).join("");
                    setFormData({ ...formData, shipping_class_id: val });
                  }}
                >
                  <SelectItem key="">Universel — tous produits standards</SelectItem>
                  <>
                    {shippingClasses.map((cls) => (
                      <SelectItem
                        key={cls.id}
                        textValue={`[${cls.resolution === "exclusive" ? "EXCL" : "ADD"}] ${cls.display_name}`}
                      >
                        {`[${cls.resolution === "exclusive" ? "EXCL" : "ADD"}] ${cls.display_name}`}
                      </SelectItem>
                    ))}
                  </>
                </Select>
              </Tooltip>
              <Tooltip
                content={t(
                  "admin-shipping-rates-min-delivery-days-help",
                  "Minimum days until delivery",
                )}
              >
                <Input
                  label={t(
                    "admin-shipping-rates-min-delivery-days",
                    "Min Delivery Days",
                  )}
                  min={0}
                  placeholder="1"
                  type="number"
                  value={formData.min_delivery_days}
                  onValueChange={(value) =>
                    setFormData({ ...formData, min_delivery_days: value })
                  }
                />
              </Tooltip>
              <Tooltip
                content={t(
                  "admin-shipping-rates-max-delivery-days-help",
                  "Maximum days until delivery",
                )}
              >
                <Input
                  label={t(
                    "admin-shipping-rates-max-delivery-days",
                    "Max Delivery Days",
                  )}
                  min={0}
                  placeholder="7"
                  type="number"
                  value={formData.max_delivery_days}
                  onValueChange={(value) =>
                    setFormData({ ...formData, max_delivery_days: value })
                  }
                />
              </Tooltip>
              <Tooltip content={t("admin-common-status", "Status")}>
                <Select
                  label={t("admin-common-status", "Status")}
                  selectedKeys={[formData.status]}
                  onSelectionChange={(key) =>
                    setFormData({
                      ...formData,
                      status: Array.from(key).join("") as "active" | "inactive",
                    })
                  }
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt}>{opt}</SelectItem>
                  ))}
                </Select>
              </Tooltip>
              <Tooltip
                content={t(
                  "admin-shipping-rates-tax-code-help",
                  "Tax code for this shipping rate (e.g. VAT for Chronopost)"
                )}
              >
                <Select
                  label={t("admin-shipping-rates-tax-code", "Code de taxe (optionnel)")}
                  description={t("admin-shipping-rates-tax-code-desc", "Laissez vide pour aucune taxe spécifique")}
                  selectedKeys={formData.tax_code ? [formData.tax_code] : []}
                  onSelectionChange={(keys) => {
                    const val = Array.from(keys).join("");
                    setFormData({ ...formData, tax_code: val });
                  }}
                  items={[
                    { tax_code: "", display_name: "Aucune taxe spécifique" },
                    ...taxRates as { tax_code: string | null; display_name: string }[]
                  ]}
                >
                  {(rate: any) => (
                    <SelectItem
                      key={rate.tax_code || "null"}
                      textValue={rate.tax_code ? `${resolveTaxName(rate.display_name, i18n.language)} (${rate.tax_code})` : rate.display_name}
                    >
                      {rate.tax_code ? `${resolveTaxName(rate.display_name, i18n.language)} (${rate.tax_code})` : rate.display_name}
                    </SelectItem>
                  )}
                </Select>
              </Tooltip>

              <div className="flex items-center gap-4 mt-2 mb-4">
                <Switch
                  isSelected={formData.tax_inclusive}
                  onValueChange={(val) => setFormData({ ...formData, tax_inclusive: val })}
                >
                  {t("admin-shipping-rates-tax-inclusive", "Les prix incluent les taxes")}
                </Switch>
                <Tooltip content={t("admin-shipping-rates-tax-inclusive-help", "Cochez si le tarif de livraison configuré est TTC")}>
                  <div className="text-xs text-default-400 cursor-help underline decoration-dotted">
                    {t("common-help", "Aide")}
                  </div>
                </Tooltip>
              </div>

              <Tooltip
                content={t(
                  "admin-shipping-rates-price-help",
                  "Shipping cost for this rate (in selected currency)",
                )}
              >
                <div className="flex gap-2">
                  <Select
                    label={t("admin-common-currency", "Currency")}
                    selectedKeys={formData.currency_id ? [formData.currency_id] : []}
                    onSelectionChange={(key) => {
                      const newCurrencyId = Array.from(key).join("");
                      console.log('💱 Changing currency to:', newCurrencyId);
                      console.log('📦 pricesByDivisa:', pricesByDivisa);
                      console.log('💰 Price for this currency:', pricesByDivisa[newCurrencyId]);

                      const newPrice = pricesByDivisa[newCurrencyId] !== undefined
                        ? (pricesByDivisa[newCurrencyId] / 100).toFixed(2)
                        : "";

                      console.log('✅ Setting price to:', newPrice);

                      setFormData({
                        ...formData,
                        currency_id: newCurrencyId,
                        price: newPrice,
                      });
                    }}
                    className="w-32"
                  >
                    {currencies.map((c) => (
                      <SelectItem key={c.id}>{c.code}</SelectItem>
                    ))}
                  </Select>
                  <Input
                    label={t("admin-shipping-rates-price", "Price")}
                    placeholder="0.00"
                    type="number"
                    min={0}
                    step={0.01}
                    value={formData.price}
                    onValueChange={(value) =>
                      setFormData({ ...formData, price: value })
                    }
                  />
                </div>
              </Tooltip>
            </ModalBody>
            <ModalFooter>
              <Button
                color="default"
                variant="light"
                onPress={() => onOpenChange()}
              >
                {t("admin-common-cancel", "Cancel")}
              </Button>
              <Button
                color="primary"
                isDisabled={!formData.display_name}
                onPress={handleSave}
              >
                {t("admin-common-save", "Save")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {/* Create / Edit Shipping Class Modal */}
        <Modal isOpen={isClassModalOpen} onOpenChange={onClassModalOpenChange} size="lg">
          <ModalContent>
            <ModalHeader className="flex flex-col gap-1">
              {isClassEditMode
                ? t("admin-shipping-classes-modal-title-edit", "Edit Shipping Class")
                : t("admin-shipping-classes-modal-title-create", "New Shipping Class")}
            </ModalHeader>
            <ModalBody className="gap-4">
              <Tooltip content={t("admin-shipping-classes-code-help", "Unique lowercase identifier")}>
                <Input
                  isRequired
                  isDisabled={isClassEditMode}
                  label={t("admin-shipping-classes-code", "Code")}
                  placeholder={t("admin-shipping-classes-code-placeholder", "e.g., oversized")}
                  value={classFormData.code}
                  onValueChange={(v) =>
                    setClassFormData({ ...classFormData, code: v.toLowerCase() })
                  }
                />
              </Tooltip>
              <Input
                isRequired
                label={t("admin-shipping-classes-display-name", "Display Name")}
                placeholder={t("admin-shipping-classes-display-name-placeholder", "e.g., Oversized Items")}
                value={classFormData.display_name}
                onValueChange={(v) =>
                  setClassFormData({ ...classFormData, display_name: v })
                }
              />
              <Input
                label={t("admin-shipping-classes-description", "Description (optional)")}
                placeholder={t("admin-shipping-classes-description-placeholder", "e.g., For items > 50kg")}
                value={classFormData.description}
                onValueChange={(v) =>
                  setClassFormData({ ...classFormData, description: v })
                }
              />
              <Select
                isRequired
                label={t("admin-shipping-classes-resolution-mode", "Resolution Mode")}
                description={
                  classFormData.resolution === 'exclusive'
                    ? t("admin-shipping-classes-resolution-exclusive-desc", "⚠ Exclusive: hides all other rates")
                    : t("admin-shipping-classes-resolution-additive-desc", "✓ Additive: adds to other rates")
                }
                selectedKeys={[classFormData.resolution]}
                onSelectionChange={(key) =>
                  setClassFormData({
                    ...classFormData,
                    resolution: Array.from(key).join('') as any,
                  })
                }
              >
                <SelectItem key="exclusive">
                  {t("admin-shipping-classes-resolution-exclusive-label", "Exclusive — replaces other rates")}
                </SelectItem>
                <SelectItem key="additive">
                  {t("admin-shipping-classes-resolution-additive-label", "Additive — adds to other rates")}
                </SelectItem>
              </Select>
              {isClassEditMode && (
                <Select
                  label={t("admin-shipping-classes-status", "Status")}
                  selectedKeys={[classFormData.status]}
                  onSelectionChange={(key) =>
                    setClassFormData({
                      ...classFormData,
                      status: Array.from(key).join('') as any,
                    })
                  }
                >
                  <SelectItem key="active">{t("admin-shipping-classes-active", "Active")}</SelectItem>
                  <SelectItem key="inactive">{t("admin-shipping-classes-inactive", "Inactive")}</SelectItem>
                </Select>
              )}
            </ModalBody>
            <ModalFooter>
              <Button
                color="default"
                variant="light"
                onPress={() => onClassModalOpenChange()}
              >
                {t("admin-shipping-classes-modal-cancel", "Cancel")}
              </Button>
              <Button
                color="primary"
                isDisabled={!classFormData.code || !classFormData.display_name}
                onPress={handleSaveClass}
              >
                {t("admin-shipping-classes-modal-save", "Save")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </DefaultLayout>
  );
}
