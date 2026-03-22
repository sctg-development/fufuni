/**
 * Copyright (c) 2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 * 
 * Client-side invoice PDF generation using jsPDF.
 * All data comes from the order details fetched from the API.
 * No sensitive data is sent to any server — the PDF is generated entirely in the browser.
 */

import jsPDF from 'jspdf';

interface OrderItem {
  product_title: string;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  currency: string;
}

interface InvoiceData {
  orderNumber: string;
  orderDate: string;
  items: OrderItem[];
  subtotal_cents: number;
  tax_cents: number;
  shipping_cents: number;
  total_cents: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  shippingAddress?: string;
  billingAddress?: string;
  storeAddress?: string;
}

/**
 * Formats a price in cents to a currency string
 */
function formatPrice(cents: number, currency: string = 'EUR'): string {
  const amount = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Generates a PDF invoice and triggers a browser download.
 * 
 * @param data - Invoice data containing order, customer, and item details
 * 
 * @example
 * ```tsx
 * const invoiceData: InvoiceData = {
 *   orderNumber: 'ORD-12345',
 *   orderDate: '2026-03-22',
 *   items: [
 *     { product_title: 'Widget', quantity: 2, unit_price_cents: 2999, total_price_cents: 5998, currency: 'EUR' }
 *   ],
 *   subtotal_cents: 5998,
 *   tax_cents: 1140,
 *   shipping_cents: 798,
 *   total_cents: 7936,
 *   currency: 'EUR',
 *   customerName: 'John Doe',
 *   customerEmail: 'john@example.com',
 *   storeAddress: 'My Store, 123 Main St, Paris, France',
 * };
 * 
 * generateInvoice(invoiceData);
 * ```
 */
export function generateInvoice(data: InvoiceData): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // Document properties
  doc.setProperties({
    title: `Invoice ${data.orderNumber}`,
    subject: `Order ${data.orderNumber}`,
    author: 'Fufuni',
  });

  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;

  let yPosition = margin;

  // ─── Header / Store Info ───────────────────────────────────
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('INVOICE', margin, yPosition);

  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');
  yPosition += 10;

  if (data.storeAddress) {
    doc.text(data.storeAddress, margin, yPosition);
    yPosition += 8;
  }

  // ─── Invoice Details (Order Number, Date) ──────────────────
  yPosition += 2;
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(`Order: ${data.orderNumber}`, margin, yPosition);
  yPosition += 6;

  doc.setFont(undefined, 'normal');
  doc.text(`Date: ${new Date(data.orderDate).toLocaleDateString()}`, margin, yPosition);
  yPosition += 8;

  // ─── Customer Info ─────────────────────────────────────────
  yPosition += 2;
  doc.setFont(undefined, 'bold');
  doc.text('Bill To:', margin, yPosition);
  yPosition += 6;

  doc.setFont(undefined, 'normal');
  doc.text(data.customerName, margin, yPosition);
  yPosition += 5;
  doc.text(data.customerEmail, margin, yPosition);

  if (data.billingAddress) {
    yPosition += 5;
    // Word wrap billing address
    const billingLines = doc.splitTextToSize(data.billingAddress, contentWidth - 10);
    doc.text(billingLines, margin, yPosition);
    yPosition += billingLines.length * 5;
  }

  yPosition += 8;

  // ─── Shipping Address ──────────────────────────────────────
  if (data.shippingAddress) {
    doc.setFont(undefined, 'bold');
    doc.text('Ship To:', pageWidth / 2 + 5, yPosition - 8);

    doc.setFont(undefined, 'normal');
    const shippingLines = doc.splitTextToSize(
      data.shippingAddress,
      contentWidth / 2 - 10
    );
    doc.text(shippingLines, pageWidth / 2 + 5, yPosition - 3);
    yPosition += Math.max(shippingLines.length * 5, 10);
  }

  yPosition += 5;

  // ─── Items Table ───────────────────────────────────────────
  const tableTop = yPosition;
  const colWidths = [80, 25, 30, 35];
  const colX = [margin, margin + 80, margin + 105, margin + 135];

  // Table header
  doc.setFont(undefined, 'bold');
  doc.setFillColor(240, 240, 240);
  doc.rect(margin - 2, tableTop - 5, contentWidth + 4, 8, 'F');
  doc.text('Product', colX[0], tableTop);
  doc.text('Qty', colX[1], tableTop);
  doc.text('Unit Price', colX[2], tableTop);
  doc.text('Total', colX[3], tableTop);

  // Table rows
  doc.setFont(undefined, 'normal');
  yPosition = tableTop + 8;

  data.items.forEach((item) => {
    const productLines = doc.splitTextToSize(item.product_title, colWidths[0] - 2);
    const lineHeight = productLines.length * 5;

    // Wrap if approaching page end
    if (yPosition + lineHeight > pageHeight - margin - 30) {
      doc.addPage();
      yPosition = margin;
    }

    // Draw item row
    let itemY = yPosition;
    doc.text(productLines, colX[0], itemY);
    doc.text(String(item.quantity), colX[1], itemY);
    doc.text(formatPrice(item.unit_price_cents, item.currency), colX[2], itemY);
    doc.text(formatPrice(item.total_price_cents, item.currency), colX[3], itemY);

    yPosition += lineHeight + 2;
  });

  yPosition += 5;

  // ─── Totals Section ────────────────────────────────────────
  const totalsX = margin + 110;

  doc.setFont(undefined, 'normal');
  doc.text('Subtotal:', totalsX, yPosition);
  doc.text(formatPrice(data.subtotal_cents, data.currency), pageWidth - margin - 10, yPosition, { align: 'right' });

  yPosition += 6;
  doc.text('Tax:', totalsX, yPosition);
  doc.text(formatPrice(data.tax_cents, data.currency), pageWidth - margin - 10, yPosition, { align: 'right' });

  yPosition += 6;
  doc.text('Shipping:', totalsX, yPosition);
  doc.text(formatPrice(data.shipping_cents, data.currency), pageWidth - margin - 10, yPosition, { align: 'right' });

  yPosition += 8;
  doc.setFont(undefined, 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL:', totalsX, yPosition);
  doc.text(formatPrice(data.total_cents, data.currency), pageWidth - margin - 10, yPosition, { align: 'right' });

  yPosition += 10;

  // ─── Footer ────────────────────────────────────────────────
  yPosition += 5;
  doc.setFontSize(8);
  doc.setFont(undefined, 'normal');
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, yPosition, pageWidth - margin, yPosition);
  yPosition += 5;
  doc.text('Thank you for your purchase!', pageWidth / 2, yPosition, {
    align: 'center',
  });

  // ─── Download the PDF ──────────────────────────────────────
  doc.save(`invoice-${data.orderNumber}.pdf`);
}
