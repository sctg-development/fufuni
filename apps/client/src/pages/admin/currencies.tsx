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

interface Currency {
  id: string;
  code: string;
  display_name: string;
  symbol: string;
  decimal_places: number;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

const STATUS_OPTIONS = ["active", "inactive"];

export default function CurrenciesPage() {
  const { t } = useTranslation();
  const { getJson, postJson, deleteJson, patchJson } = useSecuredApi();
  
  const apiBase = (import.meta as any).env?.API_BASE_URL ? (import.meta as any).env.API_BASE_URL : "";

  // List state
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalFilter, setGlobalFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Modal state
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    display_name: '',
    symbol: '',
    decimal_places: 2,
    status: 'active' as 'active' | 'inactive',
  });

  // Load currencies
  const loadCurrencies = async () => {
    setLoading(true);
    try {
      const resp = await getJson(`${apiBase}/v1/regions/currencies?limit=100`);
      setCurrencies(resp.items || []);
    } catch (err) {
      console.error("Failed to load currencies", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurrencies();
  }, []);

  // Filtered currencies
  const displayed = useMemo(() => {
    let filtered = currencies;
    if (statusFilter) {
      filtered = filtered.filter(c => c.status === statusFilter);
    }
    const term = globalFilter.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter(c =>
        c.code.toLowerCase().includes(term) ||
        c.display_name.toLowerCase().includes(term) ||
        c.symbol.toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [currencies, statusFilter, globalFilter]);

  const handleOpenCreate = () => {
    setIsEditMode(false);
    setEditingCurrency(null);
    setFormData({
      code: '',
      display_name: '',
      symbol: '',
      decimal_places: 2,
      status: 'active',
    });
    onOpen();
  };

  const handleOpenEdit = (currency: Currency) => {
    setIsEditMode(true);
    setEditingCurrency(currency);
    setFormData({
      code: currency.code,
      display_name: currency.display_name,
      symbol: currency.symbol,
      decimal_places: currency.decimal_places,
      status: currency.status,
    });
    onOpen();
  };

  const handleSave = async () => {
    try {
      if (isEditMode && editingCurrency) {
        const updateData = {
          display_name: formData.display_name,
          symbol: formData.symbol,
          decimal_places: formData.decimal_places,
          status: formData.status,
        };
        const response = await patchJson(`${apiBase}/v1/regions/currencies/${editingCurrency.id}`, updateData);
        // Mettre à jour le state local
        if (response) {
          setCurrencies(currencies.map(c => c.id === editingCurrency.id ? response : c));
        } else {
          await loadCurrencies();
        }
      } else {
        const response = await postJson(`${apiBase}/v1/regions/currencies`, formData);
        // Ajouter la nouvelle devise
        if (response) {
          setCurrencies([...currencies, response]);
        } else {
          await loadCurrencies();
        }
      }
      onOpenChange();
    } catch (err) {
      console.error("Failed to save currency", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this currency?")) {
      try {
        await deleteJson(`${apiBase}/v1/regions/currencies/${id}`);
        await loadCurrencies();
      } catch (err) {
        console.error("Failed to delete currency", err);
      }
    }
  };

  return (
    <DefaultLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">{t('admin-currencies-title')}</h1>
          <Button
            color="primary"
            endContent={<Plus className="w-4 h-4" />}
            onPress={handleOpenCreate}
          >
            {t('admin-currencies-add')}
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
                <TableColumn key="code">{t('admin-common-code', 'Code')}</TableColumn>
                <TableColumn key="display_name">{t('admin-common-name', 'Name')}</TableColumn>
                <TableColumn key="symbol">{t('admin-common-symbol', 'Symbol')}</TableColumn>
                <TableColumn key="decimal_places">{t('admin-currencies-decimals', 'Decimals')}</TableColumn>
                <TableColumn key="status">{t('admin-common-status', 'Status')}</TableColumn>
                <TableColumn key="actions">{t('admin-common-actions', 'Actions')}</TableColumn>
              </TableHeader>
              <TableBody
                items={displayed}
                isLoading={loading}
                loadingContent={<div>{t('admin-common-loading', 'Loading...')}</div>}
                emptyContent={<div>{t('admin-common-empty', 'No data')}</div>}
              >
                {(currency) => (
                  <TableRow key={currency.id}>
                    <TableCell className="font-mono font-bold">{currency.code}</TableCell>
                    <TableCell>{currency.display_name}</TableCell>
                    <TableCell>{currency.symbol}</TableCell>
                    <TableCell>{currency.decimal_places}</TableCell>
                    <TableCell>
                      <span className={currency.status === 'active' ? 'text-green-600' : 'text-gray-600'}>
                        {currency.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onPress={() => handleOpenEdit(currency)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          color="danger"
                          onPress={() => handleDelete(currency.id)}
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

        <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg">
          <ModalContent>
            <ModalHeader className="flex flex-col gap-1">
              {isEditMode ? t('admin-currencies-edit', 'Edit Currency') : t('admin-currencies-create', 'Create Currency')}
            </ModalHeader>
            <ModalBody>
              <Tooltip content={t('admin-currencies-code-help', 'ISO 4217 currency code')}>
                <Input
                  isDisabled={isEditMode}
                  label={t('admin-common-code', 'Code')}
                  placeholder="USD"
                  maxLength={3}
                  value={formData.code}
                  onValueChange={(value) => setFormData({...formData, code: value.toUpperCase()})}
                />
              </Tooltip>
              <Tooltip content={t('admin-common-name', 'Name')}>
                <Input
                  label={t('admin-common-name', 'Name')}
                  placeholder="US Dollar"
                  value={formData.display_name}
                  onValueChange={(value) => setFormData({...formData, display_name: value})}
                />
              </Tooltip>
              <Tooltip content={t('admin-currencies-symbol-help', 'Symbol displayed to customers')}>
                <Input
                  label={t('admin-common-symbol', 'Symbol')}
                  placeholder="$"
                  maxLength={5}
                  value={formData.symbol}
                  onValueChange={(value) => setFormData({...formData, symbol: value})}
                />
              </Tooltip>
              <Tooltip content={t('admin-currencies-decimals-help', 'Number of decimal places')}>
                <Input
                  type="number"
                  label={t('admin-currencies-decimals', 'Decimal Places')}
                  placeholder="2"
                  min={0}
                  max={8}
                  value={formData.decimal_places.toString()}
                  onValueChange={(value) => setFormData({...formData, decimal_places: parseInt(value) || 2})}
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
