import React, { useState, useRef } from 'react';
import { Product, CompanySettings } from '../types/pos';
import { formatMoney, uid, getNowParts, loadData, saveData } from '../services/storage';
import { Plus, Search, Edit2, Trash2, DollarSign, X, Check, ShoppingBag, Image as ImageIcon, Upload, RefreshCw, AlertTriangle, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { saveSettingsToFirebase } from '../services/firebase';
import * as XLSX from 'xlsx';

interface SupervisorAdminProductsProps {
  products: Product[];
  settings: CompanySettings;
  isSupervisor?: boolean;
  onSaveProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onDeleteMultipleProducts?: (productIds: string[]) => void;
  onDeleteAllProducts?: () => void;
  onImportProducts?: (products: Product[]) => void;
  onBulkUpdatePrices?: (updates: { id: string; price: number }[]) => void;
  onSaveSettings?: (settings: CompanySettings) => void;
}

export const SupervisorAdminProducts: React.FC<SupervisorAdminProductsProps> = ({
  products,
  settings,
  isSupervisor = false,
  onSaveProduct,
  onDeleteProduct,
  onDeleteMultipleProducts,
  onDeleteAllProducts,
  onImportProducts,
  onSaveSettings
}) => {
  const excelFileRef = useRef<HTMLInputElement>(null);
  const [excelUploadStatus, setExcelUploadStatus] = useState<string | null>(null);
  const [excelUploadType, setExcelUploadType] = useState<'success' | 'error' | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPriceUpdateModalOpen, setIsPriceUpdateModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isDeleteSelectedModalOpen, setIsDeleteSelectedModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>(() => {
    return settings.categoryImages || loadData<Record<string, string>>('pos_category_images', {});
  });
  const [activeCatEdit, setActiveCatEdit] = useState<string>('');
  const [catImageUrlInput, setCatImageUrlInput] = useState<string>('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formError, setFormError] = useState('');

  // Form states
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formSellPrice, setFormSellPrice] = useState('');
  const [formBuyPrice, setFormBuyPrice] = useState('');
  const [formSupplier, setFormSupplier] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active');

  // Quick price update editing states
  const [priceDrafts, setPriceDrafts] = useState<{ [id: string]: number }>({});

  const categories: string[] = Array.from(new Set(products.map((p) => p.category).filter((c): c is string => Boolean(c))));

  const filteredProducts = products.filter((p) => {
    if (selectedCategory && p.category !== selectedCategory) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const isAllFilteredSelected =
    filteredProducts.length > 0 && filteredProducts.every((p) => selectedProductIds.has(p.id));

  const toggleSelectAll = () => {
    if (isAllFilteredSelected) {
      const next = new Set(selectedProductIds);
      filteredProducts.forEach((p) => next.delete(p.id));
      setSelectedProductIds(next);
    } else {
      const next = new Set(selectedProductIds);
      filteredProducts.forEach((p) => next.add(p.id));
      setSelectedProductIds(next);
    }
  };

  const toggleSelectProduct = (id: string) => {
    const next = new Set(selectedProductIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedProductIds(next);
  };

  const confirmDeleteAll = () => {
    if (onDeleteAllProducts) {
      onDeleteAllProducts();
    } else if (onDeleteMultipleProducts) {
      onDeleteMultipleProducts(products.map((p) => p.id));
    } else {
      products.forEach((p) => onDeleteProduct(p.id));
    }
    setSelectedProductIds(new Set());
    setIsDeleteAllModalOpen(false);
  };

  const confirmDeleteSelected = () => {
    const idsToDelete = Array.from(selectedProductIds);
    if (idsToDelete.length === 0) return;
    if (onDeleteMultipleProducts) {
      onDeleteMultipleProducts(idsToDelete);
    } else {
      idsToDelete.forEach((id) => onDeleteProduct(id));
    }
    setSelectedProductIds(new Set());
    setIsDeleteSelectedModalOpen(false);
  };

  const confirmDeleteSingle = () => {
    if (!productToDelete) return;
    onDeleteProduct(productToDelete.id);
    const next = new Set(selectedProductIds);
    next.delete(productToDelete.id);
    setSelectedProductIds(next);
    setProductToDelete(null);
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelUploadStatus('Reading Excel file and syncing to Firebase...');
    setExcelUploadType('success');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rows.length) {
          setExcelUploadType('error');
          setExcelUploadStatus('The uploaded file contains no data rows.');
          return;
        }

        const now = getNowParts();
        const updatedProducts: Product[] = [...products];
        let newCount = 0;
        let updateCount = 0;

        rows.forEach((row) => {
          const getVal = (...keys: string[]): string => {
            for (const k of keys) {
              if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
                return String(row[k]).trim();
              }
            }
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

        if (onImportProducts) {
          await onImportProducts(updatedProducts);
        } else {
          updatedProducts.forEach((p) => onSaveProduct(p));
        }

        setExcelUploadType('success');
        setExcelUploadStatus(`Success! ${newCount} added, ${updateCount} updated. Synced to Firebase and all browsers!`);
        setTimeout(() => setExcelUploadStatus(null), 6000);
      } catch (err: any) {
        setExcelUploadType('error');
        setExcelUploadStatus(`Import failed: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const openAddModal = () => {
    setEditingProduct(null);
    setFormError('');
    setFormName('');
    setFormCategory('');
    setFormBarcode('');
    setFormSku('');
    setFormSellPrice('');
    setFormBuyPrice('');
    setFormSupplier('');
    setFormStatus('active');
    setIsEditModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setFormError('');
    setFormName(p.name);
    setFormCategory(p.category);
    setFormBarcode(p.barcode || '');
    setFormSku(p.sku || '');
    setFormSellPrice(String(p.sellPrice));
    setFormBuyPrice(String(p.buyPrice || 0));
    setFormSupplier(p.supplier || '');
    setFormStatus(p.status);
    setIsEditModalOpen(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formName.trim()) {
      setFormError('Product name is required.');
      return;
    }
    const sellPrice = parseFloat(formSellPrice);
    if (isNaN(sellPrice) || sellPrice < 0) {
      setFormError('Please enter a valid selling price.');
      return;
    }

    const now = getNowParts();
    const productData: Product = {
      id: editingProduct ? editingProduct.id : uid('p'),
      name: formName.trim(),
      category: formCategory.trim() || 'General',
      barcode: formBarcode.trim(),
      sku: formSku.trim(),
      sellPrice: sellPrice,
      buyPrice: parseFloat(formBuyPrice) || 0,
      supplier: formSupplier.trim() || undefined,
      status: formStatus,
      createdDate: editingProduct ? editingProduct.createdDate : now.date,
      updatedDate: now.date
    };

    onSaveProduct(productData);
    setIsEditModalOpen(false);
  };

  const handleQuickPriceSave = (p: Product) => {
    const newPrice = priceDrafts[p.id];
    if (newPrice === undefined || isNaN(newPrice) || newPrice < 0) return;
    const now = getNowParts();
    onSaveProduct({
      ...p,
      sellPrice: newPrice,
      updatedDate: now.date
    });
    const updated = { ...priceDrafts };
    delete updated[p.id];
    setPriceDrafts(updated);
  };

  const handleUpdateCategoryImage = (category: string, imageUrl: string) => {
    const updated = { ...categoryImages };
    if (!imageUrl || !imageUrl.trim()) {
      delete updated[category];
    } else {
      updated[category] = imageUrl.trim();
    }
    setCategoryImages(updated);
    saveData('pos_category_images', updated);
    const updatedSettings = { ...settings, categoryImages: updated };
    if (onSaveSettings) {
      onSaveSettings(updatedSettings);
    } else {
      saveSettingsToFirebase(updatedSettings);
    }
  };

  const handleFileUpload = (category: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        handleUpdateCategoryImage(category, result);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4 text-black">
      {excelUploadStatus && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs font-bold shadow-2xs ${
            excelUploadType === 'success'
              ? 'bg-emerald-50 text-emerald-950 border-emerald-500'
              : 'bg-rose-50 text-rose-800 border-rose-400'
          }`}
        >
          {excelUploadType === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          )}
          <span>{excelUploadStatus}</span>
        </div>
      )}

      {/* Top Toolbar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search product name, barcode, SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-emerald-500 shadow-2xs"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-emerald-500 shadow-2xs"
          >
            <option value="">All Categories ({products.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c} ({products.filter((p) => p.category === c).length})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Delete Selected Button (appears when items are checked) */}
          {selectedProductIds.size > 0 && (
            <button
              type="button"
              onClick={() => setIsDeleteSelectedModalOpen(true)}
              className="px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border-2 border-rose-500 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95 animate-in fade-in duration-200"
              title="Delete checked products"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Delete Selected ({selectedProductIds.size})</span>
            </button>
          )}

          {/* Delete All Products Button */}
          {products.length > 0 && (
            <button
              type="button"
              onClick={() => setIsDeleteAllModalOpen(true)}
              className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border-2 border-rose-300 hover:border-rose-600 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95"
              title="Delete all products from system"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Delete All ({products.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsCategoryModalOpen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95"
            title="Manage Category Images (Add / Remove Images)"
          >
            <ImageIcon className="w-4 h-4 text-amber-600" /> Category Images
          </button>

          <button
            type="button"
            onClick={() => excelFileRef.current?.click()}
            className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-950 border-2 border-emerald-600 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95"
            title="Upload Excel file (.xlsx / .xls) to update prices & add products across all browsers and Firebase"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Upload Excel
          </button>
          <input
            type="file"
            ref={excelFileRef}
            accept=".xlsx,.xls"
            onChange={handleExcelImport}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => setIsPriceUpdateModalOpen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-950 border border-emerald-600 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <DollarSign className="w-4 h-4 text-emerald-600" /> Price Update
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-black border-2 border-emerald-600 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 text-emerald-600" /> Add Product
          </button>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-black font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={isAllFilteredSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
                    title={isAllFilteredSelected ? 'Deselect all' : 'Select all visible'}
                  />
                </th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Barcode / SKU</th>
                <th className="py-3 px-3">Buying Price</th>
                <th className="py-3 px-4 text-emerald-800">Selling Price</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-40 text-emerald-600" />
                    No products found. Click "+ Add Product" to create one.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const isSelected = selectedProductIds.has(p.id);
                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${isSelected ? 'bg-amber-50/60' : 'hover:bg-slate-50'}`}
                    >
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectProduct(p.id)}
                          className="w-4 h-4 rounded text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4 font-bold text-black">
                        {p.name}
                        {p.supplier && (
                          <span className="block text-[10px] text-slate-500 font-normal">Supplier: {p.supplier}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-black font-medium">{p.category}</td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {p.barcode || '—'} {p.sku ? `/ ${p.sku}` : ''}
                      </td>
                      <td className="py-3 px-3 text-slate-600">{formatMoney(p.buyPrice, settings.currency)}</td>
                      <td className="py-3 px-4 font-black text-sm text-emerald-800">
                        {formatMoney(p.sellPrice, settings.currency)}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                            p.status === 'active'
                              ? 'bg-white text-emerald-900 border-emerald-500'
                              : 'bg-white text-slate-700 border-slate-300'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(p)}
                            className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-black border border-slate-300 transition-colors cursor-pointer shadow-2xs"
                            title="Edit Product"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-emerald-600" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setProductToDelete(p)}
                            className="p-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-300 transition-colors cursor-pointer shadow-2xs"
                            title="Delete Product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD / EDIT PRODUCT MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden text-black">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
              <h3 className="font-bold text-black text-base">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-4 space-y-3">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold rounded-xl">
                  {formError}
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Chicken Rice & Curry"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Category *</label>
                  <input
                    type="text"
                    required
                    placeholder="Lunch / Snacks / Beverages"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-emerald-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Selling Price (Rs.) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={formSellPrice}
                    onChange={(e) => setFormSellPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-bold text-emerald-800 focus:outline-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Buying Cost (Rs.)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formBuyPrice}
                    onChange={(e) => setFormBuyPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Barcode</label>
                  <input
                    type="text"
                    placeholder="e.g. 1002"
                    value={formBarcode}
                    onChange={(e) => setFormBarcode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1">SKU / Code</label>
                  <input
                    type="text"
                    placeholder="e.g. LNC-02"
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Supplier / Kitchen</label>
                <input
                  type="text"
                  placeholder="e.g. Kitchen A / Bakery"
                  value={formSupplier}
                  onChange={(e) => setFormSupplier(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-black font-bold text-xs cursor-pointer shadow-2xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-white hover:bg-emerald-50 text-emerald-950 border-2 border-emerald-600 font-extrabold text-xs shadow-2xs cursor-pointer"
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK PRICE UPDATE MODAL */}
      {isPriceUpdateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden text-black">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
              <div>
                <h3 className="font-bold text-black text-base">Quick Price Update</h3>
                <div className="text-xs text-slate-500">Update selling prices instantly.</div>
              </div>
              <button
                onClick={() => setIsPriceUpdateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1 divide-y divide-slate-100">
              {products.map((p) => {
                const currentVal = priceDrafts[p.id] !== undefined ? priceDrafts[p.id] : p.sellPrice;
                const hasChanged = priceDrafts[p.id] !== undefined && priceDrafts[p.id] !== p.sellPrice;
                return (
                  <div key={p.id} className="pt-2 first:pt-0 flex items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="font-bold text-xs text-black">{p.name}</div>
                      <div className="text-[10px] text-slate-500">{p.category} · Cost: {formatMoney(p.buyPrice, settings.currency)}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={currentVal}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setPriceDrafts((prev) => ({ ...prev, [p.id]: val }));
                        }}
                        className={`w-24 px-2 py-1.5 rounded-lg border text-right text-xs font-bold ${
                          hasChanged
                            ? 'border-emerald-600 bg-white text-emerald-950 shadow-2xs'
                            : 'border-slate-300 bg-white text-black'
                        }`}
                      />

                      <button
                        onClick={() => handleQuickPriceSave(p)}
                        disabled={!hasChanged}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-emerald-50 disabled:opacity-30 text-emerald-950 border border-emerald-600 font-extrabold text-xs flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-600" /> Save
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 border-t border-slate-200 flex justify-end bg-white">
              <button
                onClick={() => setIsPriceUpdateModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-black font-bold text-xs cursor-pointer shadow-2xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORY IMAGES MANAGEMENT MODAL */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-black">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-amber-600" />
                <div>
                  <h3 className="font-extrabold text-black text-base">Category Images & Icons (ප්‍රවර්ග පින්තූර)</h3>
                  <div className="text-xs text-slate-500">Upload or link custom images to menu categories.</div>
                </div>
              </div>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1">
              {categories.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  No categories found. Create a product first to generate categories.
                </div>
              ) : (
                categories.map((cat) => {
                  const currentImg = categoryImages[cat];
                  return (
                    <div
                      key={cat}
                      className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-amber-400 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl border border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                          {currentImg ? (
                            <img
                              src={currentImg}
                              alt={cat}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-2xl">🍽️</span>
                          )}
                        </div>
                        <div>
                          <div className="font-black text-sm text-black capitalize">{cat}</div>
                          <div className="text-[11px] text-slate-500 font-medium">
                            {products.filter((p) => p.category === cat).length} Products in category
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* File Upload Button */}
                        <label className="px-3 py-1.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border border-amber-500 text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs active:scale-95 transition-all">
                          <Upload className="w-3.5 h-3.5 text-amber-600" />
                          <span>Upload Image</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(cat, file);
                            }}
                          />
                        </label>

                        {/* URL / Paste Button */}
                        <button
                          type="button"
                          onClick={() => {
                            const url = window.prompt(`Enter image URL for category "${cat}":`, currentImg || '');
                            if (url !== null) {
                              handleUpdateCategoryImage(cat, url);
                            }
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-black border border-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                        >
                          <ImageIcon className="w-3.5 h-3.5 text-slate-600" />
                          <span>Set URL</span>
                        </button>

                        {/* Remove Image Option */}
                        {currentImg && (
                          <button
                            type="button"
                            onClick={() => handleUpdateCategoryImage(cat, '')}
                            className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs transition-colors"
                            title="Remove Category Image"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3.5 border-t border-slate-200 flex justify-between items-center bg-white">
              <span className="text-xs text-slate-500 font-medium">Changes are saved automatically and synchronized to cloud backend.</span>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-xs cursor-pointer shadow-2xs transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE ALL PRODUCTS CONFIRMATION MODAL */}
      {isDeleteAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden text-black animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-rose-50/50">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-black text-base text-rose-950">Delete All Products?</h3>
                <p className="text-xs text-rose-800/80 font-medium">සියලුම භාණ්ඩ ඉවත් කිරීම (Wipe All Products)</p>
              </div>
              <button
                type="button"
                onClick={() => setIsDeleteAllModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-black hover:bg-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <div className="p-3.5 rounded-2xl bg-rose-50/80 border border-rose-200 text-xs text-rose-950 space-y-1.5">
                <div className="font-black flex items-center gap-1.5 text-rose-900">
                  <span>⚠️ Permanent Action</span>
                </div>
                <div className="leading-relaxed">
                  You are about to permanently delete <strong>all {products.length} products</strong> from your inventory catalog.
                </div>
                <div className="text-[11px] text-rose-800 font-medium pt-1 border-t border-rose-200/60">
                  This will remove all items from local memory and synchronize the wipe to the database. Previous sales receipts and invoices will remain intact.
                </div>
              </div>

              <div className="text-xs text-slate-600 font-medium">
                Are you sure you want to proceed with deleting all <strong>{products.length} products</strong>?
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2.5 bg-slate-50">
              <button
                type="button"
                onClick={() => setIsDeleteAllModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-black font-bold text-xs cursor-pointer shadow-2xs transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteAll}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>Yes, Delete All ({products.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE SELECTED PRODUCTS MODAL */}
      {isDeleteSelectedModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden text-black animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-rose-50/50">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-black text-base text-rose-950">Delete Selected Products?</h3>
                <p className="text-xs text-rose-800/80 font-medium">තෝරාගත් භාණ්ඩ {selectedProductIds.size}ක් ඉවත් කිරීම</p>
              </div>
              <button
                type="button"
                onClick={() => setIsDeleteSelectedModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-black hover:bg-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                Are you sure you want to delete the <strong>{selectedProductIds.size} selected products</strong>? They will be removed from your catalog and database.
              </p>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 p-1 text-xs">
                {products
                  .filter((p) => selectedProductIds.has(p.id))
                  .map((p) => (
                    <div key={p.id} className="py-1.5 px-2 flex items-center justify-between text-slate-800">
                      <span className="font-bold truncate">{p.name}</span>
                      <span className="text-slate-500 shrink-0 font-mono ml-2">
                        {formatMoney(p.sellPrice, settings.currency)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2.5 bg-slate-50">
              <button
                type="button"
                onClick={() => setIsDeleteSelectedModalOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-black font-bold text-xs cursor-pointer shadow-2xs transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteSelected}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete {selectedProductIds.size} Products</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE SINGLE PRODUCT MODAL */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden text-black animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-rose-50/40">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-black text-base text-rose-950">Delete Product?</h3>
                <p className="text-xs text-rose-800/80 font-medium">භාණ්ඩය ඉවත් කිරීම තහවුරු කරන්න</p>
              </div>
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-black hover:bg-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="font-black text-sm text-black">{productToDelete.name}</div>
                <div className="text-xs text-slate-500">
                  Category: <span className="font-medium text-slate-700">{productToDelete.category}</span>
                </div>
                <div className="text-xs text-slate-500">
                  Selling Price:{' '}
                  <span className="font-bold text-emerald-800">
                    {formatMoney(productToDelete.sellPrice, settings.currency)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-600 font-medium">
                Are you sure you want to delete this product? It will be removed from your catalog.
              </p>
            </div>

            <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2.5 bg-slate-50">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-black font-bold text-xs cursor-pointer shadow-2xs transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteSingle}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
