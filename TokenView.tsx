import React, { useState, useEffect, useRef } from 'react';
import { TokenOrder, TokenItem, Product, AuthSession, PaymentMethod, CompanySettings } from '../types/pos';
import { formatMoney, uid, getNowParts } from '../services/storage';
import { soundService } from '../services/sound';
import { generateCode128Svg } from '../services/barcode';
import { directPrintService } from '../services/directPrintService';
import {
  Ticket,
  Plus,
  Search,
  Scan,
  CheckCircle,
  XCircle,
  Printer,
  Utensils,
  Clock,
  User,
  ShoppingBag,
  Trash2,
  Check,
  RotateCcw,
  CreditCard,
  Banknote,
  CheckSquare,
  Square,
  Sparkles,
  ShieldAlert,
  AlertCircle
} from 'lucide-react';

interface TokenViewProps {
  tokens: TokenOrder[];
  products: Product[];
  session: AuthSession | null;
  settings?: CompanySettings;
  currency: string;
  onSaveToken: (token: TokenOrder) => void;
  onSaveTokens?: (tokens: TokenOrder[]) => void;
  onUpdateTokenStatus: (tokenId: string, status: 'COMPLETED' | 'CANCELLED') => void;
  onUpdateTokenPayment?: (tokenId: string, paymentStatus: 'PAID' | 'UNPAID') => void;
}

export const TokenView: React.FC<TokenViewProps> = ({
  tokens,
  products,
  session,
  settings,
  currency,
  onSaveToken,
  onSaveTokens,
  onUpdateTokenStatus,
  onUpdateTokenPayment
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [barcodeScanInput, setBarcodeScanInput] = useState('');
  const [activeTab, setActiveTab] = useState<'PENDING' | 'COMPLETED' | 'ALL'>('PENDING');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTokenForView, setSelectedTokenForView] = useState<TokenOrder | null>(null);
  const [scanMessage, setScanMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [printedTokenIds, setPrintedTokenIds] = useState<Set<string>>(() => new Set<string>());
  const [printWarning, setPrintWarning] = useState<string | null>(null);
  
  // Duplicate print dialog state
  const [duplicateWarningToken, setDuplicateWarningToken] = useState<TokenOrder | null>(null);
  const [duplicateWarningBatch, setDuplicateWarningBatch] = useState<TokenOrder[] | null>(null);

  const scanInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus barcode scanner input for lightning-fast hardware scanner guns
  useEffect(() => {
    scanInputRef.current?.focus();
  }, []);

  // Create form state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [mealType, setMealType] = useState<'LUNCH' | 'BREAKFAST' | 'DINNER' | 'SNACKS'>('LUNCH');
  const [tokenItems, setTokenItems] = useState<TokenItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [itemSearchQuery, setItemSearchQuery] = useState<string>('');
  const [itemQuantity, setItemQuantity] = useState<number>(1);
  const [paymentStatus, setPaymentStatus] = useState<'PAID' | 'UNPAID'>('PAID');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [notes, setNotes] = useState('');
  const [tokenQuantity, setTokenQuantity] = useState<number>(1);
  const [tokenPrintMode, setTokenPrintMode] = useState<'INDIVIDUAL' | 'MASTER'>('INDIVIDUAL');

  const now = getNowParts();
  const todayTokens = tokens.filter((t) => (t.businessDate || t.date) === now.date || t.status === 'PENDING');

  // Search logic: Searches comprehensively across token #, code, customer, phone, meal, items, status
  const searchPool = searchTerm.trim() ? tokens : activeTab === 'ALL' ? tokens : todayTokens;

  const filteredTokens = searchPool.filter((t) => {
    if (!searchTerm.trim()) {
      if (activeTab === 'PENDING' && t.status !== 'PENDING') return false;
      if (activeTab === 'COMPLETED' && t.status !== 'COMPLETED') return false;
      return true;
    }
    const q = searchTerm.toLowerCase().trim();
    const numMatch = String(t.tokenNumber).includes(q) || `#${t.tokenNumber}`.includes(q);
    const codeMatch = (t.tokenCode || '').toLowerCase().includes(q);
    const nameMatch = (t.customerName || '').toLowerCase().includes(q);
    const phoneMatch = (t.customerPhone || '').toLowerCase().includes(q);
    const mealMatch = (t.mealType || '').toLowerCase().includes(q);
    const statusMatch = t.status.toLowerCase().includes(q);
    const paymentMatch = (t.paymentStatus || '').toLowerCase().includes(q);
    const itemMatch = t.items?.some((i) => i.name.toLowerCase().includes(q));
    return numMatch || codeMatch || nameMatch || phoneMatch || mealMatch || statusMatch || paymentMatch || itemMatch;
  });

  const pendingCount = todayTokens.filter((t) => t.status === 'PENDING').length;
  const completedCount = todayTokens.filter((t) => t.status === 'COMPLETED').length;

  // Process barcode scan for automated completion
  const processBarcodeScan = (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;

    // Find token across ALL tokens (current day and past days)
    const foundToken = tokens.find(
      (t) =>
        (t.tokenCode && t.tokenCode.toLowerCase() === code.toLowerCase()) ||
        String(t.tokenNumber) === code ||
        t.id === code ||
        (t.tokenCode && t.tokenCode.replace(/-/g, '').toLowerCase() === code.replace(/-/g, '').toLowerCase())
    );

    if (foundToken) {
      if (foundToken.status === 'COMPLETED') {
        soundService.playWarningBuzz();
        setScanMessage({
          type: 'error',
          text: `⚠️ Token #${foundToken.tokenNumber} was ALREADY CLAIMED & COMPLETED on ${foundToken.completedAt || foundToken.date || ''}`
        });
      } else if (foundToken.status === 'CANCELLED') {
        soundService.playWarningBuzz();
        setScanMessage({
          type: 'error',
          text: `⚠️ Token #${foundToken.tokenNumber} has been VOIDED / CANCELLED!`
        });
      } else {
        // Play clear success chime
        soundService.playSuccessBeep();
        // Automatically mark completed immediately in Firestore / local state
        onUpdateTokenStatus(foundToken.id, 'COMPLETED');
        setScanMessage({
          type: 'success',
          text: `✓ AUTO-COMPLETED: Token #${foundToken.tokenNumber} (${foundToken.customerName || 'Meal'}) Verified & Claimed!`
        });
      }
      setSelectedTokenForView(foundToken);
    } else {
      soundService.playWarningBuzz();
      setScanMessage({
        type: 'error',
        text: `❌ No token found for scanned barcode: "${code}"`
      });
    }
    setBarcodeScanInput('');
    setTimeout(() => setScanMessage(null), 4500);
  };

  // Global Hardware Barcode Scanner listener
  useEffect(() => {
    let scannedBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') &&
        target.id !== 'token-barcode-scanner'
      ) {
        return;
      }

      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 100) {
        scannedBuffer = '';
      }
      lastKeyTime = currentTime;

      if (e.key === 'Enter') {
        if (scannedBuffer.length >= 2) {
          processBarcodeScan(scannedBuffer);
          scannedBuffer = '';
        }
      } else if (e.key.length === 1) {
        scannedBuffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [tokens]);

  const handleBarcodeScanSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      processBarcodeScan(barcodeScanInput);
    }
  };

  const handleAddProductItem = (prodToAdd?: Product) => {
    const prod = prodToAdd || products.find((p) => p.id === selectedProductId);
    if (!prod) return;

    const existingIndex = tokenItems.findIndex((it) => it.productId === prod.id);
    if (existingIndex >= 0) {
      const updated = [...tokenItems];
      updated[existingIndex].qty += itemQuantity;
      setTokenItems(updated);
    } else {
      const newItem: TokenItem = {
        productId: prod.id,
        name: prod.name,
        qty: itemQuantity,
        price: prod.sellPrice,
        unit: prod.unit || 'portion'
      };
      setTokenItems([...tokenItems, newItem]);
    }

    setSelectedProductId('');
    setItemQuantity(1);
    setItemSearchQuery('');
  };

  const handleRemoveItem = (index: number) => {
    setTokenItems(tokenItems.filter((_, idx) => idx !== index));
  };

  const handleCreateToken = () => {
    if (tokenItems.length === 0) {
      alert('Please add at least one pre-ordered food item for the token.');
      return;
    }

    const count = Math.max(1, parseInt(String(tokenQuantity), 10) || 1);
    const currentMax = todayTokens.reduce((max, t) => Math.max(max, t.tokenNumber), 0);
    const startNum = currentMax + 1;
    const endNum = currentMax + count;
    const dateNum = now.date.replace(/-/g, '');
    const singleTotal = tokenItems.reduce((sum, item) => sum + item.price * item.qty, 0);

    if (count === 1) {
      // Single token order
      const code = `TKN-${dateNum}-${String(startNum).padStart(3, '0')}`;
      const singleToken: TokenOrder = {
        id: uid('tkn'),
        tokenNumber: startNum,
        tokenCode: code,
        businessDate: now.date,
        date: now.date,
        time: now.time,
        customerName: customerName.trim() || `${mealType} Pre-order`,
        customerPhone: customerPhone.trim() || undefined,
        unitCode: session?.unitCode || 'Counter',
        unitName: session?.unitName || session?.unitCode || 'Counter',
        cashier: session?.user || 'Cashier',
        status: 'PENDING',
        items: [...tokenItems],
        totalAmount: singleTotal,
        grandTotal: singleTotal,
        paymentStatus: paymentStatus,
        paymentMethod: paymentMethod,
        notes: notes.trim() || undefined,
        createdAt: `${now.date} ${now.time}`
      };

      if (onSaveToken) onSaveToken(singleToken);
      else if (onSaveTokens) onSaveTokens([singleToken]);

      setIsCreateModalOpen(false);
      setSelectedTokenForView(singleToken);
      executeDirectPrintToken(singleToken, false);
    } else if (tokenPrintMode === 'MASTER') {
      // 1 MASTER VOUCHER ONLY - Exactly 1 complete consolidated token order record
      const masterCode = `BATCH-${dateNum}-${String(startNum).padStart(3, '0')}-${String(endNum).padStart(3, '0')}`;
      const masterToken: TokenOrder = {
        id: uid('tkn_master'),
        tokenNumber: startNum,
        tokenCode: masterCode,
        businessDate: now.date,
        date: now.date,
        time: now.time,
        customerName: customerName.trim() || `${count}x ${mealType} Master Voucher`,
        customerPhone: customerPhone.trim() || undefined,
        unitCode: session?.unitCode || 'Counter',
        unitName: session?.unitName || session?.unitCode || 'Counter',
        cashier: session?.user || 'Cashier',
        status: 'PENDING',
        items: [...tokenItems],
        totalAmount: singleTotal * count,
        grandTotal: singleTotal * count,
        paymentStatus: paymentStatus,
        paymentMethod: paymentMethod,
        notes: notes.trim() || undefined,
        createdAt: `${now.date} ${now.time}`,
        isBatchMaster: true,
        batchCount: count,
        batchRange: `#${String(startNum).padStart(3, '0')} - #${String(endNum).padStart(3, '0')}`
      };

      if (onSaveToken) onSaveToken(masterToken);
      else if (onSaveTokens) onSaveTokens([masterToken]);

      setIsCreateModalOpen(false);
      setSelectedTokenForView(masterToken);
      executeDirectPrintMasterVoucher(masterToken, count, startNum, endNum, false);
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
          businessDate: now.date,
          date: now.date,
          time: now.time,
          customerName: customerName.trim() || `${mealType} Pre-order`,
          customerPhone: customerPhone.trim() || undefined,
          unitCode: session?.unitCode || 'Counter',
          unitName: session?.unitName || session?.unitCode || 'Counter',
          cashier: session?.user || 'Cashier',
          status: 'PENDING',
          items: [...tokenItems],
          totalAmount: singleTotal,
          grandTotal: singleTotal,
          paymentStatus: paymentStatus,
          paymentMethod: paymentMethod,
          notes: notes.trim() || undefined,
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
      } else {
        generatedTokens.forEach((t) => onSaveToken(t));
      }

      setIsCreateModalOpen(false);
      setSelectedTokenForView(generatedTokens[0]);
      executeDirectPrintMultiTokens(generatedTokens, false);
    }

    // Reset create form
    setCustomerName('');
    setCustomerPhone('');
    setTokenItems([]);
    setNotes('');
    setTokenQuantity(1);
    setItemSearchQuery('');
  };

  // Direct Print Single Token with Duplicate Detection
  const handleDirectPrintToken = (token: TokenOrder) => {
    if (printedTokenIds.has(token.id)) {
      setDuplicateWarningToken(token);
    } else {
      executeDirectPrintToken(token, false);
    }
  };

  const executeDirectPrintToken = (token: TokenOrder, isDuplicate: boolean = false) => {
    setPrintedTokenIds((prev) => new Set(prev).add(token.id));
    setDuplicateWarningToken(null);

    // Hardware direct thermal print
    if (settings?.directPrinter && settings.directPrinter.driver && settings.directPrinter.driver !== 'BROWSER') {
      directPrintService.printToken(token, settings).catch(() => {});
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

    const is58 = settings?.printerPaperSize === '58mm' || settings?.receiptSize === '58';
    const containerWidth = is58 ? '48mm' : '72mm';
    const bodyFontSize = is58 ? '10px' : '11px';

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Token #${token.tokenNumber}</title>
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
          .duplicate-tag { display: inline-block; font-size: 10px; font-weight: 900; background: #000; color: #fff; padding: 2px 6px; border-radius: 3px; margin-bottom: 3px; }
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
        <div class="title">${settings?.name || token.unitName || 'SUPER SERV POS'}</div>
        <div class="sub">FOOD PRE-ORDER TOKEN SLIP</div>
        ${isDuplicate ? '<div class="duplicate-tag">** DUPLICATE COPY **</div>' : ''}
        
        <div class="token-box">
          <div class="token-lbl">TOKEN NUMBER</div>
          <div class="token-num">#${String(token.tokenNumber).padStart(3, '0')}</div>
          <div class="meal-tag">${token.customerName || 'Pre-order Meal'}</div>
        </div>

        <div class="barcode-box">
          ${generateCode128Svg(token.tokenCode, 30)}
          <div class="code-text">${token.tokenCode}</div>
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
            ${(token.items || []).map((it) => `
              <tr>
                <td style="word-break: break-word;">${it.name}</td>
                <td style="text-align: center;">${it.qty}</td>
                <td style="text-align: right; font-weight: 900;">${formatMoney(it.price * it.qty, currency)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-box">
          <span>TOTAL:</span>
          <span>${formatMoney(token.totalAmount || token.grandTotal || 0, currency)}</span>
        </div>

        <div class="status-badge">
          ${token.paymentStatus === 'PAID' ? '✓ PAID IN ADVANCE' : '⚠ PAY ON COLLECTION'}
        </div>

        <div class="footer">
          <div>Hand over this token slip at the food counter to claim your meal.</div>
          <div>${token.businessDate || token.date} ${token.time} | Counter: ${token.unitCode}</div>
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

  // Direct Print Master Voucher
  const executeDirectPrintMasterVoucher = (
    masterToken: TokenOrder,
    count: number,
    startNum: number,
    endNum: number,
    isDuplicate: boolean = false
  ) => {
    setPrintedTokenIds((prev) => new Set(prev).add(masterToken.id));

    if (settings?.directPrinter && settings.directPrinter.driver && settings.directPrinter.driver !== 'BROWSER') {
      directPrintService.printMasterToken(masterToken, count, startNum, endNum, settings).catch(() => {});
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

    const is58 = settings?.printerPaperSize === '58mm' || settings?.receiptSize === '58';
    const containerWidth = is58 ? '48mm' : '72mm';
    const bodyFontSize = is58 ? '10px' : '11px';

    doc.open();
    doc.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Master Batch Voucher #${startNum}-${endNum}</title>
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
            border: 2px solid #000000;
            border-radius: 4px;
            padding: 6px 4px;
            text-align: center;
            margin: 4px 0;
          }
          .batch-pill {
            display: inline-block;
            font-size: 11px;
            font-weight: 900;
            background: #000000;
            color: #ffffff;
            padding: 2px 8px;
            border-radius: 3px;
            margin-bottom: 3px;
          }
          .token-lbl { font-size: 9.5px; font-weight: 900; letter-spacing: 1px; }
          .token-num { font-size: ${is58 ? '18px' : '22px'}; font-weight: 900; line-height: 1.1; margin: 2px 0; }
          .meal-tag { font-size: 10.5px; font-weight: 900; margin-top: 2px; }
          .barcode-box { text-align: center; margin: 4px 0; }
          .code-text { font-size: 9px; font-weight: 900; margin-top: 2px; font-family: monospace; }
          .items-table { width: 100% !important; text-align: left; font-size: 9.5px; border-collapse: collapse; margin: 4px 0; }
          .items-table th { border-bottom: 1px solid #000000; padding: 2px 0; font-weight: 900; }
          .items-table td { padding: 2px 0; vertical-align: top; }
          .total-box {
            display: flex;
            justify-content: space-between;
            font-size: 12.5px;
            font-weight: 900;
            border-top: 1px dashed #000000;
            border-bottom: 1px dashed #000000;
            padding: 4px 0;
            margin: 4px 0;
          }
          .status-badge {
            font-size: 10px;
            font-weight: 900;
            margin-top: 4px;
            border: 1px solid #000000;
            padding: 3px;
            text-align: center;
          }
          .footer { font-size: 8.5px; margin-top: 5px; border-top: 1px dotted #888888; padding-top: 3px; line-height: 1.2; text-align: center; }
        </style>
      </head>
      <body>
        <div class="title">${settings?.name || 'SUPER SERV POS'}</div>
        <div class="sub">BULK PRE-ORDER MASTER VOUCHER</div>
        ${isDuplicate ? '<div class="batch-pill">** DUPLICATE COPY **</div>' : ''}

        <div class="token-box">
          <div class="batch-pill">${count} TOKENS BATCH</div>
          <div class="token-lbl">TOKEN RANGE</div>
          <div class="token-num">#${String(startNum).padStart(3, '0')} - #${String(endNum).padStart(3, '0')}</div>
          <div class="meal-tag">${masterToken.customerName || 'Pre-order Meals'}</div>
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
            ${(masterToken.items || []).map((it) => `
              <tr>
                <td style="word-break: break-word;">${it.name}</td>
                <td style="text-align: center;">${it.qty} x ${formatMoney(it.price, currency)}</td>
                <td style="text-align: right; font-weight: 900;">${it.qty * count} Portions</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-box">
          <span>GRAND TOTAL (${count} TOKENS):</span>
          <span>${formatMoney(masterToken.totalAmount || 0, currency)}</span>
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

  // Direct Print Multi Tokens with Duplicate Warning Check
  const handleDirectPrintMultiTokens = (tokensList: TokenOrder[]) => {
    const anyAlreadyPrinted = tokensList.some((t) => printedTokenIds.has(t.id));
    if (anyAlreadyPrinted) {
      setDuplicateWarningBatch(tokensList);
    } else {
      executeDirectPrintMultiTokens(tokensList, false);
    }
  };

  const executeDirectPrintMultiTokens = (tokensList: TokenOrder[], isDuplicate: boolean = false) => {
    setPrintedTokenIds((prev) => {
      const next = new Set(prev);
      tokensList.forEach((t) => next.add(t.id));
      return next;
    });
    setDuplicateWarningBatch(null);

    // Hardware direct thermal print
    if (settings?.directPrinter && settings.directPrinter.driver && settings.directPrinter.driver !== 'BROWSER') {
      directPrintService.printMultiTokens(tokensList, settings).catch(() => {});
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

    const is58 = settings?.printerPaperSize === '58mm' || settings?.receiptSize === '58';
    const containerWidth = is58 ? '48mm' : '72mm';
    const bodyFontSize = is58 ? '10px' : '11px';

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!doc) return;

    const slipsHtml = tokensList
      .map(
        (token, idx) => `
      <div class="slip-page ${idx < tokensList.length - 1 ? 'page-break' : ''}">
        <div class="title">${settings?.name || 'SUPER SERV POS'}</div>
        <div class="sub">FOOD PRE-ORDER TOKEN SLIP</div>
        ${isDuplicate ? '<div class="duplicate-tag" style="display:inline-block;font-size:9.5px;font-weight:900;border:1px solid #000;padding:1px 4px;margin-bottom:2px;">** DUPLICATE COPY **</div>' : ''}

        <div class="token-box">
          <div class="token-lbl">TOKEN NUMBER</div>
          <div class="token-num">#${String(token.tokenNumber).padStart(3, '0')}</div>
          <div class="meal-tag">${token.customerName || token.date} ${token.batchCount ? `(${token.batchIndex || idx + 1}/${token.batchCount})` : ''}</div>
        </div>

        <div class="barcode-box">
          ${generateCode128Svg(token.tokenCode, 30)}
          <div class="code-text">${token.tokenCode}</div>
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
            ${(token.items || []).map(
              (it) => `
              <tr>
                <td style="word-break: break-word;">${it.name}</td>
                <td style="text-align: center;">${it.qty}</td>
                <td style="text-align: right; font-weight: 900;">${formatMoney(it.qty * it.price, currency)}</td>
              </tr>
            `
            ).join('')}
          </tbody>
        </table>

        <div class="total-box">
          <span>TOTAL:</span>
          <span>${formatMoney(token.totalAmount || 0, currency)}</span>
        </div>

        <div class="status-badge">
          ${token.paymentStatus === 'PAID' ? '✓ PAID IN ADVANCE' : '⚠ PAY ON COLLECTION'}
        </div>

        <div class="footer">
          <div>Hand over this token slip at the counter to claim your meal.</div>
          <div>${token.date} ${token.time} | Counter: ${token.unitCode}</div>
        </div>
      </div>
    `
      )
      .join('');

    doc.open();
    doc.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Batch Tokens</title>
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
          .title { font-size: ${is58 ? '12px' : '13px'}; font-weight: 900; text-transform: uppercase; margin-bottom: 2px; }
          .sub { font-size: 9px; margin-bottom: 4px; }
          .token-box {
            border: 2px solid #000000;
            border-radius: 4px;
            padding: 4px 2px;
            margin: 4px 0;
          }
          .token-lbl { font-size: 9px; font-weight: 900; letter-spacing: 1px; }
          .token-num { font-size: ${is58 ? '22px' : '26px'}; font-weight: 900; line-height: 1.1; }
          .meal-tag { font-size: 10px; font-weight: 900; margin-top: 2px; }
          .barcode-box { text-align: center; margin: 3px 0 2px 0; }
          .code-text { font-size: 8.5px; font-family: monospace; font-weight: 900; }
          .items-table { width: 100% !important; text-align: left; font-size: 9.5px; border-collapse: collapse; margin: 4px 0; }
          .items-table th { border-bottom: 1px dashed #000000; padding: 2px 0; font-weight: 900; }
          .items-table td { padding: 2px 0; }
          .total-box {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            font-weight: 900;
            border-top: 1px dashed #000000;
            border-bottom: 1px dashed #000000;
            padding: 3px 0;
            margin: 4px 0;
          }
          .status-badge {
            font-size: 9.5px;
            font-weight: 900;
            margin-top: 4px;
            border: 1px solid #000;
            padding: 2px;
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

  // Filtered active products for search in creation modal
  const filteredProductsForSelect = products
    .filter((p) => p.status === 'active')
    .filter((p) => {
      if (!itemSearchQuery.trim()) return true;
      const q = itemSearchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q)
      );
    });

  return (
    <div className="space-y-4 text-black">
      {/* Scan notification banner */}
      {scanMessage && (
        <div
          className={`p-3 rounded-2xl border text-xs font-black flex items-center justify-between shadow-2xs animate-in fade-in duration-150 ${
            scanMessage.type === 'success'
              ? 'bg-amber-100 border-amber-500 text-amber-950'
              : 'bg-rose-100 border-rose-400 text-rose-950'
          }`}
        >
          <span>{scanMessage.text}</span>
          <button onClick={() => setScanMessage(null)} className="text-xs font-bold underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Duplicate Print Warning Modal Dialog */}
      {duplicateWarningToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 border-2 border-amber-500 max-w-md w-full shadow-2xl space-y-4 text-black">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-900 border border-amber-400 flex items-center justify-center font-black">
                <ShieldAlert className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase text-black">Duplicate Print Warning</h4>
                <p className="text-xs text-slate-600 font-bold">
                  Token #{duplicateWarningToken.tokenNumber} ({duplicateWarningToken.tokenCode})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-700 font-medium bg-amber-50 p-3 rounded-2xl border border-amber-200">
              ⚠️ This token has <strong>ALREADY BEEN PRINTED</strong> previously. Direct print is configured for 1-time original slip issuance. Are you sure you want to print a <strong>DUPLICATE</strong> copy?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDuplicateWarningToken(null)}
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeDirectPrintToken(duplicateWarningToken, true)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black border border-amber-600 font-black text-xs cursor-pointer shadow-2xs"
              >
                Print Duplicate Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Duplicate Warning Modal Dialog */}
      {duplicateWarningBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 border-2 border-amber-500 max-w-md w-full shadow-2xl space-y-4 text-black">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-900 border border-amber-400 flex items-center justify-center font-black">
                <ShieldAlert className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase text-black">Batch Duplicate Print Warning</h4>
                <p className="text-xs text-slate-600 font-bold">
                  Printing {duplicateWarningBatch.length} tokens
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-700 font-medium bg-amber-50 p-3 rounded-2xl border border-amber-200">
              ⚠️ One or more tokens in this batch have <strong>ALREADY BEEN PRINTED</strong>. Proceed with printing duplicate copies?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDuplicateWarningBatch(null)}
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeDirectPrintMultiTokens(duplicateWarningBatch, true)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-black border border-amber-600 font-black text-xs cursor-pointer shadow-2xs"
              >
                Print Duplicate Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Bar: Barcode Scanner Station & Quick Creation */}
      <div className="bg-white border-2 border-amber-500/80 rounded-3xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Barcode Scanner Input for fast auto-completion at food counter */}
          <div className="relative flex-1 min-w-[280px] max-w-lg">
            <Scan className="w-4 h-4 text-amber-600 absolute left-3 top-1/2 -translate-y-1/2 animate-pulse" />
            <input
              ref={scanInputRef}
              id="token-barcode-scanner"
              type="text"
              placeholder="Scan Barcode on Token Slip with Scanner Gun to Auto-Complete..."
              value={barcodeScanInput}
              onChange={(e) => setBarcodeScanInput(e.target.value)}
              onKeyDown={handleBarcodeScanSubmit}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-amber-50/60 border-2 border-amber-400 text-xs font-black text-black placeholder:text-slate-500 focus:outline-amber-600 shadow-2xs"
            />
          </div>

          {/* Search Token by customer name, token #, items */}
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search token #, name, food item..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-8 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {filteredTokens.length > 0 && (
            <button
              type="button"
              onClick={() => handleDirectPrintMultiTokens(filteredTokens)}
              className="px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-black border border-slate-300 font-extrabold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95 transition-all"
              title="Print all tokens currently in this list"
            >
              <Printer className="w-4 h-4 text-amber-600" />
              <span>Print All ({filteredTokens.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-extrabold text-xs flex items-center gap-2 shadow-2xs cursor-pointer active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4 text-amber-600" /> Create &amp; Print Token Slip
          </button>
        </div>
      </div>

      {/* Tabs bar with counters */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setActiveTab('PENDING');
            setSearchTerm('');
          }}
          className={`px-4 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'PENDING' && !searchTerm
              ? 'bg-white border-2 border-amber-500 text-amber-950 font-black shadow-2xs'
              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>Pending Tokens</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300 text-[10px] font-black">
            {pendingCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('COMPLETED');
            setSearchTerm('');
          }}
          className={`px-4 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'COMPLETED' && !searchTerm
              ? 'bg-white border-2 border-amber-500 text-amber-950 font-black shadow-2xs'
              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
          <span>Completed / Claimed Meals</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 text-[10px] font-black">
            {completedCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('ALL');
            setSearchTerm('');
          }}
          className={`px-4 py-2 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ${
            activeTab === 'ALL' && !searchTerm
              ? 'bg-white border-2 border-amber-500 text-amber-950 font-black shadow-2xs'
              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span>All Tokens ({tokens.length})</span>
        </button>
      </div>

      {/* Tokens List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredTokens.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-3xl border border-slate-200 p-6">
            <Ticket className="w-12 h-12 mx-auto mb-2 text-amber-500 opacity-40" />
            <div className="font-bold text-sm text-black">
              {searchTerm ? `No tokens matching "${searchTerm}"` : `No ${activeTab.toLowerCase()} tokens found`}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Click &quot;Create &amp; Print Token Slip&quot; or scan barcode to view tokens.
            </div>
          </div>
        ) : (
          filteredTokens.map((token) => {
            const isPending = token.status === 'PENDING';
            const isPrinted = printedTokenIds.has(token.id);

            return (
              <div
                key={token.id}
                className={`bg-white border rounded-3xl p-4 shadow-2xs flex flex-col justify-between space-y-3 transition-all ${
                  isPending
                    ? 'border-amber-300 hover:border-amber-500 bg-amber-50/20'
                    : 'border-slate-200 opacity-90'
                }`}
              >
                {/* Header with Token Number & Status */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-12 h-12 rounded-2xl bg-white border-2 border-amber-500 text-black flex flex-col items-center justify-center font-black shadow-2xs">
                      <span className="text-[10px] text-slate-500 font-bold leading-none">NO</span>
                      <span className="text-lg font-black leading-none">#{token.tokenNumber}</span>
                    </div>
                    <div>
                      <div className="font-black text-xs text-black flex items-center gap-1.5 flex-wrap">
                        <span>{token.customerName || 'Meal Token'}</span>
                        {token.batchCount && (
                          <span className="text-[9.5px] font-extrabold text-amber-950 bg-amber-200/90 border border-amber-400 px-1.5 py-0.2 rounded-md">
                            Bulk ({token.batchIndex || 1}/{token.batchCount})
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono font-bold flex items-center gap-1.5 mt-0.5">
                        <span>{token.tokenCode}</span>
                        <span className="text-[10px] text-slate-400 font-sans font-medium">
                          ({token.businessDate || token.date} {token.time})
                        </span>
                      </div>
                    </div>
                  </div>

                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-black border uppercase shadow-2xs ${
                      isPending
                        ? 'bg-amber-100 border-amber-400 text-amber-950 animate-pulse'
                        : 'bg-emerald-50 border-emerald-400 text-emerald-950'
                    }`}
                  >
                    {token.status}
                  </span>
                </div>

                {/* Items List */}
                <div className="bg-white border border-slate-200 rounded-2xl p-2.5 space-y-1 text-xs">
                  {(token.items || []).map((it, idx) => (
                    <div key={idx} className="flex justify-between items-center text-slate-700">
                      <span className="font-bold text-black truncate max-w-[180px]">
                        {it.qty}x {it.name}
                      </span>
                      <span className="font-extrabold text-black">
                        {formatMoney(it.price * it.qty, currency)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Payment & Action Footer */}
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-black text-black">
                      {formatMoney(token.totalAmount || token.grandTotal || 0, currency)}
                    </div>
                    {token.paymentStatus === 'PAID' ? (
                      <div className="text-[10px] font-extrabold text-emerald-700 flex items-center gap-1">
                        <span>✓ Paid in Advance</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (onUpdateTokenPayment) {
                            onUpdateTokenPayment(token.id, 'PAID');
                          }
                        }}
                        className="text-[10px] font-black text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 px-1.5 py-0.5 rounded-md cursor-pointer transition-colors"
                        title="Click to mark as Paid"
                      >
                        ⚠ Pay on Collection (Click to Mark Paid)
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDirectPrintToken(token)}
                      className={`p-2 rounded-xl border text-black cursor-pointer shadow-2xs flex items-center gap-1.5 transition-colors ${
                        isPrinted
                          ? 'bg-amber-50 hover:bg-amber-100 border-amber-400 text-amber-950 font-black text-[10px]'
                          : 'bg-white hover:bg-slate-100 border-slate-300'
                      }`}
                      title={
                        isPrinted
                          ? 'Token was already printed once. Click to print duplicate copy.'
                          : 'Direct Print Token Slip (1-Time Original)'
                      }
                    >
                      <Printer className="w-4 h-4 text-amber-600" />
                      {isPrinted && (
                        <span className="text-[9px] font-black uppercase bg-amber-200/90 text-amber-950 px-1 py-0.2 rounded">
                          Duplicate
                        </span>
                      )}
                    </button>

                    {isPending ? (
                      <div className="px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-400 text-amber-950 font-black text-[10px] flex items-center gap-1.5 shadow-2xs select-none">
                        <Scan className="w-3.5 h-3.5 text-amber-700 animate-pulse" />
                        <span>Scan Barcode to Complete</span>
                      </div>
                    ) : (
                      <div className="px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-400 text-emerald-950 font-black text-[10px] flex items-center gap-1.5 shadow-2xs select-none">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Verified &amp; Claimed</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* CREATE TOKEN MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden text-black">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-amber-600" />
                <h3 className="font-extrabold text-base text-black">Create Food Pre-Order Token</h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-black cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 max-h-[70vh] overflow-y-auto space-y-4">
              {/* BULK TOKEN QUANTITY PICKER */}
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-400">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-black text-amber-950 uppercase flex items-center gap-1.5 text-xs">
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
                    placeholder="e.g. 20, 100"
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
                        <div className="text-[10px] opacity-80">Summary voucher for {tokenQuantity} meals</div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Meal & Customer info */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">
                    Meal Type (කෑම වේල)
                  </label>
                  <select
                    value={mealType}
                    onChange={(e) => setMealType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black focus:outline-amber-500"
                  >
                    <option value="BREAKFAST">🌅 Breakfast (උදෑසන)</option>
                    <option value="LUNCH">☀️ Lunch (දිවා ආහාරය)</option>
                    <option value="DINNER">🌙 Dinner (රාත්‍රී ආහාරය)</option>
                    <option value="SNACKS">☕ Snacks &amp; Tea (තේ / කෙටි කෑම)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase block mb-1">
                    Customer / Ref Name (නම)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Kasun / Table 2"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500"
                  />
                </div>
              </div>

              {/* Item Search & Dropdown Selection */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-black flex items-center gap-1.5 uppercase tracking-wide">
                    <Utensils className="w-3.5 h-3.5 text-amber-600" />
                    <span>Select Food Item (කෑම වර්ගය සොයන්න / තෝරන්න)</span>
                  </label>
                  <span className="text-[11px] font-bold text-slate-500">
                    {filteredProductsForSelect.length} items available
                  </span>
                </div>

                {/* Search Food Item input with Instant Enter Key Add */}
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search / Filter item (e.g. Rice, Kottu, Tea, Barcode)... [Press Enter to Add]"
                      value={itemSearchQuery}
                      onChange={(e) => {
                        setItemSearchQuery(e.target.value);
                        if (e.target.value.trim() && filteredProductsForSelect.length > 0) {
                          setSelectedProductId(filteredProductsForSelect[0].id);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (selectedProductId) {
                            handleAddProductItem();
                          } else if (filteredProductsForSelect.length > 0) {
                            handleAddProductItem(filteredProductsForSelect[0]);
                          }
                        }
                      }}
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black focus:outline-amber-500 shadow-2xs"
                    />
                    {itemSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setItemSearchQuery('');
                          setSelectedProductId('');
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold px-1"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Quick-select matched search result tags for 1-click addition */}
                  {itemSearchQuery.trim() && filteredProductsForSelect.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {filteredProductsForSelect.slice(0, 5).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleAddProductItem(p)}
                          className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 border border-amber-300 text-[11px] font-black text-amber-950 flex items-center gap-1 cursor-pointer transition-all active:scale-95 shadow-2xs"
                        >
                          <Plus className="w-3 h-3 text-amber-900" />
                          <span>{p.name}</span>
                          <span className="opacity-75">({formatMoney(p.sellPrice, currency)})</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Dropdown Menu Selection & Quantity Controls */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-200/80">
                  <div className="flex-1 min-w-0">
                    <select
                      value={selectedProductId}
                      onChange={(e) => setSelectedProductId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black focus:outline-amber-500 shadow-2xs truncate"
                    >
                      <option value="">-- Choose Item from Dropdown / කෑම තෝරන්න --</option>
                      {products
                        .filter((p) => p.status === 'active')
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {formatMoney(p.sellPrice, currency)} {p.category ? `[${p.category}]` : ''}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Quantity controls */}
                  <div className="flex items-center border border-slate-300 bg-white rounded-xl overflow-hidden shadow-2xs shrink-0">
                    <button
                      type="button"
                      onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                      className="px-2.5 py-1.5 hover:bg-slate-100 text-xs font-black text-black cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={itemQuantity}
                      onChange={(e) => setItemQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-8 text-center text-xs font-black text-black focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setItemQuantity(itemQuantity + 1)}
                      className="px-2.5 py-1.5 hover:bg-slate-100 text-xs font-black text-black cursor-pointer"
                    >
                      +
                    </button>
                  </div>

                  {/* Add button */}
                  <button
                    type="button"
                    onClick={() => handleAddProductItem()}
                    disabled={!selectedProductId}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black border border-amber-600 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all active:scale-95 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 text-black" />
                    <span>Add Item</span>
                  </button>
                </div>
              </div>

              {/* Pre-ordered Items List */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-black text-black uppercase tracking-wider block">
                    Added Token Items ({tokenItems.length})
                  </label>
                  {tokenItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTokenItems([])}
                      className="text-[11px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                {tokenItems.length === 0 ? (
                  <div className="p-3.5 border border-dashed border-slate-300 rounded-2xl text-center text-xs text-slate-500 font-medium bg-white">
                    No food items added to this token yet. Search and select from the menu items above.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                    {tokenItems.map((item, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between text-xs text-black">
                        <div>
                          <div className="font-bold text-black">{item.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {item.qty} x {formatMoney(item.price, currency)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-black">
                            {formatMoney(item.qty * item.price, currency)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payment details */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Payment Status
                  </label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black"
                  >
                    <option value="PAID">Paid in Advance</option>
                    <option value="UNPAID">Pay on Collection</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black"
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="CREDIT">Credit</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between">
              <div>
                <div className="text-sm font-black text-black">
                  Total: {formatMoney(tokenItems.reduce((s, i) => s + i.price * i.qty, 0) * tokenQuantity, currency)}
                </div>
                {tokenQuantity > 1 && (
                  <div className="text-[10px] text-slate-500 font-bold">
                    ({tokenQuantity} tokens x {formatMoney(tokenItems.reduce((s, i) => s + i.price * i.qty, 0), currency)})
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-black font-bold text-xs cursor-pointer shadow-2xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateToken}
                  className="px-5 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-extrabold text-xs shadow-xs cursor-pointer"
                >
                  {tokenQuantity > 1 ? `Issue & Print ${tokenQuantity} Tokens` : 'Issue & Print Token Slip'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
