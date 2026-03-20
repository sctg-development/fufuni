/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@heroui/input';
import { Select, SelectItem } from '@heroui/select';
import { useTranslation } from 'react-i18next';

import { availableLanguages } from '@/i18n';
import {
  getTaxNameForLocale,
  mergeTaxNameLocale,
  parseTaxName,
} from '@/utils/description';

interface LocalizedTaxNameInputProps {
  /** Raw value from the DB: plain string (legacy) or LocalizedDesc JSON */
  value: string;
  /** Called every time the content changes */
  onChange: (newValue: string) => void;
  /** Whether the field is required */
  required?: boolean;
  /** Optional controlled locale (if provided, hides the internal selector) */
  locale?: string;
  /** Optional callback to change locale (used by parent) */
  onLocaleChange?: (locale: string) => void;
}

export function LocalizedTaxNameInput({
  value,
  onChange,
  required = false,
  locale,
  onLocaleChange,
}: LocalizedTaxNameInputProps) {
  const { t } = useTranslation();

  // --- Locale state ---------------------------------------------------------
  const defaultLocale =
    availableLanguages.find((l) => l.isDefault)?.code ?? 'en-US';
  const [internalLocale, setInternalLocale] = useState(defaultLocale);
  const selectedLocale = locale ?? internalLocale;
  const [inputValue, setInputValue] = useState('');

  // --- Refs to avoid stale closures -----------------------------------------
  const valueRef = useRef(value);
  const localeRef = useRef(selectedLocale);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { localeRef.current = selectedLocale; }, [selectedLocale]);

  // --- Sync inputValue when value or locale changes -------------------------
  useEffect(() => {
    setInputValue(getTaxNameForLocale(value, selectedLocale));
  }, [value, selectedLocale]);

  // --- Auto-migrate to JSON when locale changes on a legacy title -----------
  const isFirstMountRef = useRef(true);
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return; 
    }

    const parsed = parseTaxName(value);
    if (typeof parsed === 'string' && inputValue.trim()) {
      const updated = mergeTaxNameLocale(value, selectedLocale, inputValue);
      onChange(updated);
    }
  }, [selectedLocale, value, inputValue, onChange]);

  // RTL support
  const isRTL =
    availableLanguages.find((l) => l.code === selectedLocale)?.isRTL ?? false;

  // --- Input change ---------------------------------------------------------
  const handleInputChange = useCallback(
    (text: string) => {
      setInputValue(text);
      const updated = mergeTaxNameLocale(valueRef.current, localeRef.current, text);
      onChange(updated);
    },
    [onChange]
  );

  // --- Locale switch --------------------------------------------------------
  const handleLocaleChange = useCallback((newLocale: string) => {
    if (onLocaleChange) {
      onLocaleChange(newLocale);
    } else {
      setInternalLocale(newLocale);
    }
  }, [onLocaleChange]);

  return (
    <div className="flex items-center gap-2" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Language selector (hidden when controlled by parent) */}
      {!locale && (
        <Select
          size="sm"
          className="w-36 shrink-0"
          aria-label={t('admin-common-language')}
          selectedKeys={[selectedLocale]}
          onSelectionChange={(keys) =>
            handleLocaleChange(Array.from(keys).join(''))
          }
        >
          {availableLanguages.map((lang) => (
            <SelectItem key={lang.code}>{lang.nativeName}</SelectItem>
          ))}
        </Select>
      )}

      <Input
        className="flex-1"
        required={required}
        value={inputValue}
        onValueChange={handleInputChange}
        placeholder="e.g. VAT FR"
        dir={isRTL ? 'rtl' : 'ltr'}
      />
    </div>
  );
}
