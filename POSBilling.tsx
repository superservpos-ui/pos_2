import React, { useState, useEffect } from 'react';
import { Product, CartItem, Sale, PaymentMethod, AuthSession, Register, CompanySettings, TokenOrder } from '../types/pos';
import { formatMoney, getNowParts, loadData, saveData, uid } from '../services/storage';
import { soundService } from '../services/sound';
import { generateCode128Svg } from '../services/barcode';
import { directPrintService } from '../services/directPrintService';
import {
  Search,
  Trash2,
  CreditCard,
  Banknote,
  FileText,
  Split,
  X,
  Scan,
  ShoppingBag,
  Sparkles,
  Star,
  GripHorizontal,
  PlusCircle,
  Ticket,
  Printer
} from 'lucide-react';

interface POSBillingProps {
  products: Product[];
  departments: string[];
  session: AuthSession | null;
  activeRegister: Register | null;
  settings: CompanySettings;
  invoiceCounter: number;
  tokens?: TokenOrder[];
  onSaleCompleted?: (sale: Sale) => void;
  onCompleteSale?: (sale: Sale) => void;
  onRecordSaleOnly?: (sale: Sale) => void;
  onSaveToken?: (token: TokenOrder) => void;
  onSaveTokens?: (tokens: TokenOrder[]) => void;
  onOpenCashManagement?: () => void;
  onOpenCloseSale?: () => void;
}

const CASH_DENOMS = [10, 20, 50, 100, 500, 1000, 2000, 5000];

const getCategoryIcon = (catName: string): string => {
  const c = (catName || '').toLowerCase();
  if (c.includes('rice') || c.includes('biryani') || c.includes('bath') || c.includes('meal')) return '🍛';
  if (c.includes('short') || c.includes('eat') || c.includes('roll') || c.includes('patty') || c.includes('samosa') || c.includes('roti') || c.includes('snack')) return '🥟';
  if (c.includes('tea') || c.includes('coffee') || c.includes('drink') || c.includes('beverage') || c.includes('juice')) return '☕';
  if (c.includes('bake') || c.includes('bread') || c.includes('pastry') || c.includes('cake') || c.includes('bun')) return '🥐';
  if (c.includes('kottu') || c.includes('noodle') || c.includes('pasta')) return '🍲';
  if (c.includes('dessert') || c.includes('ice') || c.includes('sweet') || c.includes('pudding')) return '🍨';
  if (c.includes('burger') || c.includes('sandwich')) return '🍔';
  if (c.includes('curry') || c.includes('gravy') || c.includes('soup')) return '🥘';
  return '🍽️';
};

export const POSBilling: React.FC<POSBillingProps> = ({
  products,
  departments,
  session,
  activeRegister,
  settings,
  invoiceCounter,
  tokens,
  onSaleCompleted,
  onCompleteSale,
  onRecordSaleOnly,
  onSaveToken,
  onSaveTokens,
  onOpenCashManagement,
  onOpenCloseSale
}) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  // Custom Box items (list of product IDs pinned into custom box)
  const [customProductIds, setCustomProductIds] = useState<string[]>(() =>
    loadData('pos_custom_product_ids', [])
  );
  useEffect(() => {
    saveData('pos_custom_product_ids', customProductIds);
  }, [customProductIds]);

  // Category Ordering with Drag & Drop
  const rawCategories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));
  const [orderedCategories, setOrderedCategories] = useState<string[]>(() => {
    const saved = loadData<string[]>('pos_category_order', []);
    const merged = Array.from(new Set([...saved, ...rawCategories]));
    return merged.filter((c) => rawCategories.includes(c));
  });

  useEffect(() => {
    setOrderedCategories((prev) => {
      const merged = Array.from(new Set([...prev, ...rawCategories]));
      return merged.filter((c) => rawCategories.includes(c));
    });
  }, [products]);

  useEffect(() => {
    saveData('pos_category_order', orderedCategories);
  }, [orderedCategories]);

  const [draggedCategoryIndex, setDraggedCategoryIndex] = useState<number | null>(null);

  // Custom item creation modal
  const [isCustomModalOpen, setIsCustomModalOpen] = useState<boolean>(false);
  const [customName, setCustomName] = useState<string>('');
  const [customPrice, setCustomPrice] = useState<string>('');
  const [customQty, setCustomQty] = useState<number>(1);
  const [customCategory, setCustomCategory] = useState<string>('Custom');

  // Token Modal from Cart (with Bulk 20, 100 tokens support)
  const [isTokenModalOpen, setIsTokenModalOpen] = useState<boolean>(false);
  const [tokenQuantity, setTokenQuantity] = useState<number>(1);
  const [tokenPrintMode, setTokenPrintMode] = useState<'INDIVIDUAL' | 'MASTER'>('INDIVIDUAL');
  const [tokenCustomerName, setTokenCustomerName] = useState<string>('');
  const [tokenCustomerPhone, setTokenCustomerPhone] = useState<string>('');
  const [tokenMealType, setTokenMealType] = useState<'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks'>('Lunch');
  const [tokenPayStatus, setTokenPayStatus] = useState<'PAID' | 'UNPAID'>('PAID');
  const [tokenPayMethod, setTokenPayMethod] = useState<'CASH' | 'CARD' | 'CREDIT'>('CASH');

  // Payment modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');

  // Cash payment fields
  const [cashReceived, setCashReceived] = useState<number>(0);

  // Card payment fields
  const [cardAmount, setCardAmount] = useState<number>(0);
  const [cardRef, setCardRef] = useState<string>('');
  const [cardType, setCardType] = useState<string>('');

  // Mixed cash+card fields
  const [mixCash, setMixCash] = useState<number>(0);
  const [mixCard, setMixCard] = useState<number>(0);
  const [checkoutError, setCheckoutError] = useState<string>('');
  const [cartNotice, setCartNotice] = useState<string>('');

  // Credit payment fields
  const [creditDept, setCreditDept] = useState<string>('');
  const [creditDueDate, setCreditDueDate] = useState<string>('');
  const [creditNote, setCreditNote] = useState<string>('');

  // Custom Box items resolution
  const customBoxProducts = products.filter((p) => customProductIds.includes(p.id));

  // Product Filtering
  const filteredProducts = products.filter((p) => {
    if (p.status !== 'active') return false;
    if (selectedCategory === '__CUSTOM__') {
      if (!customProductIds.includes(p.id)) return false;
    } else if (selectedCategory && p.category !== selectedCategory) {
      return false;
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Toggle item in Custom Box
  const toggleCustomItem = (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomProductIds((prev) => {
      if (prev.includes(productId)) {
        return prev.filter((id) => id !== productId);
      } else {
        return [...prev, productId];
      }
    });
  };

  // Remove individual item from Custom Box
  const removeCustomItem = (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCustomProductIds((prev) => prev.filter((id) => id !== productId));
  };

  // Drag and Drop handlers for categories
  const handleDragStart = (index: number) => {
    setDraggedCategoryIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetIndex: number) => {
    if (draggedCategoryIndex === null || draggedCategoryIndex === targetIndex) return;
    const reordered = [...orderedCategories];
    const [moved] = reordered.splice(draggedCategoryIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    setOrderedCategories(reordered);
    setDraggedCategoryIndex(null);
  };

  const addToCart = (product: Product, qty: number = 1) => {
    setIsCartOpen(true);
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.productId === product.id);
      if (existing) {
        return prevCart.map((item) =>
          item.productId === product.id ? { ...item, qty: item.qty + qty } : item
        );
      } else {
        return [
          ...prevCart,
          {
            productId: product.id,
            name: product.name,
            price: product.sellPrice,
            buyPrice: product.buyPrice,
            qty: qty,
            category: product.category
          }
        ];
      }
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prevCart) => {
      return prevCart
        .map((item) => {
          if (item.productId === productId) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.productId !== productId));
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    setCart([]);
    setDiscountAmount(0);
    setCartNotice('Cart cleared.');
    setTimeout(() => setCartNotice(''), 3000);
  };

  const handleBarcodeSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = barcodeInput.trim();
      if (!code) return;

      // Check if scanned code is a Token Voucher Barcode
      if (tokens && tokens.length > 0) {
        const foundToken = tokens.find(
          (t) =>
            t.tokenCode.toLowerCase() === code.toLowerCase() ||
            t.id === code ||
            (code.startsWith('TKN-') && t.tokenCode.toLowerCase().includes(code.toLowerCase()))
        );

        if (foundToken) {
          if (foundToken.status === 'COMPLETED') {
            soundService.playWarningBuzz();
            setCartNotice(`⚠️ TOKEN #${foundToken.tokenNumber} ALREADY CLAIMED at ${foundToken.completedAt || 'earlier'}!`);
          } else {
            soundService.playSuccessBeep();
            const now = getNowParts();
            const updatedToken: TokenOrder = {
              ...foundToken,
              status: 'COMPLETED',
              completedAt: `${now.date} ${now.time}`
            };
            if (onSaveToken) onSaveToken(updatedToken);
            setCartNotice(`✓ TOKEN #${foundToken.tokenNumber} AUTO-VERIFIED & COMPLETED! (${foundToken.customerName || 'Meal Dispensed'})`);
          }
          setBarcodeInput('');
          setTimeout(() => setCartNotice(''), 5000);
          return;
        }
      }

      const found = products.find((p) => p.barcode === code || p.sku === code);
      if (found) {
        addToCart(found);
        setBarcodeInput('');
        setCartNotice(`Added: ${found.name}`);
        setTimeout(() => setCartNotice(''), 2500);
      } else {
        setCartNotice(`No product or token found for barcode: ${code}`);
        setTimeout(() => setCartNotice(''), 4000);
      }
    }
  };

  const handleAddCustomItem = () => {
    if (!customName.trim()) return;
    const price = parseFloat(customPrice) || 0;
    const customItem: CartItem = {
      productId: `custom_${Date.now()}`,
      name: customName.trim(),
      price: price,
      buyPrice: 0,
      qty: Math.max(1, customQty),
      custom: true,
      category: customCategory.trim() || 'Custom'
    };
    setCart((prev) => [...prev, customItem]);
    setCustomName('');
    setCustomPrice('');
    setCustomQty(1);
    setIsCustomModalOpen(false);
  };

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discount = Math.min(subtotal, Math.max(0, discountAmount));
  const grandTotal = Math.max(0, subtotal - discount);

  const openPaymentModal = () => {
    if (cart.length === 0) {
      setCartNotice('Cart is empty. Add products to proceed to checkout.');
      setTimeout(() => setCartNotice(''), 3500);
      return;
    }
    setCheckoutError('');
    setPaymentMethod('CASH');
    setCashReceived(0);
    setCardAmount(grandTotal);
    setMixCash(Math.round(grandTotal / 2));
    setMixCard(Math.max(0, grandTotal - Math.round(grandTotal / 2)));
    setCreditDept(departments[0] || '');
    setCreditDueDate('');
    setCreditNote('');
    setIsPaymentModalOpen(true);
  };

  const handleCompleteSale = () => {
    const now = getNowParts();
    const unitCode = session?.unitCode || 'UC01';
    const prefix = unitCode ? `${unitCode.toUpperCase()}-` : 'INV-';
    const invoiceNumber = `${prefix}${String(invoiceCounter).padStart(6, '0')}`;

    if (paymentMethod === 'CASH' && cashReceived < grandTotal) {
      setCheckoutError(`Customer cash given (Rs. ${cashReceived.toFixed(2)}) is less than total payable (Rs. ${grandTotal.toFixed(2)}).`);
      return;
    }

    if (paymentMethod === 'CARD' && cardAmount < grandTotal) {
      setCheckoutError('Card payment amount is less than total payable.');
      return;
    }

    if (paymentMethod === 'CASH+CARD' && mixCash + mixCard < grandTotal) {
      setCheckoutError('Cash + Card portions combined must cover the full sale total.');
      return;
    }

    // Credit department is optional (user request)

    const sale: Sale = {
      invoiceNumber: invoiceNumber,
      date: now.date,
      time: now.time,
      cashier: session?.user || 'Cashier',
      unitCode: unitCode,
      unitName: session?.unitName || settings.name || session?.unitCode || 'Counter',
      registerId: activeRegister ? activeRegister.id : null,
      items: [...cart],
      subtotal: subtotal,
      discount: discount,
      taxPct: 0,
      tax: 0,
      grandTotal: grandTotal,
      paymentMethod: paymentMethod,
      cashReceived: paymentMethod === 'CASH' ? cashReceived : paymentMethod === 'CASH+CARD' ? mixCash : 0,
      cashAmount: paymentMethod === 'CASH' ? grandTotal : paymentMethod === 'CASH+CARD' ? mixCash : 0,
      cardAmount: paymentMethod === 'CARD' ? grandTotal : paymentMethod === 'CASH+CARD' ? mixCard : 0,
      balance: paymentMethod === 'CASH' ? cashReceived - grandTotal : 0,
      change: paymentMethod === 'CASH' ? Math.max(0, cashReceived - grandTotal) : 0,
      cardReference: cardRef.trim() || undefined,
      cardType: cardType.trim() || undefined,
      creditAmount: paymentMethod === 'CREDIT' ? grandTotal : 0,
      creditDueDate: creditDueDate || undefined,
      creditStatus: paymentMethod === 'CREDIT' ? 'UNPAID' : undefined,
      department: paymentMethod === 'CREDIT' ? (creditDept || undefined) : undefined,
      customerNote: creditNote.trim() || undefined
    };

    if (onCompleteSale) {
      onCompleteSale(sale);
    } else if (onSaleCompleted) {
      onSaleCompleted(sale);
    }
    setCart([]);
    setDiscountAmount(0);
    setCheckoutError('');
    setIsPaymentModalOpen(false);
  };

  // Direct Print Single Token Slip
  const directPrintTokenSlip = (t: TokenOrder) => {
    // ESC/POS Direct hardware print if available
    if (settings.directPrinter && settings.directPrinter.driver && settings.directPrinter.driver !== 'BROWSER') {
      directPrintService.printToken(t, settings).catch(() => {});
    }

    let iframe = document.getElementById('token-print-frame') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'token-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) return;

    doc.open();
    const is58 = settings?.printerPaperSize === '58mm' || settings?.receiptSize === '58';
    const containerWidth = is58 ? '48mm' : '72mm';
    const bodyFontSize = is58 ? '10px' : '11px';

    doc.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Token #${t.tokenNumber}</title>
        <style>
          @page { size: auto; margin: 0mm !important; }
          * { box-sizing: border-box !important; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", Courier, monospace, sans-serif;
            width: ${containerWidth};
            max-width: ${containerWidth};
            margin: 0 auto;
            padding: 2mm 1mm;
            color: #000000;
            background: #ffffff;
            text-align: center;
            font-size: ${bodyFontSize};
            font-weight: 600;
            line-height: 1.25;
          }
          .title { font-size: ${is58 ? '12px' : '14px'}; font-weight: 900; text-transform: uppercase; margin-bottom: 2px; }
          .sub { font-size: 9.5px; font-weight: 800; letter-spacing: 0.5px; margin-bottom: 4px; }
          .token-box {
            border: 2px dashed #000000;
            padding: 4px 2px;
            margin: 4px 0;
          }
          .token-lbl { font-size: 9px; font-weight: 900; letter-spacing: 1px; }
          .token-num { font-size: ${is58 ? '26px' : '32px'}; font-weight: 900; line-height: 1.1; }
          .meal-tag { font-size: 10.5px; font-weight: 800; margin-top: 2px; }
          .barcode-box { text-align: center; margin: 3px 0 2px 0; }
          .code-text { font-size: 10px; font-family: monospace; font-weight: 900; }
          .items-table { width: 100% !important; text-align: left; font-size: ${bodyFontSize}; border-collapse: collapse; margin: 4px 0; }
          .items-table th { border-bottom: 1px dashed #000000; padding: 2px 0; font-weight: 900; }
          .items-table td { padding: 2px 0; vertical-align: top; }
          .total-box { font-size: 12px; font-weight: 900; border-top: 1px dashed #000000; padding-top: 3px; margin-top: 3px; display: flex; justify-content: space-between; }
          .status-badge {
            font-size: 10.5px;
            font-weight: 900;
            margin-top: 4px;
            padding: 2px;
            border: 1px solid #000000;
            text-align: center;
          }
          .footer { font-size: 8.5px; margin-top: 5px; border-top: 1px dotted #888888; padding-top: 3px; line-height: 1.2; }
        </style>
      </head>
      <body>
        <div class="title">${settings.name || 'HOTEL & RESTAURANT'}</div>
        <div class="sub">FOOD PRE-ORDER TOKEN SLIP</div>
        
        <div class="token-box">
          <div class="token-lbl">TOKEN NUMBER</div>
          <div class="token-num">#${String(t.tokenNumber).padStart(3, '0')}</div>
          <div class="meal-tag">${t.customerName ? t.customerName : t.date}</div>
        </div>

        <div class="barcode-box">
          ${generateCode128Svg(t.tokenCode, 30)}
          <div class="code-text">${t.tokenCode}</div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 55%;">Item</th>
              <th style="width: 20%; text-align: center;">Qty</th>
              <th style="width: 25%; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${t.items.map((it) => `
              <tr>
                <td style="word-break: break-word;">${it.name}</td>
                <td style="text-align: center;">${it.qty}</td>
                <td style="text-align: right; font-weight: 900;">${formatMoney(it.price * it.qty, settings.currency)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-box">
          <span>TOTAL:</span>
          <span>${formatMoney(t.totalAmount, settings.currency)}</span>
        </div>

        <div class="status-badge">
          ${t.paymentStatus === 'PAID' ? '✓ PAID IN ADVANCE' : '⚠ PAY ON COLLECTION'}
        </div>

        <div class="footer">
          <div>Hand over this token slip at the food counter to claim your meal.</div>
          <div>${t.date} ${t.time} | Counter: ${t.unitCode}</div>
        </div>
      </body>
      </html>
    `);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
    }, 200);
  };

  // Direct Print Multi Individual Token Slips
  const directPrintMultiTokenSlips = (tokensList: TokenOrder[]) => {
    if (!tokensList || tokensList.length === 0) return;

    // ESC/POS Direct hardware print if available
    if (settings.directPrinter && settings.directPrinter.driver && settings.directPrinter.driver !== 'BROWSER') {
      directPrintService.printMultiTokens(tokensList, settings).catch(() => {});
    }

    const printId = 'direct_thermal_iframe_batch';
    let iframe = document.getElementById(printId) as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = printId;
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) return;

    const is58 = settings?.printerPaperSize === '58mm' || settings?.receiptSize === '58';
    const containerWidth = is58 ? '48mm' : '72mm';
    const bodyFontSize = is58 ? '10px' : '11px';

    const slipsHtml = tokensList.map((t, idx) => `
      <div class="slip-page ${idx < tokensList.length - 1 ? 'page-break' : ''}">
        <div class="title">${settings.name || 'HOTEL & RESTAURANT'}</div>
        <div class="sub">FOOD PRE-ORDER TOKEN SLIP</div>
        
        <div class="token-box">
          <div class="token-lbl">TOKEN NUMBER</div>
          <div class="token-num">#${String(t.tokenNumber).padStart(3, '0')}</div>
          <div class="meal-tag">${t.customerName ? t.customerName : t.date} ${t.batchCount && t.batchCount > 1 ? `(${t.batchIndex || idx + 1}/${t.batchCount})` : ''}</div>
        </div>

        <div class="barcode-box">
          ${generateCode128Svg(t.tokenCode, 30)}
          <div class="code-text">${t.tokenCode}</div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 55%;">Item</th>
              <th style="width: 20%; text-align: center;">Qty</th>
              <th style="width: 25%; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${t.items.map((it) => `
              <tr>
                <td style="word-break: break-word;">${it.name}</td>
                <td style="text-align: center;">${it.qty}</td>
                <td style="text-align: right; font-weight: 900;">${formatMoney(it.price * it.qty, settings.currency)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-box">
          <span>TOTAL:</span>
          <span>${formatMoney(t.totalAmount, settings.currency)}</span>
        </div>

        <div class="status-badge">
          ${t.paymentStatus === 'PAID' ? '✓ PAID IN ADVANCE' : '⚠ PAY ON COLLECTION'}
        </div>

        <div class="footer">
          <div>Hand over this token slip at the food counter to claim your meal.</div>
          <div>${t.date} ${t.time} | Counter: ${t.unitCode}</div>
        </div>
      </div>
    `).join('');

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Batch Token Slips</title>
        <style>
          @page { size: auto; margin: 0mm !important; }
          * { box-sizing: border-box !important; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", Courier, monospace, sans-serif;
            width: ${containerWidth};
            max-width: ${containerWidth};
            margin: 0 auto;
            padding: 2mm 1mm;
            color: #000000;
            background: #ffffff;
            font-size: ${bodyFontSize};
            font-weight: 600;
            line-height: 1.25;
          }
          @media print {
            .slip-page {
              page-break-after: always !important;
              break-after: page !important;
            }
            .slip-page:last-child {
              page-break-after: auto !important;
              break-after: auto !important;
            }
          }
          .slip-page {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            padding: 4px 2px 8px 2px;
            border-bottom: 2px dashed #000000;
            margin-bottom: 8px;
            text-align: center;
          }
          .title { font-size: ${is58 ? '12px' : '13px'}; font-weight: 900; text-align: center; text-transform: uppercase; }
          .sub { font-size: 9px; text-align: center; margin-bottom: 4px; }
          .token-box {
            border: 2px solid #000000;
            border-radius: 4px;
            padding: 4px;
            text-align: center;
            margin: 4px 0;
          }
          .token-lbl { font-size: 9px; font-weight: 900; letter-spacing: 0.5px; }
          .token-num { font-size: ${is58 ? '22px' : '26px'}; font-weight: 900; line-height: 1; }
          .meal-tag { font-size: 10px; font-weight: 900; margin-top: 2px; }
          .barcode-box { text-align: center; margin: 4px 0; }
          .code-text { font-size: 8.5px; font-weight: 900; margin-top: 2px; font-family: monospace; }
          .items-table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 9.5px; text-align: left; }
          .items-table th { border-bottom: 1px solid #000; padding: 2px 0; text-align: left; font-weight: 900; }
          .items-table td { padding: 2px 0; }
          .total-box {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            font-weight: 900;
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            padding: 3px 0;
            margin: 4px 0;
          }
          .status-badge {
            text-align: center;
            font-weight: 900;
            font-size: 9.5px;
            padding: 2px;
            border: 1px solid #000;
            margin: 4px 0;
          }
          .footer { font-size: 8.5px; margin-top: 5px; border-top: 1px dotted #888888; padding-top: 3px; line-height: 1.2; text-align: center; }
        </style>
      </head>
      <body>
        ${slipsHtml}
      </body>
      </html>
    `);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
    }, 200);
  };

  // Direct Print 1 Master Batch Voucher
  const directPrintMasterVoucher = (masterToken: TokenOrder, count: number, startNum: number, endNum: number) => {
    // ESC/POS Direct hardware print if available
    if (settings.directPrinter && settings.directPrinter.driver && settings.directPrinter.driver !== 'BROWSER') {
      directPrintService.printMasterToken(masterToken, count, startNum, endNum, settings).catch(() => {});
    }

    const printId = 'direct_thermal_iframe_master';
    let iframe = document.getElementById(printId) as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = printId;
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) return;

    const is58 = settings?.printerPaperSize === '58mm' || settings?.receiptSize === '58';
    const containerWidth = is58 ? '48mm' : '72mm';
    const bodyFontSize = is58 ? '10px' : '11px';

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Master Batch Token Voucher #${startNum}-${endNum}</title>
        <style>
          @page { size: auto; margin: 0mm !important; }
          * { box-sizing: border-box !important; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", Courier, monospace, sans-serif;
            width: ${containerWidth};
            max-width: ${containerWidth};
            margin: 0 auto;
            padding: 2mm 1mm;
            color: #000000;
            background: #ffffff;
            font-size: ${bodyFontSize};
            font-weight: 600;
            line-height: 1.25;
            text-align: center;
          }
          .title { font-size: ${is58 ? '12px' : '14px'}; font-weight: 900; text-align: center; text-transform: uppercase; margin-bottom: 2px; }
          .sub { font-size: 9.5px; font-weight: 800; text-align: center; margin-bottom: 4px; }
          .token-box {
            border: 2px solid #000000;
            border-radius: 4px;
            padding: 6px 4px;
            text-align: center;
            margin: 4px 0;
          }
          .token-lbl { font-size: 10px; font-weight: 900; letter-spacing: 0.5px; }
          .token-num { font-size: ${is58 ? '18px' : '22px'}; font-weight: 900; line-height: 1.1; margin: 2px 0; }
          .batch-pill {
            display: inline-block;
            font-size: 11px;
            font-weight: 900;
            background: #000000;
            color: #ffffff;
            padding: 2px 8px;
            border-radius: 3px;
            margin: 2px 0;
          }
          .meal-tag { font-size: 10.5px; font-weight: 900; margin-top: 2px; }
          .barcode-box { text-align: center; margin: 4px 0; }
          .code-text { font-size: 9px; font-weight: 900; margin-top: 2px; font-family: monospace; }
          .items-table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 9.5px; text-align: left; }
          .items-table th { border-bottom: 1px solid #000; padding: 2px 0; text-align: left; font-weight: 900; }
          .items-table td { padding: 2px 0; }
          .total-box {
            display: flex;
            justify-content: space-between;
            font-size: 12.5px;
            font-weight: 900;
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            padding: 4px 0;
            margin: 4px 0;
          }
          .status-badge {
            text-align: center;
            font-weight: 900;
            font-size: 10px;
            padding: 3px;
            border: 1px solid #000;
            margin: 4px 0;
          }
          .footer { font-size: 8.5px; margin-top: 5px; border-top: 1px dotted #888888; padding-top: 3px; line-height: 1.2; text-align: center; }
        </style>
      </head>
      <body>
        <div class="title">${settings.name || 'HOTEL & RESTAURANT'}</div>
        <div class="sub">BULK PRE-ORDER MASTER VOUCHER</div>
        
        <div class="token-box">
          <div class="batch-pill">${count} TOKENS BATCH</div>
          <div class="token-lbl">TOKEN RANGE</div>
          <div class="token-num">#${String(startNum).padStart(3, '0')} - #${String(endNum).padStart(3, '0')}</div>
          <div class="meal-tag">${masterToken.customerName ? masterToken.customerName : masterToken.date}</div>
        </div>

        <div class="barcode-box">
          ${generateCode128Svg(masterToken.tokenCode, 32)}
          <div class="code-text">${masterToken.tokenCode}</div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 45%;">Item / Meal</th>
              <th style="width: 25%; text-align: center;">Per Token</th>
              <th style="width: 30%; text-align: right;">Total Qty</th>
            </tr>
          </thead>
          <tbody>
            ${masterToken.items.map((it) => `
              <tr>
                <td style="word-break: break-word;">${it.name}</td>
                <td style="text-align: center;">${it.qty} x ${formatMoney(it.price, settings.currency)}</td>
                <td style="text-align: right; font-weight: 900;">${it.qty * count} Portions</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-box">
          <span>GRAND TOTAL (${count} TOKENS):</span>
          <span>${formatMoney(masterToken.totalAmount, settings.currency)}</span>
        </div>

        <div class="status-badge">
          ${masterToken.paymentStatus === 'PAID' ? '✓ FULLY PAID IN ADVANCE' : '⚠ PAY ON COLLECTION'}
        </div>

        <div class="footer">
          <div>Hand over this voucher or claim at the counter for ${count} meals (#${startNum} - #${endNum}).</div>
          <div>${masterToken.date} ${masterToken.time} | Counter: ${masterToken.unitCode}</div>
        </div>
      </body>
      </html>
    `);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
    }, 200);
  };

  // Convert current cart to Food Pre-Order Token (Supports Bulk 20, 100 tokens)
  const handleIssueTokenFromCart = () => {
    if (cart.length === 0) {
      alert('Cart is empty. Add food items to issue a pre-order token.');
      return;
    }
    const count = Math.max(1, parseInt(String(tokenQuantity), 10) || 1);
    const now = getNowParts();
    const todayTokens = (tokens || []).filter((t) => (t.businessDate || t.date) === now.date);
    const currentMax = todayTokens.reduce((max, t) => Math.max(max, t.tokenNumber), 0);
    const startNum = currentMax + 1;
    const endNum = currentMax + count;
    const dateNum = now.date.replace(/-/g, '');

    if (count === 1) {
      // Single token order
      const code = `TKN-${dateNum}-${String(startNum).padStart(3, '0')}`;
      const singleToken: TokenOrder = {
        id: uid('tkn'),
        tokenNumber: startNum,
        tokenCode: code,
        date: now.date,
        businessDate: now.date,
        time: now.time,
        cashier: session?.user || 'Cashier',
        unitCode: session?.unitCode || 'UNIT01',
        unitName: session?.unitName || session?.unitCode || 'Counter',
        items: cart.map((item) => ({
          name: item.name,
          qty: item.qty,
          price: item.price,
          productId: item.productId
        })),
        totalAmount: grandTotal,
        grandTotal: grandTotal,
        paymentStatus: tokenPayStatus,
        paymentMethod: tokenPayMethod,
        customerName: tokenCustomerName.trim() || `${tokenMealType} Pre-order`,
        customerPhone: tokenCustomerPhone.trim() || undefined,
        status: 'PENDING',
        createdAt: `${now.date} ${now.time}`
      };

      if (onSaveToken) onSaveToken(singleToken);
      else if (onSaveTokens) onSaveTokens([singleToken]);

      directPrintTokenSlip(singleToken);
    } else if (tokenPrintMode === 'MASTER') {
      // 1 MASTER VOUCHER ONLY - Exactly 1 complete consolidated token order record
      const masterCode = `BATCH-${dateNum}-${String(startNum).padStart(3, '0')}-${String(endNum).padStart(3, '0')}`;
      const masterToken: TokenOrder = {
        id: uid('tkn_master'),
        tokenNumber: startNum,
        tokenCode: masterCode,
        date: now.date,
        businessDate: now.date,
        time: now.time,
        cashier: session?.user || 'Cashier',
        unitCode: session?.unitCode || 'UNIT01',
        unitName: session?.unitName || session?.unitCode || 'Counter',
        items: cart.map((item) => ({
          name: item.name,
          qty: item.qty,
          price: item.price,
          productId: item.productId
        })),
        totalAmount: grandTotal * count,
        grandTotal: grandTotal * count,
        paymentStatus: tokenPayStatus,
        paymentMethod: tokenPayMethod,
        customerName: tokenCustomerName.trim() || `${count}x ${tokenMealType} Master Voucher`,
        customerPhone: tokenCustomerPhone.trim() || undefined,
        status: 'PENDING',
        createdAt: `${now.date} ${now.time}`,
        isBatchMaster: true,
        batchCount: count,
        batchRange: `#${String(startNum).padStart(3, '0')} - #${String(endNum).padStart(3, '0')}`
      };

      if (onSaveToken) onSaveToken(masterToken);
      else if (onSaveTokens) onSaveTokens([masterToken]);

      directPrintMasterVoucher(masterToken, count, startNum, endNum);
    } else {
      // INDIVIDUAL TOKENS - Generate N separate individual token records
      const generatedTokens: TokenOrder[] = [];
      const batchMasterId = uid('batch');
      for (let i = 0; i < count; i++) {
        const num = startNum + i;
        const code = `TKN-${dateNum}-${String(num).padStart(3, '0')}`;
        const tkn: TokenOrder = {
          id: uid('tkn'),
          tokenNumber: num,
          tokenCode: code,
          date: now.date,
          businessDate: now.date,
          time: now.time,
          cashier: session?.user || 'Cashier',
          unitCode: session?.unitCode || 'UNIT01',
          unitName: session?.unitName || session?.unitCode || 'Counter',
          items: cart.map((item) => ({
            name: item.name,
            qty: item.qty,
            price: item.price,
            productId: item.productId
          })),
          totalAmount: grandTotal,
          grandTotal: grandTotal,
          paymentStatus: tokenPayStatus,
          paymentMethod: tokenPayMethod,
          customerName: tokenCustomerName.trim() || `${tokenMealType} Pre-order`,
          customerPhone: tokenCustomerPhone.trim() || undefined,
          status: 'PENDING',
          createdAt: `${now.date} ${now.time}`,
          batchCount: count,
          batchRange: `#${String(startNum).padStart(3, '0')} - #${String(endNum).padStart(3, '0')}`,
          batchMasterId: batchMasterId,
          batchIndex: i + 1
        };
        generatedTokens.push(tkn);
      }

      if (onSaveTokens) {
        onSaveTokens(generatedTokens);
      } else if (onSaveToken) {
        generatedTokens.forEach((t) => onSaveToken(t));
      }

      directPrintMultiTokenSlips(generatedTokens);
    }

    // If paid, register consolidated sale silently without opening receipt modal
    const totalPayableAmount = grandTotal * count;
    if (tokenPayStatus === 'PAID') {
      const unitCode = session?.unitCode || 'UC01';
      const prefix = unitCode ? `${unitCode.toUpperCase()}-` : 'INV-';
      const invoiceNumber = `${prefix}${String(invoiceCounter).padStart(6, '0')}`;
      const tokenSale: Sale = {
        invoiceNumber: invoiceNumber,
        date: now.date,
        time: now.time,
        cashier: session?.user || 'Cashier',
        unitCode: unitCode,
        unitName: session?.unitName || session?.unitCode || 'Counter',
        registerId: activeRegister ? activeRegister.id : null,
        items: cart.map((c) => ({
          ...c,
          qty: c.qty * count
        })),
        subtotal: subtotal * count,
        discount: discount * count,
        taxPct: 0,
        tax: 0,
        grandTotal: totalPayableAmount,
        paymentMethod: tokenPayMethod as PaymentMethod,
        cashReceived: totalPayableAmount,
        cashAmount: tokenPayMethod === 'CASH' ? totalPayableAmount : 0,
        cardAmount: tokenPayMethod === 'CARD' ? totalPayableAmount : 0,
        creditAmount: tokenPayMethod === 'CREDIT' ? totalPayableAmount : 0,
        balance: 0,
        change: 0,
        customerNote: count > 1
          ? `Bulk Pre-Order: ${count} Tokens (#${startNum} - #${endNum}) (${tokenCustomerName || tokenMealType})`
          : `Pre-Order Token #${startNum} (${tokenCustomerName || tokenMealType})`
      };
      if (onRecordSaleOnly) {
        onRecordSaleOnly(tokenSale);
      } else if (onSaleCompleted) {
        onSaleCompleted(tokenSale);
      }
    }

    soundService.playSuccessBeep();
    setCart([]);
    setDiscountAmount(0);
    setTokenQuantity(1);
    setIsTokenModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-140px)] min-h-[580px] bg-white text-black">
      {/* Top Quick Actions Bar */}
      <div className="bg-white border border-slate-200 rounded-3xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            <span className="text-xs font-black uppercase text-black">
              {activeRegister ? `Drawer: ${activeRegister.unitName || activeRegister.unitCode}` : 'POS Terminal Active'}
            </span>
          </div>
          {activeRegister && (
            <span className="text-xs text-slate-500 font-medium hidden sm:inline">
              Opening Float: <strong className="text-black font-extrabold">{formatMoney(activeRegister.openingFloat, settings.currency)}</strong>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Cart Visibility Toggle Button */}
          <button
            type="button"
            onClick={() => setIsCartOpen(!isCartOpen)}
            className={`px-3.5 py-1.5 rounded-xl border-2 font-black text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer active:scale-95 ${
              cart.length > 0
                ? 'bg-amber-500 text-black border-amber-600 hover:bg-amber-400'
                : 'bg-white hover:bg-amber-50 text-amber-950 border-amber-500'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>🛒 Active Cart ({cart.reduce((sum, item) => sum + item.qty, 0)})</span>
            {cart.length > 0 && <span>• {formatMoney(grandTotal, settings.currency)}</span>}
          </button>

          {onOpenCashManagement && (
            <button
              type="button"
              onClick={onOpenCashManagement}
              className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-amber-50 text-black hover:text-amber-950 border border-slate-300 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-2xs"
            >
              <Banknote className="w-3.5 h-3.5 text-amber-600" /> Cash In / Out
            </button>
          )}

          {onOpenCloseSale && (
            <button
              type="button"
              onClick={onOpenCloseSale}
              className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-2xs"
            >
              <X className="w-3.5 h-3.5 text-rose-600" /> Close Shift
            </button>
          )}
        </div>
      </div>

      {/* Cart Notice Banner */}
      {cartNotice && (
        <div className="bg-amber-100 border-2 border-amber-500 rounded-2xl px-4 py-2 flex items-center justify-between text-xs font-black text-amber-950 shadow-xs animate-in fade-in duration-150">
          <span>🔔 {cartNotice}</span>
          <button
            type="button"
            onClick={() => setCartNotice('')}
            className="text-amber-800 hover:text-black font-black cursor-pointer ml-2"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Left side: Product Catalog */}
        <div className={`${(cart.length > 0 || isCartOpen) ? 'lg:col-span-8' : 'lg:col-span-12'} flex flex-col min-h-0 bg-white rounded-3xl border border-slate-200 p-4 shadow-xs transition-all duration-200`}>
          {/* Search & Barcode Scan Bar */}
          <div className="flex flex-wrap items-center gap-2.5 pb-3 border-b border-slate-200">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-amber-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search food item name or SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-amber-500"
              />
            </div>

            <div className="relative w-56">
              <Scan className="w-4 h-4 text-amber-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Scan Product or Token Barcode..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeSubmit}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-amber-500"
              />
            </div>

            <button
              type="button"
              onClick={() => setIsCustomModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" /> + Custom Food Item
            </button>
          </div>

          {/* Catalog Layout: Left Side Categories + Right Side Products Grid */}
          <div className="flex-1 flex gap-3 min-h-0 pt-2.5 overflow-hidden">
            {/* LEFT CATEGORIES RAIL (Neat, compact pills with optimal height and refined typography) */}
            <div className="w-32 sm:w-36 md:w-40 shrink-0 flex flex-col gap-2 overflow-y-auto pr-1 select-none">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider px-1">
                Categories
              </div>

              {/* ALL ITEMS BUTTON */}
              <button
                type="button"
                onClick={() => setSelectedCategory('')}
                className={`w-full p-2.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between shadow-2xs ${
                  selectedCategory === ''
                    ? 'border-amber-500 bg-amber-50 text-amber-950 shadow-xs'
                    : 'border-slate-200 bg-white text-black hover:border-amber-400 hover:bg-amber-50/40'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">🛍️</span>
                  <div className="text-xs font-black truncate">All Items</div>
                </div>
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${selectedCategory === '' ? 'bg-amber-200/90 text-amber-950' : 'bg-slate-100 text-slate-700'}`}>
                  {products.filter((p) => p.status === 'active').length}
                </span>
              </button>

              {/* CUSTOM BOX BUTTON */}
              <button
                type="button"
                onClick={() => setSelectedCategory('__CUSTOM__')}
                className={`w-full p-2.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between shadow-2xs ${
                  selectedCategory === '__CUSTOM__'
                    ? 'border-amber-500 bg-amber-50 text-amber-950 shadow-xs'
                    : 'border-slate-200 bg-white text-black hover:border-amber-400 hover:bg-amber-50/40'
                }`}
                title="Custom Box: Fast access to pinned favorites"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">⭐</span>
                  <div className="text-xs font-black truncate">Custom Box</div>
                </div>
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${selectedCategory === '__CUSTOM__' ? 'bg-amber-200/90 text-amber-950' : 'bg-slate-100 text-slate-700'}`}>
                  {customBoxProducts.length}
                </span>
              </button>

              {/* DRAGGABLE CATEGORY TILES */}
              {orderedCategories.map((cat, idx) => {
                const count = products.filter((p) => p.status === 'active' && p.category === cat).length;
                const isSelected = selectedCategory === cat;
                const icon = getCategoryIcon(cat);

                return (
                  <div
                    key={cat}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(idx)}
                    className="w-full"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`w-full p-2.5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-center justify-between shadow-2xs ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50 text-amber-950 shadow-xs'
                          : 'border-slate-200 bg-white text-black hover:border-amber-400 hover:bg-amber-50/40'
                      }`}
                      title="Click to select category, drag handle to reorder"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0">{icon}</span>
                        <div className="text-xs font-black break-words leading-tight text-black">{cat}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        <GripHorizontal className="w-3.5 h-3.5 text-slate-400 hover:text-amber-600 cursor-grab active:cursor-grabbing" />
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-amber-200/90 text-amber-950' : 'bg-slate-100 text-slate-700'}`}>
                          {count}
                        </span>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* RIGHT PRODUCTS GRID AREA */}
            <div className="flex-1 flex flex-col min-h-0 pl-1 overflow-hidden">
              {/* Active Category Header Bar */}
              <div className="flex items-center justify-between pb-2 mb-1.5 border-b border-slate-100 text-xs">
                <div className="font-extrabold text-black flex items-center gap-1.5">
                  <span className="text-amber-800 uppercase font-mono tracking-tight text-[11px]">Category:</span>
                  <span className="text-black font-black text-sm">
                    {selectedCategory === '' ? 'All Items' : selectedCategory === '__CUSTOM__' ? '⭐ Custom Box' : selectedCategory}
                  </span>
                  <span className="text-slate-500 text-xs">({filteredProducts.length} items)</span>
                </div>

                {(searchTerm || selectedCategory) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory('');
                      setSearchTerm('');
                    }}
                    className="text-[11px] font-bold text-slate-500 hover:text-amber-800 underline cursor-pointer"
                  >
                    Reset Filter
                  </button>
                )}
              </div>

              {/* Products Grid */}
              <div className={`flex-1 overflow-y-auto pr-1 grid ${(cart.length > 0 || isCartOpen) ? 'grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'} gap-2.5 content-start`}>
                {filteredProducts.length === 0 ? (
                  <div className="col-span-full py-16 text-center text-slate-400">
                    <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-amber-600 opacity-40" />
                    <div className="font-bold text-sm text-black">
                      {selectedCategory === '__CUSTOM__' ? 'No products in Custom Box' : 'No products found'}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-medium">
                      {selectedCategory === '__CUSTOM__'
                        ? 'Click the ⭐ Star icon on any product in other categories to pin it here.'
                        : 'Try searching another name or category.'}
                    </div>
                    {selectedCategory === '__CUSTOM__' && (
                      <button
                        type="button"
                        onClick={() => setIsCustomModalOpen(true)}
                        className="mt-3 px-4 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-bold text-xs inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <PlusCircle className="w-4 h-4 text-amber-500" /> Create Custom Food Item
                      </button>
                    )}
                  </div>
                ) : (
                  filteredProducts.map((p) => {
                    const isPinned = customProductIds.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => addToCart(p)}
                        className="group relative bg-white border border-slate-200 hover:border-amber-500 rounded-2xl p-3 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between active:scale-98 text-black"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200">
                              {p.category || 'General'}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => toggleCustomItem(p.id, e)}
                              className="p-1 rounded-lg text-slate-300 hover:text-amber-500 cursor-pointer transition-colors"
                              title={isPinned ? 'Remove from Custom Box' : 'Pin to Custom Box'}
                            >
                              <Star
                                className={`w-4 h-4 ${
                                  isPinned ? 'text-amber-500 fill-amber-500' : 'text-slate-300'
                                }`}
                              />
                            </button>
                          </div>
                          <h4 className="font-extrabold text-sm text-black group-hover:text-amber-950 leading-tight line-clamp-2 mt-1">
                            {p.name}
                          </h4>
                          {p.sku && (
                            <span className="text-[10px] text-slate-600 font-mono">
                              SKU: {p.sku}
                            </span>
                          )}
                        </div>

                        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-black text-black">
                            {formatMoney(p.sellPrice, settings.currency)}
                          </span>
                          <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                            + ADD
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right side: Active Cart (Conditionally rendered when items exist or user toggles it open) */}
        {(cart.length > 0 || isCartOpen) && (
          <div className="lg:col-span-4 flex flex-col min-h-0 bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden text-black animate-in fade-in duration-150">
            {/* Cart Header */}
            <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-amber-600" />
                <span className="font-extrabold text-sm text-black">Active Cart</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-amber-500 text-amber-950 font-extrabold shadow-2xs">
                  {cart.reduce((sum, item) => sum + item.qty, 0)} items
                </span>
              </div>

              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer bg-white px-2 py-1 rounded-lg border border-rose-200"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Clear
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsCartOpen(false)}
                  className="text-[11px] text-slate-500 hover:text-black font-bold flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg cursor-pointer transition-colors"
                  title="Minimize Cart View"
                >
                  ✕ Hide
                </button>
              </div>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 divide-y divide-slate-100">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-12">
                  <ShoppingBag className="w-12 h-12 mb-2 text-slate-300" />
                  <div className="font-bold text-sm text-black">Your cart is empty</div>
                  <div className="text-xs text-slate-500 mt-0.5">Click products on the left to bill</div>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.productId} className="pt-2 first:pt-0 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-black truncate">{item.name}</div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        {formatMoney(item.price, settings.currency)} each
                      </div>
                    </div>

                    {/* Quantity Controls */}
                    <div className="flex items-center gap-1 bg-white border border-slate-300 p-0.5 rounded-lg">
                      <button
                        type="button"
                        onClick={() => updateQty(item.productId, -1)}
                        className="w-6 h-6 rounded bg-white hover:bg-slate-100 border border-slate-200 text-black font-bold text-xs flex items-center justify-center cursor-pointer shadow-2xs"
                      >
                        -
                      </button>
                      <span className="w-5 text-center text-xs font-extrabold text-black">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(item.productId, 1)}
                        className="w-6 h-6 rounded bg-white hover:bg-slate-100 border border-slate-200 text-black font-bold text-xs flex items-center justify-center cursor-pointer shadow-2xs"
                      >
                        +
                      </button>
                    </div>

                    <div className="w-16 text-right font-black text-xs text-black">
                      {formatMoney(item.price * item.qty, settings.currency)}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeFromCart(item.productId)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Cart Calculation & Checkout Area */}
            <div className="p-3.5 border-t border-slate-200 bg-white space-y-2">
              <div className="flex justify-between text-xs text-slate-600 font-medium">
                <span>Subtotal</span>
                <span className="font-bold text-black">
                  {formatMoney(subtotal, settings.currency)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">Discount (Rs.)</span>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={discountAmount || ''}
                  onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                  className="w-20 px-2 py-0.5 rounded-lg border border-slate-300 bg-white text-right text-xs font-bold text-black focus:outline-amber-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                <span className="font-black text-base text-black">TOTAL PAYABLE</span>
                <span className="font-black text-2xl text-black">
                  {formatMoney(grandTotal, settings.currency)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2 pt-1">
                <button
                  type="button"
                  onClick={openPaymentModal}
                  disabled={cart.length === 0}
                  className="w-full py-3.5 rounded-xl bg-white hover:bg-amber-50 border-2 border-amber-500 disabled:opacity-50 text-amber-950 font-black text-sm shadow-xs flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer"
                >
                  <Banknote className="w-4 h-4 text-amber-600" /> PROCEED TO PAYMENT
                </button>

                {/* Fast Food Token / Pre-Order Generator Button */}
                <button
                  type="button"
                  onClick={() => setIsTokenModalOpen(true)}
                  disabled={cart.length === 0}
                  className="w-full py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 disabled:opacity-40 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-98 cursor-pointer shadow-2xs"
                  title="Issue Food Pre-order Token Slip"
                >
                  <Ticket className="w-3.5 h-3.5 text-amber-600" /> Issue Food Pre-Order Token Slip
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CUSTOM ITEM POPUP MODAL */}
      {isCustomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-sm p-5 space-y-3 text-black">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="font-bold text-sm text-black flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600" /> Add Custom Food Item
              </h3>
              <button
                onClick={() => setIsCustomModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-black cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Item Name *</label>
              <input
                type="text"
                placeholder="e.g. Special Mixed Rice / Fresh Fruit Bowl"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-amber-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Unit Price (Rs.) *</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0.00"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-bold text-black focus:outline-amber-500"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={customQty}
                  onChange={(e) => setCustomQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-bold text-black focus:outline-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCustomModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-white border border-slate-300 text-black font-bold text-xs hover:bg-slate-50 cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddCustomItem}
                disabled={!customName.trim() || !customPrice}
                className="flex-1 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 disabled:opacity-50 font-bold text-xs shadow-xs cursor-pointer"
              >
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK ISSUE TOKEN SLIP MODAL (Requirement 8) */}
      {isTokenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4 text-black">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-amber-600" />
                <h3 className="font-extrabold text-base text-black">Issue Pre-Order Food Token</h3>
              </div>
              <button
                onClick={() => setIsTokenModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50/50 border border-amber-300 rounded-2xl text-xs space-y-1">
              <div className="font-black text-amber-950 flex items-center justify-between">
                <span>Meal Items ({cart.length}):</span>
                <span className="text-sm font-black text-black">{formatMoney(grandTotal, settings.currency)}</span>
              </div>
              <div className="text-slate-600">
                A printable token slip with barcode will be printed for the customer to collect lunch/dinner later.
              </div>
            </div>

            <div className="space-y-3 text-xs">
              {/* BULK TOKEN QUANTITY SELECTOR (20, 100, custom) */}
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-400">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-black text-amber-950 uppercase flex items-center gap-1.5">
                    <Ticket className="w-3.5 h-3.5 text-amber-700" />
                    <span>Number of Tokens (ටෝකන් ගණන)</span>
                  </label>
                  <span className="text-xs font-black text-amber-950 px-2 py-0.5 rounded-full bg-amber-200">
                    {tokenQuantity} {tokenQuantity === 1 ? 'Token' : 'Tokens'}
                  </span>
                </div>

                <div className="grid grid-cols-6 gap-1 mb-2">
                  {[1, 5, 10, 20, 50, 100].map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      onClick={() => setTokenQuantity(qty)}
                      className={`py-1.5 rounded-xl font-black text-xs transition-all cursor-pointer border ${
                        tokenQuantity === qty
                          ? 'bg-amber-500 text-black border-amber-600 shadow-2xs'
                          : 'bg-white text-black border-slate-300 hover:bg-amber-100/50'
                      }`}
                    >
                      {qty}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-700 whitespace-nowrap">Custom Qty:</span>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={tokenQuantity}
                    onChange={(e) => setTokenQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-black text-black focus:outline-amber-500"
                    placeholder="Enter quantity (e.g. 20, 100)"
                  />
                </div>

                {tokenQuantity > 1 && (
                  <div className="mt-2 pt-2 border-t border-amber-300/80 space-y-1.5">
                    <label className="font-extrabold text-[11px] text-amber-950 uppercase block">
                      Bulk Thermal Print Output Mode
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setTokenPrintMode('INDIVIDUAL')}
                        className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                          tokenPrintMode === 'INDIVIDUAL'
                            ? 'bg-amber-500 text-black border-amber-600 font-black shadow-2xs'
                            : 'bg-white text-black border-slate-300 font-bold hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-xs font-black">Individual Slips</div>
                        <div className="text-[10px] opacity-80">Print {tokenQuantity} separate slips</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setTokenPrintMode('MASTER')}
                        className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                          tokenPrintMode === 'MASTER'
                            ? 'bg-amber-500 text-black border-amber-600 font-black shadow-2xs'
                            : 'bg-white text-black border-slate-300 font-bold hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-xs font-black">1 Master Voucher</div>
                        <div className="text-[10px] opacity-80">Summary voucher for all {tokenQuantity}</div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="font-bold text-slate-600 uppercase block mb-1">Meal / Order Type</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['Breakfast', 'Lunch', 'Dinner', 'Snacks'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTokenMealType(m)}
                      className={`py-2 rounded-xl font-bold border transition-all cursor-pointer ${
                        tokenMealType === m
                          ? 'bg-amber-500 text-black border-amber-600 font-black shadow-2xs'
                          : 'bg-white border-slate-300 text-black hover:bg-slate-50'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 uppercase block mb-1">Customer / Organization / Ref Name</label>
                <input
                  type="text"
                  placeholder="e.g. Finance Dept Lunch / Table 4 / Mr. Perera"
                  value={tokenCustomerName}
                  onChange={(e) => setTokenCustomerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-bold text-slate-600 uppercase block mb-1">Payment Status</label>
                  <select
                    value={tokenPayStatus}
                    onChange={(e) => setTokenPayStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black"
                  >
                    <option value="PAID">Paid in Advance (ගෙවා ඇත)</option>
                    <option value="UNPAID">Pay on Collection (ගැනීමේදී)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-600 uppercase block mb-1">Payment Method</label>
                  <select
                    value={tokenPayMethod}
                    onChange={(e) => setTokenPayMethod(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black"
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="CREDIT">Credit</option>
                  </select>
                </div>
              </div>

              {/* Total Payable Summary for Bulk */}
              <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between">
                <span className="font-black text-xs text-slate-700">
                  Total Payable ({tokenQuantity} {tokenQuantity === 1 ? 'Token' : 'Tokens'}):
                </span>
                <span className="font-black text-sm text-black">
                  {formatMoney(grandTotal * tokenQuantity, settings.currency)}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsTokenModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-white border border-slate-300 text-black font-bold text-xs hover:bg-slate-100 cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleIssueTokenFromCart}
                className="flex-1 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Printer className="w-4 h-4 text-amber-600" />
                <span>
                  {tokenQuantity > 1 ? `Print ${tokenQuantity} Tokens (${tokenPrintMode === 'MASTER' ? 'Voucher' : 'Slips'})` : 'Print Token Slip'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAYMENT METHOD & CHECKOUT MODAL (Cash tender, balance breakdown) */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden text-black">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
              <h3 className="font-bold text-black text-base">Select Payment Method</h3>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {checkoutError && (
                <div className="p-3 bg-rose-50 border-2 border-rose-400 text-rose-800 text-xs font-black rounded-2xl flex items-center justify-between animate-in fade-in">
                  <span>⚠️ {checkoutError}</span>
                  <button
                    type="button"
                    onClick={() => setCheckoutError('')}
                    className="text-rose-500 hover:text-rose-900 cursor-pointer font-bold ml-2"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Grand Total Banner */}
              <div className="bg-amber-50 border-2 border-amber-500 rounded-2xl p-4 text-center shadow-xs">
                <div className="text-xs font-black text-amber-950 uppercase tracking-wider">
                  Total Payable Amount (මුළු මුදල)
                </div>
                <div className="text-4xl font-black text-black mt-1 tracking-tight">
                  {formatMoney(grandTotal, settings.currency)}
                </div>
              </div>

              {/* Payment Methods Tabs */}
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('CASH')}
                  className={`py-3 px-2 rounded-xl font-bold text-xs flex flex-col items-center gap-1.5 border transition-all cursor-pointer bg-white shadow-2xs ${
                    paymentMethod === 'CASH'
                      ? 'border-2 border-amber-500 text-amber-950 bg-amber-50/50'
                      : 'border-slate-300 text-black hover:bg-amber-50/30'
                  }`}
                >
                  <Banknote className="w-5 h-5 text-amber-600" />
                  <span>CASH</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('CARD')}
                  className={`py-3 px-2 rounded-xl font-bold text-xs flex flex-col items-center gap-1.5 border transition-all cursor-pointer bg-white shadow-2xs ${
                    paymentMethod === 'CARD'
                      ? 'border-2 border-amber-500 text-amber-950 bg-amber-50/50'
                      : 'border-slate-300 text-black hover:bg-amber-50/30'
                  }`}
                >
                  <CreditCard className="w-5 h-5 text-amber-600" />
                  <span>CARD</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('CREDIT')}
                  className={`py-3 px-2 rounded-xl font-bold text-xs flex flex-col items-center gap-1.5 border transition-all cursor-pointer bg-white shadow-2xs ${
                    paymentMethod === 'CREDIT'
                      ? 'border-2 border-amber-500 text-amber-950 bg-amber-50/50'
                      : 'border-slate-300 text-black hover:bg-amber-50/30'
                  }`}
                >
                  <FileText className="w-5 h-5 text-amber-600" />
                  <span>CREDIT</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('CASH+CARD')}
                  className={`py-3 px-2 rounded-xl font-bold text-xs flex flex-col items-center gap-1.5 border transition-all cursor-pointer bg-white shadow-2xs ${
                    paymentMethod === 'CASH+CARD'
                      ? 'border-2 border-amber-500 text-amber-950 bg-amber-50/50'
                      : 'border-slate-300 text-black hover:bg-amber-50/30'
                  }`}
                >
                  <Split className="w-5 h-5 text-amber-600" />
                  <span>SPLIT MIX</span>
                </button>
              </div>

              {/* CASH INPUTS with exact Tender, Big Prominent Note buttons and Balance Returned */}
              {paymentMethod === 'CASH' && (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-black text-slate-800 uppercase tracking-wide">
                        Currency Tender Notes (මුදල් නෝට්ටු)
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCashReceived(grandTotal)}
                          className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black border border-amber-600 font-black text-xs cursor-pointer shadow-2xs transition-all active:scale-95"
                        >
                          Exact Total (Rs. {grandTotal.toFixed(0)})
                        </button>
                        <button
                          type="button"
                          onClick={() => setCashReceived(0)}
                          className="text-[11px] font-bold text-rose-600 hover:text-rose-800 px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 cursor-pointer"
                        >
                          Clear (0)
                        </button>
                      </div>
                    </div>

                    {/* Prominent Large Currency Notes: 10, 20, 50, 100, 500, 1000, 2000, 5000 */}
                    <div className="grid grid-cols-4 gap-2">
                      {[10, 20, 50, 100, 500, 1000, 2000, 5000].map((val) => (
                        <button
                          key={`note-${val}`}
                          type="button"
                          onClick={() => setCashReceived((prev) => Math.round(((Number(prev) || 0) + val) * 100) / 100)}
                          className="min-h-[58px] rounded-2xl bg-white hover:bg-amber-50 text-black hover:text-amber-950 border-2 border-slate-300 hover:border-amber-500 font-black cursor-pointer active:scale-95 shadow-2xs flex flex-col items-center justify-center p-1.5 transition-all group"
                        >
                          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider group-hover:text-amber-800">
                            +{val >= 1000 ? `${val / 1000}K Note` : 'Note'}
                          </span>
                          <span className="text-base sm:text-lg font-black font-mono text-black group-hover:text-amber-950">
                            Rs. {val >= 1000 ? val.toLocaleString() : val}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-black text-black uppercase">
                          Customer Paid (Cash Received) *
                        </label>
                        {cashReceived > 0 && (
                          <span className="text-[10px] font-bold text-slate-500">
                            Total: Rs. {cashReceived.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        min="0"
                        placeholder="0.00"
                        value={cashReceived === 0 ? '' : cashReceived}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            setCashReceived(0);
                          } else {
                            const num = parseFloat(val);
                            setCashReceived(isNaN(num) ? 0 : num);
                          }
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-slate-300 text-xl font-black text-black focus:border-amber-500 focus:outline-none shadow-2xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-black text-black uppercase block mb-1">
                        Balance Returned (Change Due)
                      </label>
                      <div
                        className={`w-full px-3.5 py-2.5 rounded-xl border-2 text-xl font-black flex items-center shadow-2xs ${
                          cashReceived >= grandTotal
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-950'
                            : 'bg-rose-50 border-rose-400 text-rose-800'
                        }`}
                      >
                        {cashReceived >= grandTotal
                          ? formatMoney(cashReceived - grandTotal, settings.currency)
                          : `Short: -${formatMoney(grandTotal - cashReceived, settings.currency)}`}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CARD INPUTS */}
              {paymentMethod === 'CARD' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                      Card Charge Amount
                    </label>
                    <input
                      type="number"
                      value={cardAmount || ''}
                      onChange={(e) => setCardAmount(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-lg font-black text-black focus:outline-amber-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                        Card Ref / Auth Code
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 984512"
                        value={cardRef}
                        onChange={(e) => setCardRef(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                        Card Type
                      </label>
                      <select
                        value={cardType}
                        onChange={(e) => setCardType(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black"
                      >
                        <option value="">Visa / Master</option>
                        <option value="Visa">Visa</option>
                        <option value="MasterCard">MasterCard</option>
                        <option value="Amex">Amex</option>
                        <option value="LankaPay">LankaPay</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* SPLIT CASH+CARD INPUTS */}
              {paymentMethod === 'CASH+CARD' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                        Cash Portion (Rs.)
                      </label>
                      <input
                        type="number"
                        value={mixCash || ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setMixCash(val);
                          setMixCard(Math.max(0, grandTotal - val));
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-base font-bold text-black"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                        Card Portion (Rs.)
                      </label>
                      <input
                        type="number"
                        value={mixCard || ''}
                        onChange={(e) => setMixCard(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-base font-bold text-black"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* CREDIT / DEPT BILLING INPUTS (Requirement 7: Buttons instead of dropdown!) */}
              {paymentMethod === 'CREDIT' && (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase">
                        Department / Account (Optional - අභිමත නම් තෝරන්න)
                      </label>
                      {creditDept && (
                        <button
                          type="button"
                          onClick={() => setCreditDept('')}
                          className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 bg-slate-50 rounded-2xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setCreditDept('')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                          !creditDept
                            ? 'bg-slate-800 text-white border border-slate-900 font-black'
                            : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        No Department (General)
                      </button>
                      {departments.map((d) => {
                        const isSelected = creditDept === d;
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setCreditDept(isSelected ? '' : d)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-2xs ${
                              isSelected
                                ? 'bg-amber-500 text-black border-2 border-amber-600 scale-102 shadow-xs'
                                : 'bg-white border border-slate-300 text-black hover:bg-amber-50 hover:border-amber-400'
                            }`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                    {creditDept ? (
                      <div className="text-xs font-bold text-amber-950 mt-1.5">
                        Selected: <span className="font-black underline">{creditDept}</span>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 mt-1.5 italic">
                        No department selected (General Credit Customer)
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                        Credit Due Date
                      </label>
                      <input
                        type="date"
                        value={creditDueDate}
                        onChange={(e) => setCreditDueDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                        Customer Reference / Notes
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Order ref"
                        value={creditNote}
                        onChange={(e) => setCreditNote(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black"
                      />
                    </div>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleCompleteSale}
                disabled={paymentMethod === 'CASH' && cashReceived < grandTotal}
                className="w-full py-3.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 disabled:opacity-50 font-black text-sm shadow-md transition-all active:scale-98 cursor-pointer mt-2"
              >
                COMPLETE SALE & DIRECT PRINT RECEIPT →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
