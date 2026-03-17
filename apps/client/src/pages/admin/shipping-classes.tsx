import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@heroui/button';
import { Input } from '@heroui/input';
import { Select, SelectItem } from '@heroui/select';
import {
  Table, TableHeader, TableColumn, TableBody, TableRow, TableCell,
} from '@heroui/table';
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure,
} from '@heroui/modal';
import { Card, CardBody } from '@heroui/card';
import { Tooltip } from '@heroui/tooltip';
import { Chip } from '@heroui/chip';
import { Plus, Edit2, Trash2, Package } from 'lucide-react';
import { SearchIcon } from '@/components/icons';
import DefaultLayout from '@/layouts/default';
import {
  ShippingClass,
  getShippingClasses,
  createShippingClass,
  updateShippingClass,
  deleteShippingClass,
} from '@/lib/store-api';

// ─── Component ───────────────────────────────────────────────────────────

export default function ShippingClassesPage() {
  const { t } = useTranslation();
  
  // List state
  const [classes, setClasses] = useState<ShippingClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modal state
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingClass, setEditingClass] = useState<ShippingClass | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    display_name: '',
    description: '',
    resolution: 'exclusive' as 'exclusive' | 'additive',
    status: 'active' as 'active' | 'inactive',
  });

  // ─── Load data ─────────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      const resp = await getShippingClasses(100);
      setClasses(resp.items ?? []);
    } catch (err) {
      console.error('Failed to load shipping classes', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ─── Filtered list ─────────────────────────────────────────────────────

  const displayed = useMemo(() => {
    let filtered = classes;
    if (statusFilter) filtered = filtered.filter((c) => c.status === statusFilter);
    const term = globalFilter.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter(
        (c) => c.display_name.toLowerCase().includes(term) || c.code.toLowerCase().includes(term),
      );
    }
    return filtered;
  }, [classes, statusFilter, globalFilter]);

  // ─── Handlers ──────────────────────────────────────────────────────────

  const handleOpenCreate = () => {
    setIsEditMode(false);
    setEditingClass(null);
    setFormData({
      code: '',
      display_name: '',
      description: '',
      resolution: 'exclusive',
      status: 'active',
    });
    onOpen();
  };

  const handleOpenEdit = (cls: ShippingClass) => {
    setIsEditMode(true);
    setEditingClass(cls);
    setFormData({
      code: cls.code,
      display_name: cls.display_name,
      description: cls.description ?? '',
      resolution: cls.resolution,
      status: cls.status,
    });
    onOpen();
  };

  const handleSave = async () => {
    try {
      if (isEditMode && editingClass) {
        const updated = await updateShippingClass(editingClass.id, {
          display_name: formData.display_name,
          description: formData.description || null,
          resolution: formData.resolution,
          status: formData.status,
        });
        if (updated) {
          setClasses((prev) => prev.map((c) => (c.id === editingClass.id ? updated : c)));
        } else {
          await loadData();
        }
      } else {
        const created = await createShippingClass({
          code: formData.code,
          display_name: formData.display_name,
          description: formData.description || undefined,
          resolution: formData.resolution,
        });
        if (created) {
          setClasses((prev) => [...prev, created]);
        } else {
          await loadData();
        }
      }
      onOpenChange();
    } catch (err) {
      console.error('Failed to save shipping class', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('admin-shipping-classes-confirm-delete'))) return;
    try {
      await deleteShippingClass(id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete shipping class', err);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <DefaultLayout>
      <div className="p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">{t('admin-shipping-classes-title')}</h1>
              <p className="text-sm text-default-500 mt-1">
                {t('admin-shipping-classes-subtitle')}
              </p>
            </div>
          </div>
          <Button
            color="primary"
            endContent={<Plus className="w-4 h-4" />}
            onPress={handleOpenCreate}
          >
            {t('admin-shipping-classes-btn-new')}
          </Button>
        </div>

        {/* Info banner explaining resolution modes */}
        <Card className="mb-6 border-l-4 border-blue-400">
          <CardBody className="py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-semibold text-orange-600">{t('admin-shipping-classes-exclusive-help-title')}</span>
                <p className="text-default-500 mt-1">
                  {t('admin-shipping-classes-exclusive-help-desc')}
                </p>
              </div>
              <div>
                <span className="font-semibold text-green-600">{t('admin-shipping-classes-additive-help-title')}</span>
                <p className="text-default-500 mt-1">
                  {t('admin-shipping-classes-additive-help-desc')}
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Filters */}
        <Card className="mb-6">
          <CardBody className="flex gap-4">
            <Input
              isClearable
              className="w-full"
              placeholder={t('admin-shipping-classes-filter-placeholder')}
              startContent={<SearchIcon className="w-4 h-4" />}
              value={globalFilter}
              onValueChange={setGlobalFilter}
            />
            <Select
              label={t('admin-shipping-classes-status')}
              selectedKeys={statusFilter ? [statusFilter] : []}
              onSelectionChange={(key) => setStatusFilter(Array.from(key).join(''))}
            >
              <SelectItem key="">{t('admin-shipping-classes-filter-status')}</SelectItem>
              <SelectItem key="active">{t('admin-shipping-classes-active')}</SelectItem>
              <SelectItem key="inactive">{t('admin-shipping-classes-inactive')}</SelectItem>
            </Select>
          </CardBody>
        </Card>

        {/* Table */}
        <Card>
          <CardBody>
            <Table isStriped>
              <TableHeader>
                <TableColumn key="code">{t('admin-shipping-classes-col-code')}</TableColumn>
                <TableColumn key="display_name">{t('admin-shipping-classes-col-name')}</TableColumn>
                <TableColumn key="resolution">{t('admin-shipping-classes-col-resolution')}</TableColumn>
                <TableColumn key="description">{t('admin-shipping-classes-col-description')}</TableColumn>
                <TableColumn key="status">{t('admin-shipping-classes-col-status')}</TableColumn>
                <TableColumn key="actions">{t('admin-shipping-classes-col-actions')}</TableColumn>
              </TableHeader>
              <TableBody
                emptyContent={<div>{t('admin-shipping-classes-empty')}</div>}
                isLoading={loading}
                items={displayed}
                loadingContent={<div>{t('admin-shipping-classes-loading')}</div>}
              >
                {(cls) => (
                  <TableRow key={cls.id}>
                    <TableCell>
                      <code className="text-xs bg-default-100 px-2 py-0.5 rounded">
                        {cls.code}
                      </code>
                    </TableCell>
                    <TableCell className="font-medium">{cls.display_name}</TableCell>
                    <TableCell>
                      {cls.resolution === 'exclusive' ? (
                        <Chip color="warning" size="sm" variant="flat">
                          {t('admin-shipping-classes-exclusive')}
                        </Chip>
                      ) : (
                        <Chip color="success" size="sm" variant="flat">
                          {t('admin-shipping-classes-additive')}
                        </Chip>
                      )}
                    </TableCell>
                    <TableCell className="text-default-500 text-sm">
                      {cls.description ?? '—'}
                    </TableCell>
                    <TableCell>
                      <span className={cls.status === 'active' ? 'text-green-600' : 'text-gray-400'}>
                        {cls.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Tooltip content={t('admin-shipping-classes-btn-edit')}>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            onPress={() => handleOpenEdit(cls)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        </Tooltip>
                        <Tooltip content={t('admin-shipping-classes-btn-delete')} color="danger">
                          <Button
                            isIconOnly
                            color="danger"
                            size="sm"
                            variant="light"
                            onPress={() => handleDelete(cls.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardBody>
        </Card>

        {/* Create / Edit Modal */}
        <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg">
          <ModalContent>
            <ModalHeader>
              {isEditMode 
                ? t('admin-shipping-classes-modal-title-edit') 
                : t('admin-shipping-classes-modal-title-create')}
            </ModalHeader>
            <ModalBody className="gap-4">
              {/* Code — only editable on creation */}
              <Tooltip content={t('admin-shipping-classes-code-help')}>
                <Input
                  isRequired
                  isDisabled={isEditMode}
                  label={t('admin-shipping-classes-code')}
                  placeholder={t('admin-shipping-classes-code-placeholder')}
                  value={formData.code}
                  onValueChange={(v) =>
                    setFormData({ ...formData, code: v.toLowerCase() })
                  }
                />
              </Tooltip>
              <Input
                isRequired
                label={t('admin-shipping-classes-display-name')}
                placeholder={t('admin-shipping-classes-display-name-placeholder')}
                value={formData.display_name}
                onValueChange={(v) => setFormData({ ...formData, display_name: v })}
              />
              <Input
                label={t('admin-shipping-classes-description')}
                placeholder={t('admin-shipping-classes-description-placeholder')}
                value={formData.description}
                onValueChange={(v) => setFormData({ ...formData, description: v })}
              />
              <Select
                isRequired
                label={t('admin-shipping-classes-resolution-mode')}
                description={
                  formData.resolution === 'exclusive'
                    ? t('admin-shipping-classes-resolution-exclusive-desc')
                    : t('admin-shipping-classes-resolution-additive-desc')
                }
                selectedKeys={[formData.resolution]}
                onSelectionChange={(key) =>
                  setFormData({
                    ...formData,
                    resolution: Array.from(key).join('') as any,
                  })
                }
              >
                <SelectItem key="exclusive">{t('admin-shipping-classes-resolution-exclusive-label')}</SelectItem>
                <SelectItem key="additive">{t('admin-shipping-classes-resolution-additive-label')}</SelectItem>
              </Select>
              {isEditMode && (
                <Select
                  label={t('admin-shipping-classes-status')}
                  selectedKeys={[formData.status]}
                  onSelectionChange={(key) =>
                    setFormData({ ...formData, status: Array.from(key).join('') as any })
                  }
                >
                  <SelectItem key="active">{t('admin-shipping-classes-active')}</SelectItem>
                  <SelectItem key="inactive">{t('admin-shipping-classes-inactive')}</SelectItem>
                </Select>
              )}
            </ModalBody>
            <ModalFooter>
              <Button color="default" variant="light" onPress={onOpenChange}>
                {t('admin-shipping-classes-modal-cancel')}
              </Button>
              <Button
                color="primary"
                isDisabled={!formData.code || !formData.display_name}
                onPress={handleSave}
              >
                {t('admin-shipping-classes-modal-save')}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </div>
    </DefaultLayout>
  );
}
