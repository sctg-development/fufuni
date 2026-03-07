import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSecuredApi } from "@/authentication";
import DefaultLayout from "@/layouts/default";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Select, SelectItem } from "@heroui/select";
import { Table, TableHeader, TableColumn, TableBody, TableRow, TableCell } from "@heroui/table";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from "@heroui/modal";
import { Card, CardBody } from "@heroui/card";
import { Tooltip } from "@heroui/tooltip";
import { SearchIcon } from "@/components/icons";
import { Plus, Edit2, Trash2 } from "lucide-react";

interface ShippingRate {
  id: string;
  display_name: string;
  description?: string;
  max_weight_g?: number;
  min_delivery_days?: number;
  max_delivery_days?: number;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS = ["active", "inactive"];

export default function ShippingRatesPage() {
  const { t } = useTranslation();
  const { getJson, postJson, deleteJson, patchJson } = useSecuredApi();
  
  const apiBase = (import.meta as any).env?.API_BASE_URL ? (import.meta as any).env.API_BASE_URL : "";

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
    display_name: '',
    description: '',
    max_weight_g: '',
    min_delivery_days: '',
    max_delivery_days: '',
    status: 'active' as 'active' | 'inactive',
  });

  // Load shipping rates
  const loadData = async () => {
    setLoading(true);
    try {
      const response = await getJson(`${apiBase}/v1/regions/shipping-rates?limit=100`);
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
  const displayed = useMemo(() => {
    let filtered = shippingRates;
    if (statusFilter) {
      filtered = filtered.filter(r => r.status === statusFilter);
    }
    const term = globalFilter.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter(r =>
        r.display_name.toLowerCase().includes(term) ||
        r.description?.toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [shippingRates, statusFilter, globalFilter]);

  const handleOpenCreate = () => {
    setIsEditMode(false);
    setEditingRate(null);
    setFormData({
      display_name: '',
      description: '',
      max_weight_g: '',
      min_delivery_days: '',
      max_delivery_days: '',
      status: 'active',
    });
    onOpen();
  };

  const handleOpenEdit = (rate: ShippingRate) => {
    setIsEditMode(true);
    setEditingRate(rate);
    setFormData({
      display_name: rate.display_name,
      description: rate.description || '',
      max_weight_g: rate.max_weight_g ? rate.max_weight_g.toString() : '',
      min_delivery_days: rate.min_delivery_days ? rate.min_delivery_days.toString() : '',
      max_delivery_days: rate.max_delivery_days ? rate.max_delivery_days.toString() : '',
      status: rate.status,
    });
    onOpen();
  };

  const handleSave = async () => {
    try {
      const saveData = {
        display_name: formData.display_name,
        description: formData.description || null,
        max_weight_g: formData.max_weight_g ? parseInt(formData.max_weight_g) : null,
        min_delivery_days: formData.min_delivery_days ? parseInt(formData.min_delivery_days) : null,
        max_delivery_days: formData.max_delivery_days ? parseInt(formData.max_delivery_days) : null,
        status: formData.status,
      };

      if (isEditMode && editingRate) {
        const response = await patchJson(`${apiBase}/v1/regions/shipping-rates/${editingRate.id}`, saveData);
        // Mettre à jour le state local
        if (response) {
          setShippingRates(shippingRates.map(r => r.id === editingRate.id ? response : r));
        } else {
          await loadData();
        }
      } else {
        const response = await postJson(`${apiBase}/v1/regions/shipping-rates`, saveData);
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
          <h1 className="text-3xl font-bold">{t('admin-shipping-rates-title')}</h1>
          <Button
            color="primary"
            endContent={<Plus className="w-4 h-4" />}
            onPress={handleOpenCreate}
          >
            {t('admin-shipping-rates-add')}
          </Button>
        </div>

        <Card className="mb-6">
          <CardBody className="flex gap-4">
            <Input
              isClearable
              className="w-full"
              placeholder={t('admin-common-search', 'Search...')}
              startContent={<SearchIcon className="w-4 h-4" />}
              value={globalFilter}
              onValueChange={setGlobalFilter}
            />
            <Select
              label={t('admin-common-status', 'Status')}
              selectedKeys={statusFilter ? [statusFilter] : []}
              onSelectionChange={(key) => setStatusFilter(Array.from(key).join(''))}
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
                <TableColumn key="display_name">{t('admin-common-name', 'Name')}</TableColumn>
                <TableColumn key="description">{t('admin-common-description', 'Description')}</TableColumn>
                <TableColumn key="max_weight">{t('admin-shipping-rates-max-weight', 'Max Weight (g)')}</TableColumn>
                <TableColumn key="delivery_days">{t('admin-shipping-rates-delivery-days', 'Delivery Days')}</TableColumn>
                <TableColumn key="status">{t('admin-common-status', 'Status')}</TableColumn>
                <TableColumn key="actions">{t('admin-common-actions', 'Actions')}</TableColumn>
              </TableHeader>
              <TableBody
                items={displayed}
                isLoading={loading}
                loadingContent={<div>{t('admin-common-loading', 'Loading...')}</div>}
                emptyContent={<div>{t('admin-common-empty', 'No data')}</div>}
              >
                {(rate) => (
                  <TableRow key={rate.id}>
                    <TableCell>{rate.display_name}</TableCell>
                    <TableCell>{rate.description ? rate.description.substring(0, 50) : '-'}</TableCell>
                    <TableCell>{rate.max_weight_g ? `${rate.max_weight_g}g` : '-'}</TableCell>
                    <TableCell>
                      {rate.min_delivery_days || rate.max_delivery_days
                        ? `${rate.min_delivery_days || '?'}-${rate.max_delivery_days || '?'} days`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <span className={rate.status === 'active' ? 'text-green-600' : 'text-gray-600'}>
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
                          size="sm"
                          variant="light"
                          color="danger"
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
              {isEditMode ? t('admin-shipping-rates-edit') : t('admin-shipping-rates-create')}
            </ModalHeader>
            <ModalBody>
              <Tooltip content={t('admin-common-name', 'Display name for this shipping rate')}>
                <Input
                  label={t('admin-common-name', 'Name')}
                  placeholder="Standard Shipping"
                  value={formData.display_name}
                  onValueChange={(value) => setFormData({...formData, display_name: value})}
                />
              </Tooltip>
              <Tooltip content={t('admin-common-description', 'Describe this shipping option')}>
                <Input
                  label={t('admin-common-description', 'Description')}
                  placeholder="Fast delivery option"
                  value={formData.description}
                  onValueChange={(value) => setFormData({...formData, description: value})}
                />
              </Tooltip>
              <Tooltip content={t('admin-shipping-rates-max-weight-help', 'Maximum package weight for this rate')}>
                <Input
                  type="number"
                  label={t('admin-shipping-rates-max-weight', 'Max Weight (g)')}
                  placeholder="5000"
                  min={0}
                  value={formData.max_weight_g}
                  onValueChange={(value) => setFormData({...formData, max_weight_g: value})}
                />
              </Tooltip>
              <Tooltip content={t('admin-shipping-rates-min-delivery-days-help', 'Minimum days until delivery')}>
                <Input
                  type="number"
                  label={t('admin-shipping-rates-min-delivery-days', 'Min Delivery Days')}
                  placeholder="1"
                  min={0}
                  value={formData.min_delivery_days}
                  onValueChange={(value) => setFormData({...formData, min_delivery_days: value})}
                />
              </Tooltip>
              <Tooltip content={t('admin-shipping-rates-max-delivery-days-help', 'Maximum days until delivery')}>
                <Input
                  type="number"
                  label={t('admin-shipping-rates-max-delivery-days', 'Max Delivery Days')}
                  placeholder="7"
                  min={0}
                  value={formData.max_delivery_days}
                  onValueChange={(value) => setFormData({...formData, max_delivery_days: value})}
                />
              </Tooltip>
              <Tooltip content={t('admin-common-status', 'Status')}>
                <Select
                  label={t('admin-common-status', 'Status')}
                  selectedKeys={[formData.status]}
                  onSelectionChange={(key) => setFormData({...formData, status: Array.from(key).join('') as 'active' | 'inactive'})}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt}>{opt}</SelectItem>
                  ))}
                </Select>
              </Tooltip>
            </ModalBody>
            <ModalFooter>
              <Button color="default" variant="light" onPress={() => onOpenChange()}>
                {t('admin-common-cancel', 'Cancel')}
              </Button>
              <Button color="primary" onPress={handleSave} isDisabled={!formData.display_name}>
                {t('admin-common-save', 'Save')}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </DefaultLayout>
  );
}
