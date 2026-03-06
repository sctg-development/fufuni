import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSecuredApi } from "@/authentication";
import DefaultLayout from "@/layouts/default";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/table";
import { Modal, ModalContent, ModalHeader, ModalBody } from "@heroui/modal";
import { SearchIcon } from "@/components/icons";

// --- Data types ----------------------------------------------------------
interface Variant {
  id: string;
  sku: string;
  title: string;
  price_cents: number;
  image_url?: string;
}

interface Product {
  id: string;
  title: string;
  description: string;
  status: "active" | "draft";
  variants: Variant[];
  created_at: string;
}

const STATUS_OPTIONS = ["", "active", "draft"];

// -------------------------------------------------------------------------
export default function ProductsPage() {
  const { t } = useTranslation();
  const { getJson, postJson, putJson } = useSecuredApi();

  const apiBase =
    (import.meta as any).env?.API_BASE_URL ? (import.meta as any).env.API_BASE_URL : "";

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

  // fetch products from backend
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

  const openCreate = () => {
    setEditingProduct(null);
    setFormTitle("");
    setFormDescription("");
    setFormStatus("active");
    setCreateModal(true);
  };

  const openEdit = (p: Product) => {
    setEditingProduct(p);
    setFormTitle(p.title);
    setFormDescription(p.description);
    setFormStatus(p.status);
    setCreateModal(true);
  };

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

  return (
    <DefaultLayout>
      <div className="px-4 py-6">
        {/* header bar */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">{t("admin-products-title")}</h1>
          <div className="flex items-center gap-2">
            <Input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={t("search") + "..."}
              startContent={<SearchIcon className="text-default-400" />}
              size="sm"
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
              color="primary"
              size="md"
              onPress={openCreate}
              className="min-w-40 whitespace-nowrap"
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
      <Modal isOpen={createModal} onClose={() => setCreateModal(false)}>
        <ModalContent>
          <ModalHeader>{editingProduct ? t("edit") : t("admin-products-modal-title")}</ModalHeader>
          <ModalBody>
            <form onSubmit={submitForm} className="space-y-4">
              <div>
                <label className="block text-sm font-medium">{t("admin-products-modal-field-title")}</label>
                <Input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium">{t("admin-products-modal-field-description")}</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium">{t("status")}</label>
                <select
                  className="border rounded px-2 py-1 w-full"
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as any)}
                >
                  <option value="active">active</option>
                  <option value="draft">draft</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <Button onPress={() => setCreateModal(false)}>{t("admin-products-btn-cancel")}</Button>
                <Button type="submit" color="primary">{editingProduct ? t("save") : t("admin-products-btn-create")}</Button>
              </div>
            </form>
          </ModalBody>
        </ModalContent>
      </Modal>
    </DefaultLayout>
  );
}
