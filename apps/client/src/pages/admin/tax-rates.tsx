/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
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
import { Plus, Edit2, Trash2 } from "lucide-react";


import DefaultLayout from "@/layouts/default";
import { useSecuredApi } from "@/authentication";
import { LocalizedTaxNameInput } from "@/components/LocalizedTaxNameInput";
import { getTaxNameForLocale } from "@/utils/description";
import { availableLanguages } from "@/i18n";

interface TaxRate {
  id: string;
  display_name: string;
  country_code: string | null;
  tax_code: string | null;
  rate_percentage: number;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS = ["active", "inactive"];

export default function TaxRatesPage() {
  const { t, i18n } = useTranslation();
  const { getJson, postJson, deleteJson, patchJson } = useSecuredApi();

  const apiBase = (import.meta as any).env?.API_BASE_URL || "";

  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const modalState = useOverlayState();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingTaxRate, setEditingTaxRate] = useState<TaxRate | null>(null);
  const [formData, setFormData] = useState({
    display_name: "",
    country_code: "" as string | null,
    tax_code: "" as string | null,
    rate_percentage: 0,
    status: "active" as "active" | "inactive",
  });
  const [selectedLocale, setSelectedLocale] = useState(
    availableLanguages.find((l) => l.isDefault)?.code || "en-US",
  );

  const loadData = async () => {
    try {
      const resp = await getJson(`${apiBase}/v1/tax-rates?limit=100`);

      setTaxRates(resp.items || []);
    } catch (err) {
      console.error("Failed to load tax rates", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const displayed = useMemo(() => {
    let filtered = taxRates;

    if (statusFilter) {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }
    const term = globalFilter.trim().toLowerCase();

    if (term) {
      filtered = filtered.filter(
        (r) =>
          getTaxNameForLocale(r.display_name, i18n.language)
            .toLowerCase()
            .includes(term) ||
          (r.country_code?.toLowerCase() || "").includes(term) ||
          (r.tax_code?.toLowerCase() || "").includes(term),
      );
    }

    return filtered;
  }, [taxRates, statusFilter, globalFilter]);

  const handleOpenCreate = () => {
    setIsEditMode(false);
    setEditingTaxRate(null);
    setFormData({
      display_name: "",
      country_code: "",
      tax_code: "",
      rate_percentage: 0,
      status: "active",
    });
    setSelectedLocale(
      availableLanguages.find((l) => l.isDefault)?.code || "en-US",
    );
    modalState.open();
  };

  const handleOpenEdit = (taxRate: TaxRate) => {
    setIsEditMode(true);
    setEditingTaxRate(taxRate);
    setFormData({
      display_name: taxRate.display_name,
      country_code: taxRate.country_code || "",
      tax_code: taxRate.tax_code || "",
      rate_percentage: taxRate.rate_percentage,
      status: taxRate.status,
    });
    modalState.open();
  };

  const handleSave = async () => {
    try {
      const payload = {
        ...formData,
        country_code: formData.country_code?.trim() || null,
        tax_code: formData.tax_code?.trim() || null,
        rate_percentage: Number(formData.rate_percentage),
      };

      if (isEditMode && editingTaxRate) {
        const response = await patchJson(
          `${apiBase}/v1/tax-rates/${editingTaxRate.id}`,
          payload,
        );

        if (response) {
          setTaxRates(
            taxRates.map((r) => (r.id === editingTaxRate.id ? response : r)),
          );
        } else {
          await loadData();
        }
      } else {
        const response = await postJson(`${apiBase}/v1/tax-rates`, payload);

        if (response) {
          setTaxRates([...taxRates, response]);
        } else {
          await loadData();
        }
      }
      modalState.close();
    } catch (err) {
      console.error("Failed to save tax rate", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this tax rate?")) {
      try {
        await deleteJson(`${apiBase}/v1/tax-rates/${id}`);
        setTaxRates(taxRates.filter((r) => r.id !== id));
      } catch (err) {
        console.error("Failed to delete tax rate", err);
      }
    }
  };

  return (
    <DefaultLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">{t("admin-tax-rates-title")}</h1>
          <Button
            variant="primary"
            onPress={handleOpenCreate}
          >
            <Plus className="w-4 h-4" />
            {t("admin-tax-rates-add")}
          </Button>
        </div>

        <Card className="mb-6">
          <Card.Content className="flex flex-row gap-4">
            <TextField className="w-full">
              <Input
                placeholder={t("admin-tax-rates-filter-placeholder")}
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
              />
            </TextField>
            <Select
              className="w-48"
              value={statusFilter || ""}
              onChange={(value) => setStatusFilter((value as string) || "")}
            >
              <Label>{t("admin-common-status")}</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  <ListBox.Item id="" textValue={t("all")}>
                    {t("all")}
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
            <Table aria-label="Tax Rates Table">
              <Table.Header>
                <Table.Column>{t("admin-common-name")}</Table.Column>
                <Table.Column>{t("admin-tax-rates-country-code")}</Table.Column>
                <Table.Column>{t("admin-tax-rates-tax-code")}</Table.Column>
                <Table.Column>{t("admin-tax-rates-rate")}</Table.Column>
                <Table.Column>{t("admin-common-status")}</Table.Column>
                <Table.Column width={100}>
                  {t("admin-common-actions")}
                </Table.Column>
              </Table.Header>
              <Table.Body
                renderEmptyState={() => t("admin-common-empty")}
                items={displayed}
              >
                {(item) => (
                  <Table.Row key={item.id} className="odd:bg-default-50">
                    <Table.Cell>
                      {getTaxNameForLocale(item.display_name, i18n.language)}
                    </Table.Cell>
                    <Table.Cell>
                      {item.country_code || (
                        <span className="text-gray-400 italic">
                          {t("admin-tax-rates-fallback")}
                        </span>
                      )}
                    </Table.Cell>
                    <Table.Cell>{item.tax_code || "-"}</Table.Cell>
                    <Table.Cell>{item.rate_percentage}%</Table.Cell>
                    <Table.Cell>
                      <span
                        className={
                          item.status === "active"
                            ? "text-green-600 font-semibold"
                            : "text-gray-400"
                        }
                      >
                        {item.status}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex gap-2">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="tertiary"
                          onPress={() => handleOpenEdit(item)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="danger"
                          onPress={() => handleDelete(item.id)}
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

        <Modal state={modalState}>
          <Modal.Backdrop>
            <Modal.Container size="lg">
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.Header>
                    <Modal.Heading>
                      {isEditMode
                        ? t("admin-tax-rates-edit")
                        : t("admin-tax-rates-create")}
                    </Modal.Heading>
                  </Modal.Header>
                  <Modal.Body className="gap-4">
              <div className="flex items-center gap-2">
                <label className="block text-sm font-medium">
                  {t("admin-products-title-locale")}
                </label>
                <Select
                  className="w-36"
                  value={selectedLocale}
                  onChange={(value) => setSelectedLocale((value as string) || "en-US")}
                >
                  <Label>{t("admin-products-title-locale")}</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {availableLanguages.map((lang) => (
                        <ListBox.Item key={lang.code} id={lang.code} textValue={lang.nativeName}>
                          {lang.nativeName}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t("admin-common-name")}
                </label>
                <LocalizedTaxNameInput
                  required
                  locale={selectedLocale}
                  value={formData.display_name}
                  onChange={(val) =>
                    setFormData({ ...formData, display_name: val })
                  }
                  onLocaleChange={setSelectedLocale}
                />
              </div>
              <div className="flex gap-4">
                <Tooltip>
                  <Tooltip.Trigger>
                    <TextField className="flex-1">
                      <Label>{t("admin-tax-rates-country-code")}</Label>
                      <Input
                        maxLength={2}
                        placeholder="FR"
                        value={formData.country_code || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            country_code: e.target.value.toUpperCase(),
                          })
                        }
                      />
                    </TextField>
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    {t("admin-tax-rates-country-help")}
                  </Tooltip.Content>
                </Tooltip>
                <Tooltip>
                  <Tooltip.Trigger>
                    <TextField className="flex-1">
                      <Label>{t("admin-tax-rates-tax-code")}</Label>
                      <Input
                        placeholder="txcd_99999999"
                        value={formData.tax_code || ""}
                        onChange={(e) =>
                          setFormData({ ...formData, tax_code: e.target.value })
                        }
                      />
                    </TextField>
                  </Tooltip.Trigger>
                  <Tooltip.Content>
                    {t("admin-tax-rates-tax-code-help")}
                  </Tooltip.Content>
                </Tooltip>
              </div>
              <Tooltip>
                <Tooltip.Trigger>
                  <TextField>
                    <Label>{t("admin-tax-rates-rate")}</Label>
                    <Input
                      placeholder="20.0"
                      type="number"
                      value={formData.rate_percentage.toString()}
                      onChange={(e) =>
                        setFormData({ ...formData, rate_percentage: Number(e.target.value) })
                      }
                    />
                  </TextField>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t("admin-tax-rates-rate-help")}
                </Tooltip.Content>
              </Tooltip>
              <Select
                value={formData.status}
                onChange={(value) =>
                  setFormData({
                    ...formData,
                    status: value as any,
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
                  </Modal.Body>
                  <Modal.Footer>
                    <Button variant="tertiary" onPress={close}>
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
          </Modal.Backdrop>
        </Modal>
      </div>
    </DefaultLayout>
  );
}
