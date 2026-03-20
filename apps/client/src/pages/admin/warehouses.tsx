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
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Modal state
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
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
    setLoading(true);
    try {
      const [warehousesResp, countriesResp] = await Promise.all([
        getJson(`${apiBase}/v1/regions/warehouses?limit=100`),
        getJson(`${apiBase}/v1/regions/countries?limit=100`),
      ]);

      setWarehouses(warehousesResp.items || []);
      setCountries(countriesResp.items || []);
    } catch (err) {
      console.error("Failed to load data", err);
    } finally {
      setLoading(false);
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
    onOpen();
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
    onOpen();
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
      onOpenChange();
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
            color="primary"
            endContent={<Plus className="w-4 h-4" />}
            onPress={handleOpenCreate}
          >
            {t("admin-warehouses-add")}
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
                <TableColumn key="city">
                  {t("admin-warehouses-city")}
                </TableColumn>
                <TableColumn key="country">
                  {t("admin-common-country")}
                </TableColumn>
                <TableColumn key="priority">
                  {t("admin-warehouses-priority")}
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
                {(warehouse) => (
                  <TableRow key={warehouse.id}>
                    <TableCell>{warehouse.display_name}</TableCell>
                    <TableCell>
                      {warehouse.city}
                      {warehouse.state ? `, ${warehouse.state}` : ""}
                    </TableCell>
                    <TableCell>{warehouse.country_code}</TableCell>
                    <TableCell>
                      <span className="bg-gray-200 px-2 py-1 rounded">
                        {warehouse.priority}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          warehouse.status === "active"
                            ? "text-green-600"
                            : "text-gray-600"
                        }
                      >
                        {warehouse.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onPress={() => handleOpenEdit(warehouse)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          isIconOnly
                          color="danger"
                          size="sm"
                          variant="light"
                          onPress={() => handleDelete(warehouse.id)}
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

        <Modal isOpen={isOpen} size="xl" onOpenChange={onOpenChange}>
          <ModalContent>
            <ModalHeader className="flex flex-col gap-1">
              {isEditMode
                ? t("admin-warehouses-edit")
                : t("admin-warehouses-create")}
            </ModalHeader>
            <ModalBody>
              <Tooltip
                content={t(
                  "admin-warehouses-name-help",
                  "Display name for this warehouse location",
                )}
              >
                <Input
                  label={t("admin-common-name")}
                  placeholder="Main Warehouse"
                  value={formData.display_name}
                  onValueChange={(value) =>
                    setFormData({ ...formData, display_name: value })
                  }
                />
              </Tooltip>
              <Tooltip
                content={t(
                  "admin-warehouses-address1-help",
                  "Street address where the warehouse is located",
                )}
              >
                <Input
                  label={t("admin-warehouses-address1")}
                  placeholder="123 Main Street"
                  value={formData.address_line1}
                  onValueChange={(value) =>
                    setFormData({ ...formData, address_line1: value })
                  }
                />
              </Tooltip>
              <Tooltip
                content={t(
                  "admin-warehouses-address2-help",
                  "Additional address details",
                )}
              >
                <Input
                  label={t("admin-warehouses-address2")}
                  placeholder="Suite 100"
                  value={formData.address_line2}
                  onValueChange={(value) =>
                    setFormData({ ...formData, address_line2: value })
                  }
                />
              </Tooltip>
              <Tooltip
                content={t(
                  "admin-warehouses-city-help",
                  "City or municipality where warehouse is located",
                )}
              >
                <Input
                  label={t("admin-warehouses-city")}
                  placeholder="New York"
                  value={formData.city}
                  onValueChange={(value) =>
                    setFormData({ ...formData, city: value })
                  }
                />
              </Tooltip>
              <Tooltip
                content={t(
                  "admin-warehouses-state-help",
                  "State, province, or region code",
                )}
              >
                <Input
                  label={t("admin-warehouses-state")}
                  placeholder="NY"
                  value={formData.state}
                  onValueChange={(value) =>
                    setFormData({ ...formData, state: value })
                  }
                />
              </Tooltip>
              <Tooltip
                content={t(
                  "admin-warehouses-postal-help",
                  "ZIP code or postal code",
                )}
              >
                <Input
                  label={t("admin-warehouses-postal")}
                  placeholder="10001"
                  value={formData.postal_code}
                  onValueChange={(value) =>
                    setFormData({ ...formData, postal_code: value })
                  }
                />
              </Tooltip>
              <Tooltip
                content={t(
                  "admin-warehouses-country-help",
                  "Country where warehouse is located",
                )}
              >
                <Select
                  label={t("admin-common-country")}
                  selectedKeys={
                    formData.country_code ? [formData.country_code] : []
                  }
                  onSelectionChange={(key) =>
                    setFormData({
                      ...formData,
                      country_code: Array.from(key).join(""),
                    })
                  }
                >
                  {countries.map((country) => (
                    <SelectItem key={country.code} textValue={country.code}>
                      {country.code} - {country.display_name}
                    </SelectItem>
                  ))}
                </Select>
              </Tooltip>
              <Tooltip
                content={t(
                  "admin-warehouses-priority-help",
                  "Lower number = higher priority for order fulfillment",
                )}
              >
                <Input
                  label={t("admin-warehouses-priority")}
                  min={0}
                  placeholder="1"
                  type="number"
                  value={formData.priority.toString()}
                  onValueChange={(value) =>
                    setFormData({ ...formData, priority: parseInt(value) || 0 })
                  }
                />
              </Tooltip>
              <Tooltip content={t("admin-common-status")}>
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
                isDisabled={!formData.display_name || !formData.country_code}
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
