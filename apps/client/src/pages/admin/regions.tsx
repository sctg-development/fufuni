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
import { Checkbox } from "@heroui/react";
import {
  Modal,
} from "@heroui/react";
import { Card} from "@heroui/react";
import { Tooltip } from "@heroui/react";
import { Plus, Edit2, Trash2 } from "lucide-react";


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
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
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
    try {
      const [regionsResp, currenciesResp] = await Promise.all([
        getJson(`${apiBase}/v1/regions?limit=100`),
        getJson(`${apiBase}/v1/regions/currencies?limit=100`),
      ]);

      setRegions(regionsResp.items || []);
      setCurrencies(currenciesResp.items || []);
    } catch (err) {
      console.error("Failed to load data", err);
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
    setIsModalOpen(true);
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
    setIsModalOpen(true);
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
      setIsModalOpen(false);
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
            variant="primary"
            onPress={handleOpenCreate}
          >
            <Plus className="w-4 h-4" />
            {t("admin-regions-add")}
          </Button>
        </div>

        <Card className="mb-6">
          <Card.Content className="flex gap-4">
            <TextField className="w-full">
              <Label>{t("admin-regions-filter-placeholder")}</Label>
              <Input
                placeholder={t("admin-regions-filter-placeholder")}
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
              />
            </TextField>
            <Select
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
              <Table.Content>
                <Table.Header>
                  <Table.Column key="display_name" isRowHeader>
                    {t("admin-common-name")}
                  </Table.Column>
                  <Table.Column key="currency">
                    {t("admin-common-currency")}
                  </Table.Column>
                  <Table.Column key="is_default">
                    {t("admin-common-default")}
                  </Table.Column>
                  <Table.Column key="tax_inclusive">
                    {t("admin-regions-tax-inclusive")}
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
                >
                {displayed.map((region: Region) => (
                  <Table.Row key={region.id} className="odd:bg-default-50">
                    <Table.Cell>{region.display_name}</Table.Cell>
                    <Table.Cell>
                      {region.currency_code || region.currency_id}
                    </Table.Cell>
                    <Table.Cell>
                      {region.is_default ? (
                        <span className="text-green-600">✓ Default</span>
                      ) : (
                        <Button
                          isIconOnly
                          size="sm"
                          variant="tertiary"
                          onPress={() => handleSetDefault(region.id)}
                        >
                          Set Default
                        </Button>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {region.tax_inclusive ? (
                        <span className="text-blue-600">TTC</span>
                      ) : (
                        <span className="text-gray-500">HT</span>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <span
                        className={
                          region.status === "active"
                            ? "text-green-600"
                            : "text-gray-600"
                        }
                      >
                        {region.status}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex gap-2">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="tertiary"
                          onPress={() => handleOpenEdit(region)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="tertiary"
                          onPress={() => handleDelete(region.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
                </Table.Body>
              </Table.Content>
            </Table>
          </Card.Content>
        </Card>

        <Modal isOpen={isModalOpen} onOpenChange={setIsModalOpen}>
          <Modal.Backdrop />
          <Modal.Container size="lg">
            <Modal.Dialog>
              {({ close }) => (
                <>
                  <Modal.CloseTrigger onPress={close} />
                  <Modal.Header>
                    {isEditMode ? t("admin-regions-edit") : t("admin-regions-create")}
                  </Modal.Header>
                  <Modal.Body>
              <Tooltip>
                <Tooltip.Trigger>
                  <TextField>
                    <Label>{t("admin-common-name")}</Label>
                    <Input
                      placeholder="Enter region name"
                      value={formData.display_name}
                      onChange={(e) =>
                        setFormData({ ...formData, display_name: e.target.value })
                      }
                    />
                  </TextField>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-regions-code-help",
                    "Unique identifier for this region",
                  )}
                </Tooltip.Content>
              </Tooltip>
              <Tooltip>
                <Tooltip.Trigger>
                  <Select
                    value={formData.currency_id || ""}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        currency_id: (value as string) || "",
                      })
                    }
                  >
                    <Label>{t("admin-common-currency")}</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {currencies.map((curr) => (
                          <ListBox.Item key={curr.id} id={curr.id} textValue={curr.code}>
                            {curr.code} - {curr.display_name}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-regions-currency-help",
                    "Primary currency for products in this region",
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
                  {t(
                    "admin-regions-default-help",
                    "Mark as default region for unrecognized customers",
                  )}
                </Tooltip.Content>
              </Tooltip>

              <div className="flex flex-col gap-2 mt-2">
                <Checkbox
                  id="region-tax-inclusive"
                  isSelected={formData.tax_inclusive}
                  onChange={(value) =>
                    setFormData({ ...formData, tax_inclusive: value })
                  }
                >
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Content>
                    <Label htmlFor="region-tax-inclusive">
                      {t(
                        "admin-regions-tax-inclusive-label",
                        "Prices include taxes (TTC)",
                      )}
                    </Label>
                  </Checkbox.Content>
                </Checkbox>
                <p className="text-small text-default-500 ml-7">
                  {t(
                    "admin-regions-tax-inclusive-help",
                    "If checked, product prices in this region are considered tax-inclusive.",
                  )}
                </p>
              </div>
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
                      isDisabled={!formData.display_name || !formData.currency_id}
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
      </div>
    </DefaultLayout>
  );
}
