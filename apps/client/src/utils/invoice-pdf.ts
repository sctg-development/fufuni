/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * Client-side invoice PDF generation using jsPDF.
 * Runs entirely in the browser — no server call required.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface OrderForPdf {
  number: string;
  created_at: string;
  currency: string;
  email: string;
  shipping_name?: string;
  shipping_phone?: string;
  items: {
    title: string;
    qty: number;
    unit_price_cents: number;
  }[];
  subtotal_cents: number;
  discount_amount_cents?: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  tracking_number?: string;
  tracking_url?: string;
}

/**
 * Formats a number as currency.
 *
 * @param cents - Amount in cents
 * @param currency - Currency code (e.g., 'USD', 'EUR')
 * @returns Formatted string (e.g., '$12.34')
 */
function formatCurrency(cents: number, currency: string): string {
  const amount = cents / 100;
  const symbols: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    CAD: 'C$',
    CHF: 'CHF ',
    AUD: 'A$',
    JPY: '¥',
    CNY: '¥',
  };
  const symbol = symbols[currency] || currency + ' ';
  return `${symbol}${amount.toFixed(2)}`;
}

/**
 * Generates an invoice PDF for a given order and triggers a browser download.
 * Runs entirely client-side — no Worker call required.
 *
 * @param order - The order data to include in the invoice
 * @param storeName - Display name of the store (e.g., 'Fufuni Shop')
 * @param locale - Locale for date and number formatting (e.g., 'fr-FR')
 */
export function downloadInvoicePdf(
  order: OrderForPdf,
  storeName: string = 'Fufuni Store',
  locale: string = 'en-US'
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // ---- Header ----
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(storeName, 14, 20);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text('Invoice', pageWidth - 14, 20, { align: 'right' });

  // ---- Order metadata ----
  doc.setFontSize(10);
  doc.setTextColor(40);
  doc.text(`Order #: ${order.number}`, 14, 34);
  doc.text(
    `Date: ${new Date(order.created_at).toLocaleDateString(locale)}`,
    14,
    40
  );
  doc.text(`Email: ${order.email}`, 14, 46);

  if (order.shipping_name) {
    doc.text(`Ship to: ${order.shipping_name}`, 14, 52);
  }

  if (order.tracking_number) {
    doc.text(`Tracking: ${order.tracking_number}`, 14, 58);
  }

  // ---- Items table ----
  const tableBody: any[] = [];
  let startY = 62;

  // If we need space for shipping/tracking info, adjust startY
  if (order.shipping_name || order.tracking_number) {
    startY = 68;
  }

  for (const item of order.items) {
    tableBody.push([
      item.title,
      item.qty.toString(),
      formatCurrency(item.unit_price_cents, order.currency),
      formatCurrency(
        item.qty * item.unit_price_cents,
        order.currency
      ),
    ]);
  }

  autoTable(doc, {
    startY,
    head: [['Item', 'Qty', 'Unit Price', 'Total']],
    body: tableBody,
    headStyles: { fillColor: [37, 99, 235] }, // Tailwind blue-600
    margin: { left: 14, right: 14 },
    didDrawPage: () => {
      // Footer
      const pageSize = doc.internal.pageSize;
      const pageHeight = pageSize.getHeight();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Generated on ${new Date().toLocaleDateString(locale)} — ${storeName}`,
        14,
        pageHeight - 10
      );
    },
  });

  // ---- Totals ----
  const finalY = (doc as any).lastAutoTable.finalY + 8;
  const right = pageWidth - 14;
  let currentY = finalY;

  const addTotalLine = (
    label: string,
    amountCents: number,
    bold: boolean = false
  ) => {
    if (bold) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
    }

    doc.text(label, 14, currentY);
    doc.text(formatCurrency(amountCents, order.currency), right, currentY, {
      align: 'right',
    });
    currentY += 6;
  };

  addTotalLine('Subtotal', order.subtotal_cents);

  if (order.discount_amount_cents) {
    addTotalLine('Discount', -order.discount_amount_cents);
  }

  addTotalLine('Shipping', order.shipping_cents);
  addTotalLine('Tax', order.tax_cents);

  // Draw a line before the total
  doc.setDrawColor(200);
  doc.line(14, currentY - 1, right, currentY - 1);

  addTotalLine('TOTAL', order.total_cents, true);

  // ---- Additional Info ----
  if (order.tracking_url) {
    currentY += 4;
    doc.setFontSize(8);
    doc.setTextColor(66, 133, 244); // Blue
    doc.textWithLink(
      'Track Your Shipment',
      14,
      currentY,
      { pageNumber: 1, x: 0, y: 0 }
    );
    doc.setDrawColor(66, 133, 244);
    doc.line(14, currentY + 0.5, 45, currentY + 0.5);
  }

  // ---- Trigger download ----
  doc.save(`invoice-${order.number}.pdf`);
}

/**
 * Opens the invoice PDF in a new tab instead of downloading it.
 *
 * @param order - The order data
 * @param storeName - Store display name
 * @param locale - Date/number locale
 */
export function openInvoicePdf(
  order: OrderForPdf,
  storeName: string = 'Fufuni Store',
  locale: string = 'en-US'
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // ---- Header ----
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(storeName, 14, 20);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text('Invoice', pageWidth - 14, 20, { align: 'right' });

  // ---- Order metadata ----
  doc.setFontSize(10);
  doc.setTextColor(40);
  doc.text(`Order #: ${order.number}`, 14, 34);
  doc.text(
    `Date: ${new Date(order.created_at).toLocaleDateString(locale)}`,
    14,
    40
  );
  doc.text(`Email: ${order.email}`, 14, 46);

  if (order.shipping_name) {
    doc.text(`Ship to: ${order.shipping_name}`, 14, 52);
  }

  // ---- Items table ----
  const tableBody: any[] = [];
  for (const item of order.items) {
    tableBody.push([
      item.title,
      item.qty.toString(),
      formatCurrency(item.unit_price_cents, order.currency),
      formatCurrency(item.qty * item.unit_price_cents, order.currency),
    ]);
  }

  autoTable(doc, {
    startY: 62,
    head: [['Item', 'Qty', 'Unit Price', 'Total']],
    body: tableBody,
    headStyles: { fillColor: [37, 99, 235] },
    margin: { left: 14, right: 14 },
  });

  // ---- Totals ----
  const finalY = (doc as any).lastAutoTable.finalY + 8;
  const right = pageWidth - 14;
  let currentY = finalY;

  const addTotalLine = (
    label: string,
    amountCents: number,
    bold: boolean = false
  ) => {
    if (bold) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
    }

    doc.text(label, 14, currentY);
    doc.text(formatCurrency(amountCents, order.currency), right, currentY, {
      align: 'right',
    });
    currentY += 6;
  };

  addTotalLine('Subtotal', order.subtotal_cents);
  if (order.discount_amount_cents) {
    addTotalLine('Discount', -order.discount_amount_cents);
  }
  addTotalLine('Shipping', order.shipping_cents);
  addTotalLine('Tax', order.tax_cents);

  doc.setDrawColor(200);
  doc.line(14, currentY - 1, right, currentY - 1);

  addTotalLine('TOTAL', order.total_cents, true);

  // ---- Open in new window ----
  window.open(doc.output('bloburi'));
}
