import React, { useRef, useState } from 'react';
import { Product, Sale, Register, TokenOrder, CompanySettings } from '../types/pos';
import { getNowParts, uid } from '../services/storage';
import * as XLSX from 'xlsx';
import { FileSpreadsheet, Upload, Download, Database, CheckCircle2, AlertCircle } from 'lucide-react';

interface ImportExportViewProps {
  products: Product[];
  sales: Sale[];
  registers: Register[];
  tokens: TokenOrder[];
  settings: CompanySettings;
  onImportProducts: (products: Product[]) => void;
  onRestoreBackup: (data: {
    products?: Product[];
    sales?: Sale[];
    settings?: CompanySettings;
  }) => void;
}

export const ImportExportView: React.FC<ImportExportViewProps> = ({
  products,
  sales,
  registers,
  tokens,
  settings,
  onImportProducts,
  onRestoreBackup
}) => {
  const productFileRef = useRef<HTMLInputElement>(null);
  const backupFileRef = useRef<HTMLInputElement>(null);

  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importType, setImportType] = useState<'success' | 'error' | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const exportProducts = () => {
    const rows = products.map((p) => ({
      'Stock ID': p.id,
      Product: p.name,
      Category: p.category,
      Barcode: p.barcode || '',
      SKU: p.sku || '',
      'Selling Price': p.sellPrice,
      'Buying Price': p.buyPrice || 0,
      Supplier: p.supplier || '',
      Status: p.status,
      'Updated Date': p.updatedDate || getNowParts().date
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Products');
    XLSX.writeFile(wb, `Products_${getNowParts().date}.xlsx`);
    setImportType('success');
    setImportStatus('Products Excel exported successfully.');
  };

  const handleProductImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setImportStatus('Reading and uploading Excel file to Firebase...');
    setImportType('success');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rows.length) {
          setIsProcessing(false);
          setImportType('error');
          setImportStatus('The uploaded file contains no data rows.');
          return;
        }

        const now = getNowParts();
        const updatedProducts: Product[] = [...products];
        let newCount = 0;
        let updateCount = 0;

        rows.forEach((row) => {
          // Normalize column lookups (case-insensitive and trimmed)
          const getVal = (...keys: string[]): string => {
            for (const k of keys) {
              if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
                return String(row[k]).trim();
              }
            }
            // Case-insensitive fallback
            const lowerKeys = keys.map((k) => k.toLowerCase());
            for (const rk of Object.keys(row)) {
              if (lowerKeys.includes(rk.toLowerCase().trim())) {
                const v = row[rk];
                if (v !== undefined && v !== null && String(v).trim() !== '') {
                  return String(v).trim();
                }
              }
            }
            return '';
          };

          const name = getVal('Product', 'Product Name', 'Name', 'Item', 'Item Name', 'Description');
          if (!name) return;

          const sellPriceStr = getVal('Selling Price', 'Selling Price 1', 'Sell Price', 'Price', 'SellingPrice', 'Unit Price', 'Rate');
          const sellPrice = parseFloat(sellPriceStr.replace(/[^0-9.]/g, '')) || 0;

          const buyPriceStr = getVal('Buying Price', 'Buy Price', 'Cost', 'BuyingPrice', 'Purchase Price', 'Cost Price');
          const buyPrice = parseFloat(buyPriceStr.replace(/[^0-9.]/g, '')) || 0;

          const barcode = getVal('Barcode', 'Bar Code', 'Code', 'Item Code');
          const sku = getVal('SKU', 'Sku', 'Product Code');
          const category = getVal('Category', 'Group', 'Department') || 'General';
          const supplier = getVal('Supplier', 'Vendor');
          const statusVal = getVal('Status');
          const status = statusVal.toLowerCase() === 'inactive' ? 'inactive' : 'active';
          const stockId = getVal('Stock ID', 'ID', 'StockId', 'Product ID', 'Item ID');

          const existing = updatedProducts.find(
            (p) => (stockId && p.id === stockId) || (barcode && p.barcode && p.barcode === barcode) || p.name.toLowerCase() === name.toLowerCase()
          );

          if (existing) {
            existing.name = name;
            existing.sellPrice = sellPrice;
            existing.buyPrice = buyPrice;
            existing.category = category;
            existing.barcode = barcode || existing.barcode;
            existing.sku = sku || existing.sku;
            existing.supplier = supplier || existing.supplier;
            existing.status = status as any;
            existing.updatedDate = now.date;
            updateCount += 1;
          } else {
            updatedProducts.push({
              id: stockId || uid('p'),
              name,
              category,
              barcode,
              sku,
              sellPrice,
              buyPrice,
              supplier,
              status: status as any,
              createdDate: now.date,
              updatedDate: now.date
            });
            newCount += 1;
          }
        });

        await onImportProducts(updatedProducts);
        setIsProcessing(false);
        setImportType('success');
        setImportStatus(`Import successful! ${newCount} added, ${updateCount} updated. Synced to Firebase & all browsers!`);
      } catch (err: any) {
        setIsProcessing(false);
        setImportType('error');
        setImportStatus(`Import failed: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const exportFullBackup = () => {
    const wb = XLSX.utils.book_new();

    // Settings
    const settingsRows = [
      { Key: 'name', Value: settings.name },
      { Key: 'currency', Value: settings.currency },
      { Key: 'footer', Value: settings.footer },
      { Key: 'receiptSize', Value: settings.receiptSize }
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(settingsRows), 'Settings');

    // Products
    const productRows = products.map((p) => ({
      'Stock ID': p.id,
      Product: p.name,
      Category: p.category,
      Barcode: p.barcode,
      SKU: p.sku,
      'Selling Price': p.sellPrice,
      'Buying Price': p.buyPrice,
      Supplier: p.supplier || '',
      Status: p.status
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productRows), 'Products');

    // Sales (All Transactions with status)
    const salesRows = sales.map((s) => ({
      'Invoice Number': s.invoiceNumber,
      Date: s.date,
      Time: s.time,
      Cashier: s.cashier,
      'Unit Code': s.unitCode,
      'Payment Method': s.paymentMethod,
      'Grand Total': s.grandTotal,
      Status: s.isVoided || s.status === 'VOIDED' ? 'VOIDED' : 'COMPLETED',
      'Void Reason': s.voidReason || '',
      'Voided At': s.voidedAt || '',
      'Voided By': s.voidedBy || '',
      Items: s.items.map((i) => `${i.name} x${i.qty}`).join(', ')
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesRows), 'Sales');

    // Voided Sales Sheet
    const voidedOnly = sales.filter((s) => s.isVoided || s.status === 'VOIDED');
    if (voidedOnly.length > 0) {
      const voidedRows = voidedOnly.map((s) => ({
        'Invoice Number': s.invoiceNumber,
        Date: s.date,
        Time: s.time,
        Cashier: s.cashier,
        'Unit Code': s.unitCode,
        'Payment Method': s.paymentMethod,
        'Voided Amount': s.grandTotal,
        'Void Reason': s.voidReason || 'Not specified',
        'Voided At': s.voidedAt || '',
        'Voided By': s.voidedBy || s.cashier,
        Items: s.items.map((i) => `${i.name} x${i.qty}`).join(', ')
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(voidedRows), 'Voided Sales');
    }

    XLSX.writeFile(wb, `POS_Full_Backup_${getNowParts().date}.xlsx`);
    setImportType('success');
    setImportStatus('Complete system backup exported successfully.');
  };

  return (
    <div className="space-y-4 text-black">
      {importStatus && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs font-bold shadow-2xs ${
            importType === 'success'
              ? 'bg-white text-emerald-950 border-emerald-500'
              : 'bg-white text-rose-800 border-rose-400'
          }`}
        >
          {importType === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
          <span>{importStatus}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Product Excel Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-base mb-1">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Product Excel Import / Export
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Export all product prices and details to Excel, edit prices or add new products, and re-import to update your system.
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={exportProducts}
              className="w-full py-3 rounded-xl bg-white hover:bg-slate-100 text-black border border-slate-300 font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
            >
              <Download className="w-4 h-4 text-emerald-600" /> Download Products Excel (.xlsx)
            </button>

            <div
              onClick={() => productFileRef.current?.click()}
              className="border-2 border-dashed border-emerald-500 hover:border-emerald-700 bg-white hover:bg-emerald-50/50 rounded-xl p-4 text-center cursor-pointer transition-all shadow-2xs"
            >
              <Upload className="w-5 h-5 mx-auto text-emerald-600 mb-1" />
              <span className="text-xs font-bold text-emerald-950 block">Click to Select Products Excel File</span>
              <span className="text-[10px] text-emerald-700">Supports .xlsx and .xls sheets</span>
            </div>
            <input
              type="file"
              ref={productFileRef}
              accept=".xlsx,.xls"
              onChange={handleProductImport}
              className="hidden"
            />
          </div>
        </div>

        {/* Complete System Backup & Restore */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-base mb-1">
              <Database className="w-5 h-5 text-emerald-600" /> System Backup & Restore
            </div>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Creates a comprehensive multi-sheet Excel workbook containing Settings, Products, Sales, and Shift data for safe archival or migration.
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={exportFullBackup}
              className="w-full py-3 rounded-xl bg-white hover:bg-slate-100 text-black border-2 border-emerald-600 font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs"
            >
              <Download className="w-4 h-4 text-emerald-600" /> Backup Complete POS (Excel)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
