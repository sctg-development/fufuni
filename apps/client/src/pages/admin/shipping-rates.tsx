/**
 * MIT License
 *
 * Copyright (c) 2026 Ronan LE MEILLAT - SCTG Development
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
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
}

/**
 * Available status choices for shipping rates.
 */
const STATUS_OPTIONS = ["active", "inactive"];

export default function ShippingRatesPage() {
  const { t } = useTranslation();
  const { getJson, postJson, deleteJson, patchJson } = useSecuredApi();

  const apiBase = (import.meta as any).env?.API_BASE_URL
    ? (import.meta as any).env.API_BASE_URL
    : "";

  // List state
  const [shippingRates, setShippingRates] = useState<ShippingRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Modal state
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingRate, setEditingRate] = useState<ShippingRate | null>(null);
  const [formData, setFormData] = useState({
    display_name: "",
    description: "",
    max_weight_g: "",
    min_delivery_days: "",
    max_delivery_days: "",
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
      const response = await getJson(
        `${apiBase}/v1/regions/shipping-rates?limit=100`,
      );

      setShippingRates(response.items || []);
    } catch (err) {
      console.error("Failed to load shipping rates", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
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
    setFormData({
      display_name: "",
      description: "",
      max_weight_g: "",
      min_delivery_days: "",
      max_delivery_days: "",
      status: "active",
    });
    onOpen();
  };

  /**
   * Populate the form with an existing rate and open modal for editing.
   *
   * @param rate - shipping rate to modify
   */
  const handleOpenEdit = (rate: ShippingRate) => {
    setIsEditMode(true);
    setEditingRate(rate);
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
      };

      if (isEditMode && editingRate) {
        const response = await patchJson(
          `${apiBase}/v1/regions/shipping-rates/${editingRate.id}`,
          saveData,
        );

        // Mettre à jour le state local
        if (response) {
          setShippingRates(
            shippingRates.map((r) => (r.id === editingRate.id ? response : r)),
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
          setShippingRates([...shippingRates, response]);
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
      </div>
    </DefaultLayout>
  );
}
