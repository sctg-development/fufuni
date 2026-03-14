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
import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/table";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/modal";
import { Card, CardBody } from "@heroui/card";
import { Image as ImageIcon } from "lucide-react";

import DefaultLayout from "@/layouts/default";
import { useSecuredApi } from "@/authentication";
import { SearchIcon } from "@/components/icons";

// --- Data types ----------------------------------------------------------
/**
 * A product variant with SKU, pricing and optional image.
 */
interface Variant {
  id: string;
  sku: string;
  title: string;
  price_cents: number;
  image_url?: string;
}

/**
 * Represents a product with metadata and its variants.
 */
interface Product {
  id: string;
  title: string;
  description: string;
  status: "active" | "draft";
  variants: Variant[];
  created_at: string;
}

/**
 * Options for filtering products by status, including an empty value for all.
 */
const STATUS_OPTIONS = ["", "active", "draft"];

// -------------------------------------------------------------------------
/**
 * Administrative product management page: list, search, filter and
 * create/edit basic product records.
 */
export default function ProductsPage() {
  const { t } = useTranslation();
  const { getJson, postJson, putJson } = useSecuredApi();

  const apiBase = (import.meta as any).env?.API_BASE_URL
    ? (import.meta as any).env.API_BASE_URL
    : "";

  // list state
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [globalFilter, setGlobalFilter] = useState<string>("");

  // create / edit modal
  const [createModal, setCreateModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStatus, setFormStatus] = useState<"active" | "draft">("active");

  // variants modal state
  const [variantModal, setVariantModal] = useState(false);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [variantSku, setVariantSku] = useState("");
  const [variantTitle, setVariantTitle] = useState("");
  const [variantPrice, setVariantPrice] = useState("");
  const [variantImage, setVariantImage] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submittingVariant, setSubmittingVariant] = useState(false);

  // fetch products from backend
  /**
   * Load product list from the API, applying current status filter.
   * Updates local `products` state and toggles loading indicator.
   */
  const loadProducts = async () => {
    setLoading(true);
    try {
      let url = `${apiBase}/v1/products?limit=100`;

      if (statusFilter) url += `&status=${statusFilter}`;
      const resp = await getJson(url);

      setProducts(resp.items || []);
    } catch (err) {
      console.error("Failed to load products", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [statusFilter]);

  // filtered list according to global search
  const displayed = useMemo(() => {
    const term = globalFilter.trim().toLowerCase();

    if (!term) return products;

    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term) ||
        p.variants.some((v) => v.sku.toLowerCase().includes(term)),
    );
  }, [products, globalFilter]);

  /**
   * Prepare and open the modal for creating a new product.
   */
  const openCreate = () => {
    setEditingProduct(null);
    setFormTitle("");
    setFormDescription("");
    setFormStatus("active");
    setCreateModal(true);
  };

  /**
   * Populate modal fields with existing product data and open for editing.
   *
   * @param p - product to edit
   */
  const openEdit = async (p: Product) => {
    setEditingProduct(null);
    setFormTitle(p.title);
    setFormDescription(p.description);
    setFormStatus(p.status);

    // Load full product details for variant management
    try {
      const full = await getJson(`${apiBase}/v1/products/${p.id}`);
      setEditingProduct(full);
    } catch (err) {
      console.error("Error loading product", err);
      setEditingProduct(p);
    }

    setCreateModal(true);
  };

  /**
   * Handle form submission for creating or updating a product. Performs the
   * appropriate API call, closes the modal, and reloads the product list.
   *
   * @param e - form submission event
   */
  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await putJson(`${apiBase}/v1/products/${editingProduct.id}`, {
          title: formTitle,
          description: formDescription,
          status: formStatus,
        });
      } else {
        await postJson(`${apiBase}/v1/products`, {
          title: formTitle,
          description: formDescription || undefined,
        });
      }
      setCreateModal(false);
      loadProducts();
    } catch (err) {
      console.error("Error saving product", err);
    }
  };

  /**
   * Reset variant form fields and close the variant modal.
   */
  const resetVariantForm = () => {
    setEditingVariant(null);
    setVariantSku("");
    setVariantTitle("");
    setVariantPrice("");
    setVariantImage(null);
  };

  /**
   * Open variant creation form with empty fields.
   */
  const openCreateVariant = () => {
    resetVariantForm();
    setVariantModal(true);
  };

  /**
   * Populate variant form with existing data and open for editing.
   *
   * @param v - variant to edit
   */
  const openEditVariant = (v: Variant) => {
    setEditingVariant(v);
    setVariantSku(v.sku);
    setVariantTitle(v.title);
    setVariantPrice(String(v.price_cents));
    setVariantImage(v.image_url || null);
    setVariantModal(true);
  };

  /**
   * Handle image upload: POST file to /v1/images endpoint.
   *
   * @param e - file input change event
   */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${apiBase}/v1/images`, {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
        },
      });

      if (!response.ok) throw new Error("Upload failed");
      const result = await response.json();
      setVariantImage(result.url || result.key);
    } catch (err) {
      console.error("Image upload error", err);
      alert(t("admin-products-image-upload-error"));
    } finally {
      setUploadingImage(false);
    }
  };

  /**
   * Submit variant form: create or update variant.
   *
   * @param e - form submission event
   */
  const submitVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    setSubmittingVariant(true);
    try {
      const price = parseInt(variantPrice, 10);
      if (isNaN(price)) {
        alert("Invalid price");
        setSubmittingVariant(false);
        return;
      }

      if (editingVariant) {
        // Update variant
        await putJson(
          `${apiBase}/v1/products/${editingProduct.id}/variants/${editingVariant.id}`,
          {
            sku: variantSku,
            title: variantTitle,
            price_cents: price,
            image_url: variantImage || undefined,
          }
        );
      } else {
        // Create variant
        await postJson(`${apiBase}/v1/products/${editingProduct.id}/variants`, {
          sku: variantSku,
          title: variantTitle,
          price_cents: price,
          image_url: variantImage || undefined,
        });
      }

      setVariantModal(false);
      resetVariantForm();

      // Reload product to show new/updated variant
      const updated = await getJson(`${apiBase}/v1/products/${editingProduct.id}`);
      setEditingProduct(updated);
      setProducts((prev) =>
        prev.map((p) => (p.id === editingProduct.id ? updated : p))
      );
    } catch (err) {
      console.error("Error saving variant", err);
      alert(t("admin-products-variant-save-error"));
    } finally {
      setSubmittingVariant(false);
    }
  };

  return (
    <DefaultLayout>
      <div className="px-4 py-6">
        {/* header bar */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">{t("admin-products-title")}</h1>
          <div className="flex items-center gap-2">
            <Input
              placeholder={t("search") + "..."}
              size="sm"
              startContent={<SearchIcon className="text-default-400" />}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
            />
            <select
              className="w-32 border rounded px-2 py-1 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt ? opt : t("all")}
                </option>
              ))}
            </select>
            <Button
              className="min-w-40 whitespace-nowrap"
              color="primary"
              size="md"
              onPress={openCreate}
            >
              {t("admin-products-btn-add")}
            </Button>
          </div>
        </div>

        {/* product list */}
        {loading ? (
          <p className="text-default-500">{t("admin-products-loading")}</p>
        ) : (
          <Table aria-label="Products" selectionMode="none">
            <TableHeader>
              <TableColumn>{t("admin-products-col-title")}</TableColumn>
              <TableColumn>{t("admin-products-col-description")}</TableColumn>
              <TableColumn>{t("admin-products-col-variants")}</TableColumn>
              <TableColumn>{t("admin-products-col-status")}</TableColumn>
              <TableColumn>{t("actions")}</TableColumn>
            </TableHeader>
            <TableBody emptyContent={t("admin-products-empty")}>
              {displayed.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.title}</TableCell>
                  <TableCell>{p.description || "-"}</TableCell>
                  <TableCell>{p.variants.length}</TableCell>
                  <TableCell>{p.status}</TableCell>
                  <TableCell>
                    <Button size="sm" onPress={() => openEdit(p)}>
                      {t("admin-products-btn-edit")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* create/edit modal */}
      <Modal isOpen={createModal} onClose={() => {
        setCreateModal(false);
        setEditingProduct(null);
      }} size={editingProduct ? "lg" : "md"}>
        <ModalContent>
          <ModalHeader>
            {editingProduct ? editingProduct.title : t("admin-products-modal-title")}
          </ModalHeader>
          <ModalBody className="space-y-4">
            <form className="space-y-4" onSubmit={submitForm} id="product-form">
              <div>
                <label className="block text-sm font-medium">
                  {t("admin-products-modal-field-title")}
                </label>
                <Input
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">
                  {t("admin-products-modal-field-description")}
                </label>
                <textarea
                  className="w-full px-3 py-2 border rounded"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium">
                  {t("status")}
                </label>
                <select
                  className="border rounded px-2 py-1 w-full"
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as any)}
                >
                  <option value="active">active</option>
                  <option value="draft">draft</option>
                </select>
              </div>
            </form>

            {/* Variants section */}
            {editingProduct && (
              <Card>
                <CardBody className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      {t("admin-products-variants")} ({editingProduct.variants.length})
                    </h3>
                    <Button
                      size="sm"
                      color="primary"
                      onPress={openCreateVariant}
                    >
                      {t("admin-products-btn-add-variant")}
                    </Button>
                  </div>

                  {editingProduct.variants.length === 0 ? (
                    <p className="text-sm text-default-500">
                      {t("admin-products-no-variants")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {editingProduct.variants.map((v) => (
                        <VariantCard
                          key={v.id}
                          variant={v}
                          onEdit={() => openEditVariant(v)}
                        />
                      ))}
                    </div>
                  )}
                </CardBody>
              </Card>
            )}
          </ModalBody>
          <ModalFooter>
            <Button onPress={() => {
              setCreateModal(false);
              setEditingProduct(null);
            }}>
              {t("admin-products-btn-cancel")}
            </Button>
            <Button color="primary" type="submit" form="product-form">
              {editingProduct ? t("save") : t("admin-products-btn-create")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Variant modal */}
      <Modal isOpen={variantModal} onClose={() => {
        setVariantModal(false);
        resetVariantForm();
      }} size="md">
        <ModalContent>
          <ModalHeader>
            {editingVariant ? t("admin-products-edit-variant") : t("admin-products-add-variant")}
          </ModalHeader>
          <ModalBody>
            <form className="space-y-4" onSubmit={submitVariant} id="variant-form">
              <div>
                <label className="block text-sm font-medium">
                  {t("admin-products-field-sku")}
                </label>
                <Input
                  required
                  value={variantSku}
                  onChange={(e) => setVariantSku(e.target.value)}
                  placeholder="e.g. TEE-BLK-M"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">
                  {t("admin-products-field-variant-title")}
                </label>
                <Input
                  required
                  value={variantTitle}
                  onChange={(e) => setVariantTitle(e.target.value)}
                  placeholder="e.g. Black / Medium"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">
                  {t("admin-products-field-price")}
                </label>
                <Input
                  required
                  type="number"
                  value={variantPrice}
                  onChange={(e) => setVariantPrice(e.target.value)}
                  placeholder="Price in cents (e.g. 2999 for $29.99)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">
                  {t("admin-products-field-image")}
                </label>
                <div className="flex gap-2">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    disabled={uploadingImage}
                  />
                </div>
                {variantImage && (
                  <div className="mt-2">
                    <img
                      src={variantImage}
                      alt="Preview"
                      className="w-20 h-20 object-cover rounded border"
                    />
                  </div>
                )}
              </div>
            </form>
          </ModalBody>
          <ModalFooter>
            <Button onPress={() => {
              setVariantModal(false);
              resetVariantForm();
            }}>
              {t("admin-products-btn-cancel")}
            </Button>
            <Button
              color="primary"
              type="submit"
              form="variant-form"
              isLoading={submittingVariant}
              disabled={uploadingImage}
            >
              {editingVariant ? t("save") : t("admin-products-btn-add-variant")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </DefaultLayout>
  );
}

/**
 * Display a single variant with image thumbnail and pricing.
 * Clickable to edit the variant.
 */
function VariantCard({
  variant,
  onEdit,
}: {
  variant: Variant;
  onEdit: () => void;
}) {
  return (
    <div
      onClick={onEdit}
      className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-default-100 transition-colors"
    >
      {variant.image_url ? (
        <img
          src={variant.image_url}
          alt={variant.title}
          className="w-12 h-12 object-cover rounded border"
        />
      ) : (
        <div className="w-12 h-12 flex items-center justify-center rounded border bg-default-100">
          <ImageIcon size={20} className="text-default-400" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm">{variant.title}</p>
        <p className="text-xs text-default-500">{variant.sku}</p>
      </div>
      <p className="font-mono text-sm font-semibold">
        ${(variant.price_cents / 100).toFixed(2)}
      </p>
    </div>
  );
}
