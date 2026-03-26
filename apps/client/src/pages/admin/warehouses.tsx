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
import { Select, ListBox } from "@heroui/react";
import { Table } from "@heroui/react";
import {
  Modal,
  useOverlayState,
} from "@heroui/react";
import { Card } from "@heroui/react";
import { Tooltip } from "@heroui/react";
import { Plus, Edit2, Trash2 } from "lucide-react";


import DefaultLayout from "@/layouts/default";
import { useSecuredApi } from "@/authentication";

/**
 * Represents a warehouse location within a region, including its address and
 * priority order.
 */
interface Warehouse {
  id: string;
  display_name: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country_code: string;
  priority: number;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
}

/**
 * Country record used for the country picker in the warehouse form.
 */
interface Country {
  id: string;
  code: string;
  display_name: string;
}

/**
 * Status choices available for warehouses.
 */
const STATUS_OPTIONS = ["active", "inactive"];

export default function WarehousesPage() {
  const { t } = useTranslation();
  const { getJson, postJson, deleteJson, patchJson } = useSecuredApi();

  const apiBase = (import.meta as any).env?.API_BASE_URL
    ? (import.meta as any).env.API_BASE_URL
    : "";

  // List state
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Modal state
  const modalState = useOverlayState();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(
    null,
  );
  const [formData, setFormData] = useState({
    display_name: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postal_code: "",
    country_code: "",
    priority: 1,
    status: "active" as "active" | "inactive",
  });

  // Load warehouses and countries
  /**
   * Fetch the list of warehouses and available countries from the backend.
   * Updates state and shows a loading spinner during the fetch.
   */
  const loadData = async () => {
    try {
      const [warehousesResp, countriesResp] = await Promise.all([
        getJson(`${apiBase}/v1/regions/warehouses?limit=100`),
        getJson(`${apiBase}/v1/regions/countries?limit=100`),
      ]);

      setWarehouses(warehousesResp.items || []);
      setCountries(countriesResp.items || []);
    } catch (err) {
      console.error("Failed to load data", err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered warehouses
  /**
   * Compute warehouses matching the active filters and search term. Results are
   * sorted by priority.
   */
  const displayed = useMemo(() => {
    let filtered = warehouses;

    if (statusFilter) {
      filtered = filtered.filter((w) => w.status === statusFilter);
    }
    const term = globalFilter.trim().toLowerCase();

    if (term) {
      filtered = filtered.filter(
        (w) =>
          w.display_name.toLowerCase().includes(term) ||
          w.city.toLowerCase().includes(term) ||
          w.country_code.toLowerCase().includes(term),
      );
    }

    return filtered.sort((a, b) => a.priority - b.priority);
  }, [warehouses, statusFilter, globalFilter]);

  /**
   * Reset the form and open modal to create a new warehouse.
   */
  const handleOpenCreate = () => {
    setIsEditMode(false);
    setEditingWarehouse(null);
    setFormData({
      display_name: "",
      address_line1: "",
      address_line2: "",
      city: "",
      state: "",
      postal_code: "",
      country_code: "",
      priority: 1,
      status: "active",
    });
    modalState.open();
  };

  /**
   * Populate modal with data from an existing warehouse for editing.
   *
   * @param warehouse - the warehouse to edit
   */
  const handleOpenEdit = (warehouse: Warehouse) => {
    setIsEditMode(true);
    setEditingWarehouse(warehouse);
    setFormData({
      display_name: warehouse.display_name,
      address_line1: warehouse.address_line1,
      address_line2: warehouse.address_line2 || "",
      city: warehouse.city,
      state: warehouse.state || "",
      postal_code: warehouse.postal_code,
      country_code: warehouse.country_code,
      priority: warehouse.priority,
      status: warehouse.status,
    });
    modalState.open();
  };

  /**
   * Persist the current form data as a new or updated warehouse record.
   * Updates local state optimistically using the API response, or reloads
   * data on failure. Closes the modal afterwards.
   */
  const handleSave = async () => {
    try {
      if (isEditMode && editingWarehouse) {
        const updateData = {
          display_name: formData.display_name,
          address_line1: formData.address_line1,
          address_line2: formData.address_line2 || null,
          city: formData.city,
          state: formData.state || null,
          postal_code: formData.postal_code,
          country_code: formData.country_code,
          priority: formData.priority,
          status: formData.status,
        };
        const response = await patchJson(
          `${apiBase}/v1/regions/warehouses/${editingWarehouse.id}`,
          updateData,
        );

        // Mettre à jour le state local
        if (response) {
          setWarehouses(
            warehouses.map((w) =>
              w.id === editingWarehouse.id ? response : w,
            ),
          );
        } else {
          await loadData();
        }
      } else {
        const response = await postJson(
          `${apiBase}/v1/regions/warehouses`,
          formData,
        );

        // Ajouter le nouveau warehouse
        if (response) {
          setWarehouses([...warehouses, response]);
        } else {
          await loadData();
        }
      }
      modalState.close();
    } catch (err) {
      console.error("Failed to save warehouse", err);
    }
  };

  /**
   * Confirm and delete a warehouse, then reload the data list.
   *
   * @param id - warehouse identifier to remove
   */
  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this warehouse?")) {
      try {
        await deleteJson(`${apiBase}/v1/regions/warehouses/${id}`);
        await loadData();
      } catch (err) {
        console.error("Failed to delete warehouse", err);
      }
    }
  };

  return (
    <DefaultLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">{t("admin-warehouses-title")}</h1>
          <Button
            variant="primary"
            onPress={handleOpenCreate}
          >
            <Plus className="w-4 h-4" />
            {t("admin-warehouses-add")}
          </Button>
        </div>

        <Card className="mb-6">
          <Card.Content className="flex gap-4">
            <TextField className="w-full">
              <Input
                placeholder={t("admin-warehouses-filter-placeholder")}
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
              <Table.Header>
                <Table.Column key="display_name">
                  {t("admin-common-name")}
                </Table.Column>
                <Table.Column key="city">
                  {t("admin-warehouses-city")}
                </Table.Column>
                <Table.Column key="country">
                  {t("admin-common-country")}
                </Table.Column>
                <Table.Column key="priority">
                  {t("admin-warehouses-priority")}
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
                {(warehouse) => (
                  <Table.Row key={warehouse.id} className="odd:bg-default-50">
                    <Table.Cell>{warehouse.display_name}</Table.Cell>
                    <Table.Cell>
                      {warehouse.city}
                      {warehouse.state ? `, ${warehouse.state}` : ""}
                    </Table.Cell>
                    <Table.Cell>{warehouse.country_code}</Table.Cell>
                    <Table.Cell>
                      <span className="bg-gray-200 px-2 py-1 rounded">
                        {warehouse.priority}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <span
                        className={
                          warehouse.status === "active"
                            ? "text-green-600"
                            : "text-gray-600"
                        }
                      >
                        {warehouse.status}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex gap-2">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="tertiary"
                          onPress={() => handleOpenEdit(warehouse)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="tertiary"
                          onPress={() => handleDelete(warehouse.id)}
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
                  <Modal.Header className="flex flex-col gap-1">
                    <Modal.Heading>
                      {isEditMode
                        ? t("admin-warehouses-edit")
                        : t("admin-warehouses-create")}
                    </Modal.Heading>
                  </Modal.Header>
                  <Modal.Body>
              <Tooltip>
                <Tooltip.Trigger>
                  <TextField>
                    <Label>{t("admin-common-name")}</Label>
                    <Input
                      placeholder="Main Warehouse"
                      value={formData.display_name}
                      onChange={(e) =>
                        setFormData({ ...formData, display_name: e.target.value })
                      }
                    />
                  </TextField>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-warehouses-name-help",
                    "Display name for this warehouse location",
                  )}
                </Tooltip.Content>
              </Tooltip>
              <Tooltip>
                <Tooltip.Trigger>
                  <TextField>
                    <Label>{t("admin-warehouses-address1")}</Label>
                    <Input
                      placeholder="123 Main Street"
                      value={formData.address_line1}
                      onChange={(e) =>
                        setFormData({ ...formData, address_line1: e.target.value })
                      }
                    />
                  </TextField>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-warehouses-address1-help",
                    "Street address where the warehouse is located",
                  )}
                </Tooltip.Content>
              </Tooltip>
              <Tooltip>
                <Tooltip.Trigger>
                  <TextField>
                    <Label>{t("admin-warehouses-address2")}</Label>
                    <Input
                      placeholder="Suite 100"
                      value={formData.address_line2}
                      onChange={(e) =>
                        setFormData({ ...formData, address_line2: e.target.value })
                      }
                    />
                  </TextField>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-warehouses-address2-help",
                    "Additional address details",
                  )}
                </Tooltip.Content>
              </Tooltip>
              <Tooltip>
                <Tooltip.Trigger>
                  <TextField>
                    <Label>{t("admin-warehouses-city")}</Label>
                    <Input
                      placeholder="New York"
                      value={formData.city}
                      onChange={(e) =>
                        setFormData({ ...formData, city: e.target.value })
                      }
                    />
                  </TextField>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-warehouses-city-help",
                    "City or municipality where warehouse is located",
                  )}
                </Tooltip.Content>
              </Tooltip>
              <Tooltip>
                <Tooltip.Trigger>
                  <TextField>
                    <Label>{t("admin-warehouses-state")}</Label>
                    <Input
                      placeholder="NY"
                      value={formData.state}
                      onChange={(e) =>
                        setFormData({ ...formData, state: e.target.value })
                      }
                    />
                  </TextField>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-warehouses-state-help",
                    "State, province, or region code",
                  )}
                </Tooltip.Content>
              </Tooltip>
              <Tooltip>
                <Tooltip.Trigger>
                  <TextField>
                    <Label>{t("admin-warehouses-postal")}</Label>
                    <Input
                      placeholder="10001"
                      value={formData.postal_code}
                      onChange={(e) =>
                        setFormData({ ...formData, postal_code: e.target.value })
                      }
                    />
                  </TextField>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-warehouses-postal-help",
                    "ZIP code or postal code",
                  )}
                </Tooltip.Content>
              </Tooltip>
              <Tooltip>
                <Tooltip.Trigger>
                  <Select
                    value={formData.country_code || ""}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        country_code: (value as string) || "",
                      })
                    }
                  >
                    <Label>{t("admin-common-country")}</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {countries.map((country) => (
                          <ListBox.Item key={country.code} id={country.code} textValue={country.code}>
                            {country.code} - {country.display_name}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-warehouses-country-help",
                    "Country where warehouse is located",
                  )}
                </Tooltip.Content>
              </Tooltip>
              <Tooltip>
                <Tooltip.Trigger>
                  <TextField>
                    <Label>{t("admin-warehouses-priority")}</Label>
                    <Input
                      min={0}
                      placeholder="1"
                      type="number"
                      value={formData.priority.toString()}
                      onChange={(e) =>
                        setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })
                      }
                    />
                  </TextField>
                </Tooltip.Trigger>
                <Tooltip.Content>
                  {t(
                    "admin-warehouses-priority-help",
                    "Lower number = higher priority for order fulfillment",
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
                  </Modal.Body>
                  <Modal.Footer>
                    <Button
                      variant="tertiary"
                      onPress={close}
                    >
                      {t("admin-common-cancel")}
                    </Button>
                    <Button
                      isDisabled={!formData.display_name || !formData.country_code}
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
