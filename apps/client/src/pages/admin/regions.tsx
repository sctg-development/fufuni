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
import { Input } from "@heroui/react";
import { Select, SelectItem } from "@heroui/react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/react";
import { Checkbox } from "@heroui/react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/react";
import { Card, CardBody } from "@heroui/react";
import { Tooltip } from "@heroui/react";
import { Plus, Edit2, Trash2 } from "lucide-react";

import { SearchIcon } from "@/components/icons";
import DefaultLayout from "@/layouts/default";
import { useSecuredApi } from "@/authentication";

/**
 * A geographical or market region used by the platform.
 */
interface Region {
  id: string;
  display_name: string;
  currency_id: string;
  currency_code?: string;
  is_default: boolean;
  tax_inclusive: boolean;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

/**
 * Currency metadata used when selecting a region's primary currency.
 */
interface Currency {
  id: string;
  code: string;
  display_name: string;
}

/**
 * Possible status values for a region.
 */
const STATUS_OPTIONS = ["active", "inactive"];

export default function RegionsPage() {
  const { t } = useTranslation();
  const { getJson, postJson, deleteJson, patchJson } = useSecuredApi();

  const apiBase = (import.meta as any).env?.API_BASE_URL
    ? (import.meta as any).env.API_BASE_URL
    : "";

  // List state
  const [regions, setRegions] = useState<Region[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Modal state
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [formData, setFormData] = useState({
    display_name: "",
    currency_id: "",
    is_default: false,
    tax_inclusive: false,
    status: "active" as "active" | "inactive",
  });

  // Load regions and currencies
  /**
   * Retrieve the list of regions and available currencies from the backend
   * and update component state. Used on mount and after data-changing actions.
   */
  const loadData = async () => {
    setLoading(true);
    try {
      const [regionsResp, currenciesResp] = await Promise.all([
        getJson(`${apiBase}/v1/regions?limit=100`),
        getJson(`${apiBase}/v1/regions/currencies?limit=100`),
      ]);

      setRegions(regionsResp.items || []);
      setCurrencies(currenciesResp.items || []);
    } catch (err) {
      console.error("Failed to load data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered regions
  const displayed = useMemo(() => {
    let filtered = regions;

    if (statusFilter) {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }
    const term = globalFilter.trim().toLowerCase();

    if (term) {
      filtered = filtered.filter(
        (r) =>
          r.display_name.toLowerCase().includes(term) ||
          r.currency_code?.toLowerCase().includes(term),
      );
    }

    return filtered;
  }, [regions, statusFilter, globalFilter]);

  /**
   * Prepare and open the modal for creating a new region.
   */
  const handleOpenCreate = () => {
    setIsEditMode(false);
    setEditingRegion(null);
    setFormData({
      display_name: "",
      currency_id: "",
      is_default: false,
      tax_inclusive: false,
      status: "active",
    });
    onOpen();
  };

  /**
   * Populate the modal with an existing region's data and open for editing.
   *
   * @param region - region object to modify
   */
  const handleOpenEdit = (region: Region) => {
    setIsEditMode(true);
    setEditingRegion(region);
    setFormData({
      display_name: region.display_name,
      currency_id: region.currency_id,
      is_default: region.is_default,
      tax_inclusive: region.tax_inclusive,
      status: region.status,
    });
    onOpen();
  };

  /**
   * Send the form data to the backend to create or update a region. Updates
   * local state optimistically with the returned object, or reloads on
   * failure, then closes the modal.
   */
  const handleSave = async () => {
    try {
      if (isEditMode && editingRegion) {
        const response = await patchJson(
          `${apiBase}/v1/regions/${editingRegion.id}`,
          formData,
        );

        // Mettre à jour le state local avec les données retournées
        if (response) {
          setRegions(
            regions.map((r) => (r.id === editingRegion.id ? response : r)),
          );
        } else {
          await loadData();
        }
      } else {
        const response = await postJson(`${apiBase}/v1/regions`, formData);

        // Ajouter la nouvelle région au tableau
        if (response) {
          setRegions([...regions, response]);
        } else {
          await loadData();
        }
      }
      onOpenChange();
    } catch (err) {
      console.error("Failed to save region", err);
    }
  };

  /**
   * Remove a region after user confirmation and reload data.
   *
   * @param id - identifier of the region to delete
   */
  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this region?")) {
      try {
        await deleteJson(`${apiBase}/v1/regions/${id}`);
        await loadData();
      } catch (err) {
        console.error("Failed to delete region", err);
      }
    }
  };

  /**
   * Mark the given region as the default, then refresh the list.
   *
   * @param id - region to promote as default
   */
  const handleSetDefault = async (id: string) => {
    try {
      await postJson(`${apiBase}/v1/regions/${id}/default`, {});
      await loadData();
    } catch (err) {
      console.error("Failed to set default region", err);
    }
  };

  return (
    <DefaultLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">{t("admin-regions-title")}</h1>
          <Button
            color="primary"
            endContent={<Plus className="w-4 h-4" />}
            onPress={handleOpenCreate}
          >
            {t("admin-regions-add")}
          </Button>
        </div>

        <Card className="mb-6">
          <CardBody className="flex gap-4">
            <Input
              isClearable
              className="w-full"
              placeholder={t("admin-common-search")}
              startContent={<SearchIcon className="w-4 h-4" />}
              value={globalFilter}
              onValueChange={setGlobalFilter}
            />
            <Select
              label={t("admin-common-status")}
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
                  {t("admin-common-name")}
                </TableColumn>
                <TableColumn key="currency">
                  {t("admin-common-currency")}
                </TableColumn>
                <TableColumn key="is_default">
                  {t("admin-common-default")}
                </TableColumn>
                <TableColumn key="tax_inclusive">
                  {t("admin-regions-tax-inclusive")}
                </TableColumn>
                <TableColumn key="status">
                  {t("admin-common-status")}
                </TableColumn>
                <TableColumn key="actions">
                  {t("admin-common-actions")}
                </TableColumn>
              </TableHeader>
              <TableBody
                emptyContent={<div>{t("admin-common-empty")}</div>}
                isLoading={loading}
                items={displayed}
                loadingContent={<div>{t("admin-common-loading")}</div>}
              >
                {(region: Region) => (
                  <TableRow key={region.id}>
                    <TableCell>{region.display_name}</TableCell>
                    <TableCell>
                      {region.currency_code || region.currency_id}
                    </TableCell>
                    <TableCell>
                      {region.is_default ? (
                        <span className="text-green-600">✓ Default</span>
                      ) : (
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onPress={() => handleSetDefault(region.id)}
                        >
                          Set Default
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {region.tax_inclusive ? (
                        <span className="text-blue-600">TTC</span>
                      ) : (
                        <span className="text-gray-500">HT</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          region.status === "active"
                            ? "text-green-600"
                            : "text-gray-600"
                        }
                      >
                        {region.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onPress={() => handleOpenEdit(region)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          isIconOnly
                          color="danger"
                          size="sm"
                          variant="light"
                          onPress={() => handleDelete(region.id)}
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

        <Modal isOpen={isOpen} size="lg" onOpenChange={onOpenChange}>
          <ModalContent>
            <ModalHeader className="flex flex-col gap-1">
              {isEditMode ? t("admin-regions-edit") : t("admin-regions-create")}
            </ModalHeader>
            <ModalBody>
              <Tooltip
                content={t(
                  "admin-regions-code-help",
                  "Unique identifier for this region",
                )}
              >
                <Input
                  label={t("admin-common-name")}
                  placeholder="Enter region name"
                  value={formData.display_name}
                  onValueChange={(value) =>
                    setFormData({ ...formData, display_name: value })
                  }
                />
              </Tooltip>
              <Tooltip
                content={t(
                  "admin-regions-currency-help",
                  "Primary currency for products in this region",
                )}
              >
                <Select
                  label={t("admin-common-currency")}
                  selectedKeys={
                    formData.currency_id ? [formData.currency_id] : []
                  }
                  onSelectionChange={(key) =>
                    setFormData({
                      ...formData,
                      currency_id: Array.from(key).join(""),
                    })
                  }
                >
                  {currencies.map((curr) => (
                    <SelectItem key={curr.id} textValue={curr.code}>
                      {curr.code} - {curr.display_name}
                    </SelectItem>
                  ))}
                </Select>
              </Tooltip>
              <Tooltip
                content={t(
                  "admin-regions-default-help",
                  "Mark as default region for unrecognized customers",
                )}
              >
                <Select
                  label={t("admin-common-status")}
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

              <div className="flex flex-col gap-2 mt-2">
                <Checkbox
                  isSelected={formData.tax_inclusive}
                  onValueChange={(value) =>
                    setFormData({ ...formData, tax_inclusive: value })
                  }
                >
                  {t(
                    "admin-regions-tax-inclusive-label",
                    "Prices include taxes (TTC)",
                  )}
                </Checkbox>
                <p className="text-small text-default-500 ml-7">
                  {t(
                    "admin-regions-tax-inclusive-help",
                    "If checked, product prices in this region are considered tax-inclusive.",
                  )}
                </p>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button
                color="default"
                variant="light"
                onPress={() => onOpenChange()}
              >
                {t("admin-common-cancel")}
              </Button>
              <Button
                color="primary"
                isDisabled={!formData.display_name || !formData.currency_id}
                onPress={handleSave}
              >
                {t("admin-common-save")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </DefaultLayout>
  );
}
