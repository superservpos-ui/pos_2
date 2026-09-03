import React, { useRef, useState } from 'react';
import { Sale, CompanySettings, AuthSession } from '../types/pos';
import { formatMoney } from '../services/storage';
import { directPrintService } from '../services/directPrintService';
import { Printer, Copy, X, PlusCircle, CheckCircle, AlertCircle, Usb, Zap, RefreshCw } from 'lucide-react';

interface ReceiptModalProps {
  sale: Sale | null;
  settings: CompanySettings;
  isOpen?: boolean;
  isPrintCopy?: boolean;
  isCopy?: boolean;
  session?: AuthSession | null;
  onClose: () => void;
  onNewSale?: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  sale,
  settings,
  isOpen = true,
  isPrintCopy = false,
  isCopy = false,
  session,
  onClose,
  onNewSale
}) => {
  const [isCopyMode, setIsCopyMode] = useState(isPrintCopy || isCopy);
  const [printSize, setPrintSize] = useState<'80mm' | '58mm'>(
    settings.receiptSize === '58' ? '58mm' : '80mm'
  );
  const [copiedToast, setCopiedToast] = useState(false);
  const [printFeedback, setPrintFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [directPrintCount, setDirectPrintCount] = useState(0);
  const receiptRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setIsCopyMode(isPrintCopy || isCopy);
    setDirectPrintCount(0);
  }, [isPrintCopy, isCopy, sale?.invoiceNumber]);

  // Keyboard shortcut: Enter to Direct Print, Esc to Close
  React.useEffect(() => {
    if (!isOpen || !sale) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        triggerDirectPrint(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        if (onNewSale) onNewSale();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, sale, printSize, isCopyMode, directPrintCount]);

  if (isOpen === false || !sale) return null;

  // Direct physical hardware printing without window.print() or print preview
  const triggerDirectPrint = async (isCopyParam: boolean = false) => {
    // 2nd click protection for Original Direct Print
    if (!isCopyParam && directPrintCount > 0) {
      setPrintFeedback({
        type: 'error',
        message: '⚠️ Direct Print has already been sent! Duplicate original blocked. Use "Print Copy" if needed. (දෙවන වර Original Direct Print කළ නොහැක - කරුණාකර "Print Copy" ඔබන්න).'
      });
      setTimeout(() => setPrintFeedback(null), 5000);
      return;
    }

    setIsCopyMode(isCopyParam);
    setIsPrinting(true);
    setPrintFeedback({ type: 'info', message: 'Sending receipt directly to physical POS printer...' });

    const activeSettings: CompanySettings = {
      ...settings,
      receiptSize: printSize === '58mm' ? '58' : '80'
    };

    try {
      const result = await directPrintService.printReceipt(sale, activeSettings, isCopyParam);
      if (!isCopyParam) {
        setDirectPrintCount((c) => c + 1);
      }
      if (result.success) {
        setPrintFeedback({
          type: 'success',
          message: result.message || 'Receipt sent directly to physical printer!'
        });
        setTimeout(() => setPrintFeedback(null), 3500);
      } else {
        // Fallback to browser receipt printer if hardware bridge is not active
        handleBrowserPrint();
        setPrintFeedback({
          type: 'info',
          message: 'Printing receipt via system print dialog...'
        });
        setTimeout(() => setPrintFeedback(null), 3000);
      }
    } catch (err: any) {
      console.warn('Direct POS print notice:', err?.message || err);
      handleBrowserPrint();
      setPrintFeedback({
        type: 'info',
        message: 'Printing receipt via system print...'
      });
      setTimeout(() => setPrintFeedback(null), 3000);
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePairUsb = async () => {
    setIsPrinting(true);
    setPrintFeedback({ type: 'info', message: 'Pairing USB Thermal Printer...' });
    const res = await directPrintService.connectUsbPrinter(true);
    setIsPrinting(false);
    if (res.success) {
      setPrintFeedback({
        type: 'success',
        message: `Connected to ${res.deviceName || 'USB POS Printer'}! Printing receipt now...`
      });
      setTimeout(() => {
        triggerDirectPrint(isCopyMode);
      }, 400);
    } else {
      setPrintFeedback({
        type: 'error',
        message: res.error || 'Failed to connect USB printer.'
      });
    }
  };

  const handleBrowserPrint = () => {
    if (!receiptRef.current) return;
    const content = receiptRef.current.innerHTML;
    let iframe = document.getElementById('receipt-browser-print-frame') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'receipt-browser-print-frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
    }
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      const is58 = printSize === '58mm';
      const containerWidth = is58 ? '52mm' : '76mm';
      
      const fontScale = settings.receiptFontSize || 'normal';
      const bodyFontSize = fontScale === 'large' 
        ? (is58 ? '13px' : '15px')
        : fontScale === 'compact'
        ? (is58 ? '10.5px' : '11.5px')
        : (is58 ? '11.5px' : '13px');

      const titleFontSize = fontScale === 'large'
        ? (is58 ? '16px' : '19px')
        : fontScale === 'compact'
        ? (is58 ? '13px' : '15px')
        : (is58 ? '14.5px' : '17px');

      const totalFontSize = fontScale === 'large'
        ? (is58 ? '16px' : '19px')
        : fontScale === 'compact'
        ? (is58 ? '13.5px' : '15.5px')
        : (is58 ? '15px' : '17px');

      const fontFamily = settings.receiptFontFamily === 'mono'
        ? "'Courier New', Courier, monospace"
        : settings.receiptFontFamily === 'compact'
        ? "'Arial Narrow', Arial, sans-serif"
        : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

      const lineStyle = settings.receiptLineStyle === 'dotted'
        ? '1.5px dotted #000'
        : settings.receiptLineStyle === 'solid'
        ? '1.5px solid #000'
        : settings.receiptLineStyle === 'double'
        ? '3px double #000'
        : '1.5px dashed #000';

      const headerAlign = settings.receiptHeaderAlign === 'left' ? 'left' : 'center';

      doc.open();
      doc.write(`
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Receipt - ${sale.invoiceNumber}</title>
          <style>
            @page { size: ${is58 ? '58mm auto' : '80mm auto'}; margin: 0 !important; }
            * { box-sizing: border-box !important; margin: 0; padding: 0; }
            body {
              font-family: ${fontFamily};
              padding: 6px 4px;
              color: #000000;
              font-size: ${bodyFontSize};
              font-weight: 500;
              line-height: 1.35;
              width: ${containerWidth};
              max-width: ${containerWidth};
              margin: 0 auto;
              background: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .header-block { text-align: ${headerAlign}; }
            .text-center { text-align: center; }
            .text-left { text-align: left; }
            .text-right { text-align: right; }
            .font-normal { font-weight: 400; }
            .font-medium { font-weight: 500; }
            .font-semibold { font-weight: 600; }
            .font-bold { font-weight: 700; }
            .font-black { font-weight: 900; }
            .separator { border-bottom: ${lineStyle}; margin: 5px 0; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .items-center { align-items: center; }
            .my-1 { margin-top: 3px; margin-bottom: 3px; }
            .my-2 { margin-top: 5px; margin-bottom: 5px; }
            .text-xs { font-size: ${is58 ? '10.5px' : '11.5px'}; }
            .text-sm { font-size: ${is58 ? '12px' : '13.5px'}; }
            .text-base { font-size: ${titleFontSize}; }
            .text-lg { font-size: ${totalFontSize}; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th { font-weight: 800; color: #000; padding-bottom: 3px; }
            td { font-weight: 500; color: #000; padding: 3px 0; }
            .table-head-sep { border-bottom: ${lineStyle}; }
          </style>
        </head>
        <body>
          ${content}
        </body>
        </html>
      `);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      }, 200);
    }
  };

  const copyReceiptText = () => {
    const text = `
${isCopyMode ? '*** DUPLICATE COPY ***\n' : ''}RECEIPT: ${sale.invoiceNumber}
Unit: ${sale.unitCode || 'UNIT-01'} - ${sale.unitName || settings.name || 'Counter'}
Date: ${sale.date} ${sale.time}
Cashier: ${sale.cashier}
${sale.paymentMethod === 'CREDIT' && sale.department ? `Department: ${sale.department}\n` : ''}----------------------------------------
${sale.items.map((i) => `${i.name} (x${i.qty}) - ${formatMoney(i.qty * i.price, settings.currency)}`).join('\n')}
----------------------------------------
${sale.discount > 0 ? `Discount: -${formatMoney(sale.discount, settings.currency)}\n` : ''}TOTAL: ${formatMoney(sale.grandTotal, settings.currency)}
Payment Mode: ${sale.paymentMethod}
${
  sale.paymentMethod === 'CASH'
    ? `Customer Paid: ${formatMoney(sale.cashReceived || sale.grandTotal, settings.currency)}\nBalance Returned: ${formatMoney(sale.change || 0, settings.currency)}`
    : ''
}
${settings.footer || 'Thank You!'}
    `.trim();

    navigator.clipboard.writeText(text);
    setCopiedToast(true);
    setTimeout(() => setCopiedToast(false), 2500);
  };

  return (
    <div
      id="receipt-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
          if (onNewSale) onNewSale();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 overflow-y-auto cursor-pointer"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-slate-200 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-auto text-black cursor-default"
      >
        {/* Header */}
        <div className="bg-white text-black border-b border-slate-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          {/* LEFT SIDE: Title & Paper Size Selector */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-white border border-amber-500 text-amber-600 flex items-center justify-center font-bold shadow-2xs">
                <Printer className="w-4 h-4" />
              </div>
              <div>
                <div className="font-extrabold text-sm flex items-center gap-2 text-black leading-tight">
                  Sale Receipt
                  {isCopyMode && (
                    <span className="text-[10px] font-black uppercase bg-white text-amber-800 border border-amber-500 px-1.5 py-0.2 rounded-md">
                      DUPLICATE
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 font-mono font-semibold">{sale.invoiceNumber}</div>
              </div>
            </div>

            {/* Paper Size selector on the LEFT SIDE (Requirement) */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-300 text-xs shadow-2xs">
              <button
                type="button"
                onClick={() => setPrintSize('80mm')}
                className={`px-2.5 py-1 rounded-lg font-black text-xs transition-all cursor-pointer ${
                  printSize === '80mm'
                    ? 'bg-amber-500 text-black border border-amber-600 shadow-2xs font-extrabold'
                    : 'text-slate-700 hover:bg-slate-200/80'
                }`}
              >
                80mm
              </button>
              <button
                type="button"
                onClick={() => setPrintSize('58mm')}
                className={`px-2.5 py-1 rounded-lg font-black text-xs transition-all cursor-pointer ${
                  printSize === '58mm'
                    ? 'bg-amber-500 text-black border border-amber-600 shadow-2xs font-extrabold'
                    : 'text-slate-700 hover:bg-slate-200/80'
                }`}
              >
                58mm
              </button>
            </div>
          </div>

          {/* RIGHT SIDE: Toast & Close button */}
          <div className="flex items-center gap-2">
            {copiedToast && (
              <span className="text-xs font-bold text-amber-900 flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-amber-500 shadow-2xs">
                <CheckCircle className="w-3.5 h-3.5 text-amber-600" /> Copied
              </span>
            )}

            <button
              onClick={() => {
                onClose();
                if (onNewSale) onNewSale();
              }}
              title="Close & Next Sale"
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-black transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Live Physical Print Status Feedback Banner */}
        {printFeedback && (
          <div
            className={`px-4 py-2.5 text-xs font-bold flex items-center justify-between gap-2 border-b ${
              printFeedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                : printFeedback.type === 'error'
                ? 'bg-rose-50 text-rose-950 border-rose-300'
                : 'bg-amber-50 text-amber-950 border-amber-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {printFeedback.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : printFeedback.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              ) : (
                <RefreshCw className="w-4 h-4 text-amber-600 shrink-0 animate-spin" />
              )}
              <span>{printFeedback.message}</span>
            </div>

            {printFeedback.type === 'error' && (
              <button
                type="button"
                onClick={handlePairUsb}
                className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-950 border border-rose-400 rounded-lg text-[11px] font-black cursor-pointer shadow-2xs flex items-center gap-1"
              >
                <Usb className="w-3 h-3" /> Connect USB Printer
              </button>
            )}
          </div>
        )}

        {/* Receipt Paper Simulation */}
        <div className="p-4 sm:p-6 bg-slate-50 max-h-[55vh] overflow-y-auto flex justify-center">
          <div
            ref={receiptRef}
            style={{ 
              width: printSize === '58mm' ? '230px' : '310px',
              fontFamily: settings.receiptFontFamily === 'mono' 
                ? "'Courier New', Courier, monospace"
                : settings.receiptFontFamily === 'compact'
                ? "'Arial Narrow', Arial, sans-serif"
                : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
            }}
            className={`bg-white text-black p-4 rounded-2xl shadow-md border border-slate-300 select-text transition-all overflow-hidden ${
              settings.receiptFontSize === 'large'
                ? 'text-sm'
                : settings.receiptFontSize === 'compact'
                ? 'text-[11px]'
                : 'text-xs'
            }`}
          >
            {/* Copy header in preview */}
            {isCopyMode && (
              <div className="border-2 border-dashed border-black bg-white text-amber-950 text-center font-black py-1 px-2 rounded-lg text-xs mb-3 uppercase tracking-wider">
                *** DUPLICATE COPY ***
              </div>
            )}

            {/* Header branding */}
            <div className={`header-block space-y-0.5 pb-2 ${settings.receiptHeaderAlign === 'left' ? 'text-left' : 'text-center'}`}>
              <div className="font-black text-sm tracking-wide text-black uppercase">
                {sale.unitName || settings.name || 'HOTEL & RESTAURANT'}
              </div>
              <div className="font-medium text-[11px] text-slate-700">Terminal: <span className="font-bold text-black">{sale.unitCode || 'UNIT-01'}</span></div>
              {settings.address && <div className="text-[11px] font-normal text-slate-600 truncate">{settings.address}</div>}
              {settings.phone && <div className="text-[11px] font-normal text-slate-600">Tel: {settings.phone}</div>}
            </div>

            <div className="separator" style={{
              borderBottom: settings.receiptLineStyle === 'dotted' ? '1.5px dotted #000' : settings.receiptLineStyle === 'solid' ? '1.5px solid #000' : settings.receiptLineStyle === 'double' ? '3px double #000' : '1.5px dashed #000',
              margin: '6px 0'
            }} />

            {/* Invoice Info */}
            <div className="space-y-0.5">
              <div className="flex justify-between items-center">
                <span className="font-normal text-slate-700">Bill No:</span>
                <span className="font-black text-black font-mono">{sale.invoiceNumber}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-normal text-slate-700">Date/Time:</span>
                <span className="font-medium text-black">
                  {sale.date} {sale.time}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-normal text-slate-700">Cashier:</span>
                <span className="font-medium text-black">{sale.cashier}</span>
              </div>
              {sale.paymentMethod === 'CREDIT' && sale.department && (
                <div className="flex justify-between items-center">
                  <span className="font-normal text-slate-700">Department:</span>
                  <span className="font-bold text-amber-950">{sale.department}</span>
                </div>
              )}
            </div>

            <div className="separator" style={{
              borderBottom: settings.receiptLineStyle === 'dotted' ? '1.5px dotted #000' : settings.receiptLineStyle === 'solid' ? '1.5px solid #000' : settings.receiptLineStyle === 'double' ? '3px double #000' : '1.5px dashed #000',
              margin: '6px 0'
            }} />

            {/* Item Table */}
            <table className="w-full text-left table-fixed">
              <thead>
                <tr className="table-head-sep text-black font-bold" style={{
                  borderBottom: settings.receiptLineStyle === 'dotted' ? '1.5px dotted #000' : settings.receiptLineStyle === 'solid' ? '1.5px solid #000' : settings.receiptLineStyle === 'double' ? '3px double #000' : '1.5px dashed #000'
                }}>
                  <th className="pb-1 font-bold w-[48%] uppercase">Item</th>
                  <th className="pb-1 text-center font-bold w-[24%] uppercase">Qty</th>
                  <th className="pb-1 text-right font-bold w-[28%] uppercase">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sale.items.map((item, idx) => (
                  <tr key={idx} className="py-1">
                    <td className="py-1 pr-1 font-normal text-black break-words">{item.name}</td>
                    <td className="py-1 text-center font-normal text-slate-800 whitespace-nowrap">
                      {item.qty} x {item.price.toFixed(0)}
                    </td>
                    <td className="py-1 text-right font-semibold text-black whitespace-nowrap">
                      {(item.qty * item.price).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="separator" style={{
              borderBottom: settings.receiptLineStyle === 'dotted' ? '1.5px dotted #000' : settings.receiptLineStyle === 'solid' ? '1.5px solid #000' : settings.receiptLineStyle === 'double' ? '3px double #000' : '1.5px dashed #000',
              margin: '6px 0'
            }} />

            {/* Totals */}
            <div className="space-y-1">
              {sale.discount > 0 && (
                <div className="flex justify-between font-normal text-rose-700">
                  <span>Discount:</span>
                  <span className="font-semibold">-{formatMoney(sale.discount, settings.currency)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-sm pt-1 text-black">
                <span>TOTAL:</span>
                <span className="text-base">{formatMoney(sale.grandTotal, settings.currency)}</span>
              </div>
            </div>

            <div className="separator" style={{
              borderBottom: settings.receiptLineStyle === 'dotted' ? '1.5px dotted #000' : settings.receiptLineStyle === 'solid' ? '1.5px solid #000' : settings.receiptLineStyle === 'double' ? '3px double #000' : '1.5px dashed #000',
              margin: '6px 0'
            }} />

            {/* Payment Details */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-normal text-slate-700">Payment Mode:</span>
                <span className="font-bold text-black">{sale.paymentMethod}</span>
              </div>

              {sale.paymentMethod === 'CASH' && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="font-normal text-slate-700">Customer Paid:</span>
                    <span className="font-medium text-black">
                      {formatMoney(sale.cashReceived || sale.grandTotal, settings.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center font-black text-black pt-0.5">
                    <span>Balance Returned:</span>
                    <span className="text-sm">{formatMoney(sale.change || 0, settings.currency)}</span>
                  </div>
                </>
              )}

              {sale.paymentMethod === 'CARD' && (
                <div className="flex justify-between items-center">
                  <span className="font-normal text-slate-700">Card Charged:</span>
                  <span className="font-bold text-black">
                    {formatMoney(sale.cardAmount || sale.grandTotal, settings.currency)}
                  </span>
                </div>
              )}

              {sale.paymentMethod === 'CASH+CARD' && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="font-normal text-slate-700">Cash Portion:</span>
                    <span className="font-medium text-black">{formatMoney(sale.cashAmount || 0, settings.currency)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-normal text-slate-700">Card Portion:</span>
                    <span className="font-medium text-black">{formatMoney(sale.cardAmount || 0, settings.currency)}</span>
                  </div>
                </>
              )}

              {sale.paymentMethod === 'CREDIT' && (
                <div className="flex justify-between items-center">
                  <span className="font-normal text-slate-700">Credit Balance Due:</span>
                  <span className="font-black text-amber-950">
                    {formatMoney(sale.creditAmount || sale.grandTotal, settings.currency)}
                  </span>
                </div>
              )}
            </div>

            <div className="separator" style={{
              borderBottom: settings.receiptLineStyle === 'dotted' ? '1.5px dotted #000' : settings.receiptLineStyle === 'solid' ? '1.5px solid #000' : settings.receiptLineStyle === 'double' ? '3px double #000' : '1.5px dashed #000',
              margin: '6px 0'
            }} />

            {/* Footer */}
            <div className={`pt-1 text-[11px] font-normal text-slate-700 ${settings.receiptHeaderAlign === 'left' ? 'text-left' : 'text-center'}`}>
              <div>{settings.footer || 'Thank You! Please Come Again.'}</div>
            </div>

            {/* Barcode Simulation */}
            <div className="text-center pt-2">
              <div
                className="h-6 bg-repeat-x bg-[length:12px_100%] mx-auto w-3/4 opacity-85"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(90deg, #000, #000 2px, transparent 2px, transparent 4px, #000 4px, #000 7px, transparent 7px, transparent 9px)'
                }}
              />
              <div className="text-[11px] text-slate-700 mt-1 font-mono font-bold">*{sale.invoiceNumber}*</div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copyReceiptText}
              className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-black border border-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <Copy className="w-3.5 h-3.5 text-amber-600" /> Copy Text
            </button>

            <button
              type="button"
              onClick={handleBrowserPrint}
              className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-black border border-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Print via standard system print dialog / save as PDF"
            >
              <Printer className="w-3.5 h-3.5 text-slate-700" /> System / PDF Print
            </button>

            <button
              type="button"
              disabled={isPrinting}
              onClick={() => triggerDirectPrint(true)}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border border-amber-400 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 transition-all disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5 text-amber-600" /> Print Copy
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onNewSale && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNewSale();
                }}
                className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-black border border-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
              >
                <PlusCircle className="w-3.5 h-3.5 text-amber-600" /> Next Sale
              </button>
            )}

            <button
              type="button"
              disabled={isPrinting}
              onClick={() => triggerDirectPrint(false)}
              className="px-5 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 text-xs font-extrabold flex items-center gap-2 shadow-xs cursor-pointer active:scale-95 transition-all disabled:opacity-50"
            >
              <Zap className="w-4 h-4 text-amber-600 fill-amber-500" />
              <span>{isPrinting ? 'Printing...' : 'Direct Print Receipt'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
