/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
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
import { Plus, Edit2, Trash2 } from "lucide-react";

import { SearchIcon } from "@/components/icons";
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
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingTaxRate, setEditingTaxRate] = useState<TaxRate | null>(null);
  const [formData, setFormData] = useState({
    display_name: "",
    country_code: "" as string | null,
    tax_code: "" as string | null,
    rate_percentage: 0,
    status: "active" as "active" | "inactive",
  });
  const [selectedLocale, setSelectedLocale] = useState(availableLanguages.find(l => l.isDefault)?.code || "en-US");

  const loadData = async () => {
    setLoading(true);
    try {
      const resp = await getJson(`${apiBase}/v1/tax-rates?limit=100`);
      setTaxRates(resp.items || []);
    } catch (err) {
      console.error("Failed to load tax rates", err);
    } finally {
      setLoading(false);
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
          getTaxNameForLocale(r.display_name, i18n.language).toLowerCase().includes(term) ||
          (r.country_code?.toLowerCase() || "").includes(term) ||
          (r.tax_code?.toLowerCase() || "").includes(term)
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
    setSelectedLocale(availableLanguages.find(l => l.isDefault)?.code || "en-US");
    onOpen();
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
    onOpen();
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
          payload
        );
        if (response) {
          setTaxRates(taxRates.map((r) => (r.id === editingTaxRate.id ? response : r)));
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
      onOpenChange();
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
            color="primary"
            endContent={<Plus className="w-4 h-4" />}
            onPress={handleOpenCreate}
          >
            {t("admin-tax-rates-add")}
          </Button>
        </div>

        <Card className="mb-6">
          <CardBody className="flex flex-row gap-4">
            <Input
              isClearable
              className="w-full"
              placeholder={t("admin-common-search")}
              startContent={<SearchIcon className="w-4 h-4" />}
              value={globalFilter}
              onValueChange={setGlobalFilter}
            />
            <Select
              className="w-48"
              label={t("admin-common-status")}
              selectedKeys={statusFilter ? [statusFilter] : []}
              onSelectionChange={(key) => setStatusFilter(Array.from(key).join(""))}
            >
              <SelectItem key="">{t("all")}</SelectItem>
              <SelectItem key="active">Active</SelectItem>
              <SelectItem key="inactive">Inactive</SelectItem>
            </Select>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <Table isStriped aria-label="Tax Rates Table">
              <TableHeader>
                <TableColumn>{t("admin-common-name")}</TableColumn>
                <TableColumn>{t("admin-tax-rates-country-code")}</TableColumn>
                <TableColumn>{t("admin-tax-rates-tax-code")}</TableColumn>
                <TableColumn>{t("admin-tax-rates-rate")}</TableColumn>
                <TableColumn>{t("admin-common-status")}</TableColumn>
                <TableColumn width={100}>{t("admin-common-actions")}</TableColumn>
              </TableHeader>
              <TableBody
                emptyContent={t("admin-common-empty")}
                isLoading={loading}
                items={displayed}
              >
                {(item) => (
                  <TableRow key={item.id}>
                    <TableCell>{getTaxNameForLocale(item.display_name, i18n.language)}</TableCell>
                    <TableCell>{item.country_code || <span className="text-gray-400 italic">{t("admin-tax-rates-fallback")}</span>}</TableCell>
                    <TableCell>{item.tax_code || "-"}</TableCell>
                    <TableCell>{item.rate_percentage}%</TableCell>
                    <TableCell>
                      <span className={item.status === "active" ? "text-green-600 font-semibold" : "text-gray-400"}>
                        {item.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button isIconOnly size="sm" variant="light" onPress={() => handleOpenEdit(item)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button isIconOnly color="danger" size="sm" variant="light" onPress={() => handleDelete(item.id)}>
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

        <Modal isOpen={isOpen} size="lg" onOpenChange={onOpenChange}>
          <ModalContent>
            <ModalHeader>
              {isEditMode ? t("admin-tax-rates-edit") : t("admin-tax-rates-create")}
            </ModalHeader>
            <ModalBody className="gap-4">
              <div className="flex items-center gap-2">
                <label className="block text-sm font-medium">
                  {t("admin-products-title-locale", "Language")}
                </label>
                <Select
                  size="sm"
                  className="w-36"
                  selectedKeys={[selectedLocale]}
                  onSelectionChange={(keys) =>
                    setSelectedLocale(Array.from(keys).join(""))
                  }
                >
                  {availableLanguages.map((lang) => (
                    <SelectItem key={lang.code}>{lang.nativeName}</SelectItem>
                  ))}
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
                  onChange={(val) => setFormData({ ...formData, display_name: val })}
                  onLocaleChange={setSelectedLocale}
                />
              </div>
              <div className="flex gap-4">
                <Tooltip content={t("admin-tax-rates-country-help")}>
                    <Input
                    className="flex-1"
                    label={t("admin-tax-rates-country-code")}
                    placeholder="FR"
                    value={formData.country_code || ""}
                    onValueChange={(val) => setFormData({ ...formData, country_code: val.toUpperCase() })}
                    maxLength={2}
                    />
                </Tooltip>
                <Tooltip content={t("admin-tax-rates-tax-code-help")}>
                    <Input
                    className="flex-1"
                    label={t("admin-tax-rates-tax-code")}
                    placeholder="txcd_99999999"
                    value={formData.tax_code || ""}
                    onValueChange={(val) => setFormData({ ...formData, tax_code: val })}
                    />
                </Tooltip>
              </div>
              <Tooltip content={t("admin-tax-rates-rate-help")}>
                <Input
                  type="number"
                  label={t("admin-tax-rates-rate")}
                  placeholder="20.0"
                  value={formData.rate_percentage.toString()}
                  onValueChange={(val) => setFormData({ ...formData, rate_percentage: Number(val) })}
                />
              </Tooltip>
              <Select
                label={t("admin-common-status")}
                selectedKeys={[formData.status]}
                onSelectionChange={(key) => setFormData({ ...formData, status: Array.from(key).join("") as any })}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt}>{opt}</SelectItem>
                ))}
              </Select>
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={() => onOpenChange()}>
                {t("admin-common-cancel")}
              </Button>
              <Button color="primary" isDisabled={!formData.display_name} onPress={handleSave}>
                {t("admin-common-save")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </DefaultLayout>
  );
}
