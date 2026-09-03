import React, { useState } from 'react';
import { Register, Sale, CashMovement, DailyClosingReport, AuthSession, CompanySettings, TokenOrder } from '../types/pos';
import { formatMoney, uid, getNowParts } from '../services/storage';
import { directPrintService } from '../services/directPrintService';
import { emailService } from '../services/emailService';
import {
  Lock,
  Mail,
  Printer,
  X,
  Send,
  Copy,
  LogOut,
  ExternalLink,
  CheckCircle2,
  Zap,
  AlertCircle,
  Ticket,
  DollarSign,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

interface CloseSaleModalProps {
  isOpen?: boolean;
  activeRegister?: Register | null;
  sales: Sale[];
  tokens?: TokenOrder[];
  cashMovements?: CashMovement[];
  session?: AuthSession | null;
  currency?: string;
  reportEmailRecipient?: string;
  onClose: () => void;
  onConfirmClose?: (report: DailyClosingReport) => void;
  onCloseRegister?: (countedCash: number, denomCounts: { [key: number]: number }, notes: string) => void;
  onLogout?: () => void;
}

const DENOMS = [5000, 2000, 1000, 500, 100, 50, 20, 10, 5, 2, 1];

export const CloseSaleModal: React.FC<CloseSaleModalProps> = ({
  isOpen = true,
  activeRegister,
  sales,
  tokens = [],
  cashMovements = [],
  session,
  currency = 'Rs.',
  reportEmailRecipient = '',
  onClose,
  onConfirmClose,
  onCloseRegister,
  onLogout
}) => {
  const [denomCounts, setDenomCounts] = useState<{ [denom: number]: number }>({
    5000: 0,
    2000: 0,
    1000: 0,
    500: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
    5: 0,
    2: 0,
    1: 0
  });
  const [manualCount, setManualCount] = useState<string>('');
  const [useManual, setUseManual] = useState(true);
  const [nextShiftFloat, setNextShiftFloat] = useState<string>(
    String(activeRegister?.openingFloat || 0)
  );
  const [closingNote, setClosingNote] = useState('');

  // Direct Print & Warning state
  const [printCount, setPrintCount] = useState<number>(0);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState<boolean>(false);

  // Email state
  const [recipientChoice, setRecipientChoice] = useState<'SELECT' | 'CUSTOM'>('SELECT');
  const [selectedRecipientEmail, setSelectedRecipientEmail] = useState<string>(
    reportEmailRecipient || 'superservpos@gmail.com'
  );
  const [customRecipientEmail, setCustomRecipientEmail] = useState<string>('');
  const [customSubject, setCustomSubject] = useState<string>('');
  const [emailStatusToast, setEmailStatusToast] = useState<string | null>(null);

  if (isOpen === false) return null;

  const now = getNowParts();
  const regUnitCode = activeRegister?.unitCode || session?.unitCode || 'Counter';
  const regUnitName = activeRegister?.unitName || session?.unitName || session?.unitCode || 'Counter';
  const regDate = activeRegister?.businessDate || activeRegister?.date || now.date;
  const regFloat = activeRegister?.openingFloat || 0;
  const regCashier = activeRegister?.cashier || session?.user || 'Cashier';
  const regId = activeRegister?.id || 'reg_active';

  // Filter sales accurately for this register / shift
  const registerSalesAll = sales.filter((s) => {
    if (activeRegister && s.registerId) {
      return s.registerId === activeRegister.id;
    }
    return s.unitCode === regUnitCode && s.date === regDate;
  });

  // Exclude voided sales from financial calculations
  const registerSales = registerSalesAll.filter((s) => !s.isVoided && s.status !== 'VOIDED');
  const voidedSales = registerSalesAll.filter((s) => s.isVoided || s.status === 'VOIDED');
  const voidedSalesTotal = voidedSales.reduce((sum, s) => sum + (s.grandTotal || 0), 0);

  // Filter tokens created in this shift
  const registerTokens = tokens.filter((t) => {
    return (t.businessDate === regDate || t.date === regDate) && (t.unitCode === regUnitCode || !t.unitCode);
  });

  const registerMovements = cashMovements.filter((m) => {
    if (activeRegister && m.registerId) {
      return m.registerId === activeRegister.id;
    }
    return (m.unit === regUnitCode || m.cashier === regCashier) && m.date === regDate;
  });

  const cashInTotal = registerMovements
    .filter((m) => m.type === 'CASH_IN' || m.type === 'IN')
    .reduce((sum, m) => sum + m.amount, 0);

  const cashOutTotal = registerMovements
    .filter((m) => m.type === 'CASH_OUT' || m.type === 'OUT')
    .reduce((sum, m) => sum + m.amount, 0);

  let totalSales = 0;
  let cashSales = 0;
  let cardSales = 0;
  let creditSales = 0;
  let mixedSales = 0;

  registerSales.forEach((s) => {
    totalSales += s.grandTotal;
    if (s.paymentMethod === 'CASH') {
      cashSales += s.grandTotal;
    } else if (s.paymentMethod === 'CARD') {
      cardSales += s.grandTotal;
    } else if (s.paymentMethod === 'CREDIT') {
      creditSales += s.grandTotal;
    } else if (s.paymentMethod === 'CASH+CARD') {
      mixedSales += 1;
      cashSales += s.cashAmount || 0;
      cardSales += s.cardAmount || 0;
    }
  });

  // Token Metrics
  const tokenCount = registerTokens.length;
  const tokenRevenue = registerTokens.reduce((sum, t) => sum + (t.totalAmount || t.grandTotal || 0), 0);
  const tokenCompletedCount = registerTokens.filter((t) => t.status === 'COMPLETED').length;

  // Expected cash in drawer formula: Opening Float + Total Cash Sales + Cash In - Cash Out
  const expectedCashInDrawer = regFloat + cashSales + cashInTotal - cashOutTotal;

  const countedDenomTotal = Object.entries(denomCounts).reduce(
    (sum, [denom, count]) => sum + Number(denom) * (Number(count) || 0),
    0
  );

  const actualCash = useManual
    ? manualCount !== ''
      ? parseFloat(manualCount) || 0
      : expectedCashInDrawer
    : countedDenomTotal;

  const difference = actualCash - expectedCashInDrawer;

  const nextFloatNum = parseFloat(nextShiftFloat) || 0;
  const safeDepositAmount = Math.max(0, actualCash - nextFloatNum);

  const handleDenomChange = (denom: number, val: string) => {
    const qty = Math.max(0, parseInt(val) || 0);
    setDenomCounts((prev) => ({
      ...prev,
      [denom]: qty
    }));
  };

  const handleCloseAndLogout = () => {
    const closeNow = getNowParts();
    const closingReport: DailyClosingReport = {
      id: uid('close'),
      registerId: regId,
      businessDate: regDate,
      date: regDate,
      unitCode: regUnitCode,
      unitName: regUnitName,
      cashier: regCashier,
      status: 'CLOSED',
      expectedCash: expectedCashInDrawer,
      actualCash: actualCash,
      difference: difference,
      totalSales: totalSales,
      cashSales: cashSales,
      cardSales: cardSales,
      creditSales: creditSales,
      mixedSales: mixedSales,
      cashIn: cashInTotal,
      cashOut: cashOutTotal,
      openingFloat: regFloat,
      transactionCount: registerSales.length,
      tokenCount: tokenCount,
      denominationCounts: denomCounts,
      closedAt: closeNow.iso,
      closedBy: session?.user || 'Cashier',
      notes: closingNote.trim() || undefined,
      note: closingNote.trim() || undefined
    };

    if (onConfirmClose) {
      onConfirmClose(closingReport);
    }
    if (onCloseRegister) {
      onCloseRegister(actualCash, denomCounts, closingNote);
    }
    if (onLogout) {
      onLogout();
    }
    onClose();
  };

  const getEffectiveEmail = () => {
    if (recipientChoice === 'CUSTOM') {
      return customRecipientEmail.trim() || 'superservpos@gmail.com';
    }
    return selectedRecipientEmail.trim() || reportEmailRecipient || 'superservpos@gmail.com';
  };

  const generateReportText = () => {
    return `
========================================
DAILY POS REGISTER CLOSING REPORT (Z-REPORT)
========================================
Counter:       ${regUnitCode} (${regUnitName})
Cashier:       ${regCashier}
Business Date: ${regDate}
Closing Time:  ${getNowParts().time}
----------------------------------------
SHIFT BALANCE & FINANCIAL AUDIT:
----------------------------------------
Opening Cash Float:       ${formatMoney(regFloat, currency)}
Total Revenue (Sales):    ${formatMoney(totalSales, currency)}

PAYMENT BREAKDOWN:
- Cash Sales:             ${formatMoney(cashSales, currency)}
- Card Sales:             ${formatMoney(cardSales, currency)}
- Credit Sales:           ${formatMoney(creditSales, currency)}
- Mixed (Cash+Card):      ${mixedSales} bills

CASH MOVEMENTS:
- Cash In (+):            ${formatMoney(cashInTotal, currency)}
- Cash Out (-):           ${formatMoney(cashOutTotal, currency)}

DRAWER & SHIFT BALANCING:
- Expected Drawer Cash:   ${formatMoney(expectedCashInDrawer, currency)}
- Shift Balance (Counted):${formatMoney(actualCash, currency)}
- Variance / Diff:        ${difference >= 0 ? '+' : ''}${formatMoney(difference, currency)} (${
      difference === 0 ? 'EXACT MATCH' : difference > 0 ? 'OVERAGE' : 'SHORTAGE'
    })

SHIFT HANDOVER ALLOCATION:
- Next Shift Float:       ${formatMoney(nextFloatNum, currency)}
- Safe Handover / Owner:  ${formatMoney(safeDepositAmount, currency)}

TOKEN & MEAL ORDERS:
- Total Tokens Issued:    ${tokenCount}
- Tokens Revenue:         ${formatMoney(tokenRevenue, currency)}
- Claimed / Completed:    ${tokenCompletedCount} / ${tokenCount}

TRANSACTION METRICS:
- Active Sales Invoices:  ${registerSales.length}
- Voided Transactions:   ${voidedSales.length} (${formatMoney(voidedSalesTotal, currency)})
- Notes / Remarks:        ${closingNote || 'Shift balanced and closed successfully.'}

========================================
Generated by POS System on ${getNowParts().date} ${getNowParts().time}
    `.trim();
  };

  // Open mail client
  const handleDispatchEmail = (type: 'gmail' | 'outlook' | 'yahoo' | 'mailto') => {
    const to = getEffectiveEmail();
    if (!to) {
      setEmailStatusToast('Please enter or select a recipient email address.');
      setTimeout(() => setEmailStatusToast(null), 3000);
      return;
    }
    const subject = customSubject.trim() || `Daily POS Shift Close Report - ${regUnitCode} (${regDate})`;
    const body = generateReportText();

    emailService.openEmailClient(type, to, subject, body);

    const labels: Record<string, string> = {
      gmail: 'Google Gmail (Web)',
      outlook: 'Outlook (Web)',
      yahoo: 'Yahoo Mail',
      mailto: 'Default Email Client'
    };

    setEmailStatusToast(`Dispatched via ${labels[type]} for ${to}!`);
    setTimeout(() => setEmailStatusToast(null), 4000);
  };

  const handleCopyReportToClipboard = () => {
    navigator.clipboard.writeText(generateReportText());
    setEmailStatusToast('Report text copied to clipboard!');
    setTimeout(() => setEmailStatusToast(null), 3000);
  };

  const executePrintZReport = async (isDuplicate: boolean = false) => {
    setPrintCount((prev) => prev + 1);
    setShowDuplicateWarning(false);
    setEmailStatusToast(isDuplicate ? 'Printing DUPLICATE Z-Report slip...' : 'Sending Z-Report directly to physical POS printer...');

    const reportData: DailyClosingReport = {
      id: uid(),
      date: regDate,
      businessDate: regDate,
      registerId: regId,
      unitCode: regUnitCode,
      unitName: regUnitName,
      cashier: regCashier,
      openingFloat: regFloat,
      totalSales,
      cashSales,
      cardSales,
      creditSales,
      cashIn: cashInTotal,
      cashOut: cashOutTotal,
      expectedCash: expectedCashInDrawer,
      actualCash,
      difference,
      notes: closingNote,
      transactionCount: registerSales.length,
      tokenCount: tokenCount,
      closedAt: new Date().toISOString()
    };

    const mockSettings: CompanySettings = {
      name: regUnitName || 'SUPER SERV POS',
      address: '',
      phone: '',
      currency: currency,
      footer: isDuplicate ? '** DUPLICATE COPY ** Shift closed & audited.' : 'Shift successfully closed & audited.',
      receiptSize: '80'
    };

    try {
      const result = await directPrintService.printZReport(reportData, mockSettings);
      if (result.success) {
        setEmailStatusToast(isDuplicate ? 'Duplicate Z-Report sent to printer!' : 'Z-Report sent directly to physical printer!');
      } else {
        // Fallback to browser iframe print
        let iframe = document.getElementById('z-report-print-frame') as HTMLIFrameElement;
        if (!iframe) {
          iframe = document.createElement('iframe');
          iframe.id = 'z-report-print-frame';
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
          doc.open();
          doc.write(`
            <!doctype html>
            <html>
            <head>
              <title>Z-Report - ${regUnitCode}</title>
              <style>
                @page { size: 80mm auto; margin: 0; }
                body {
                  width: 80mm;
                  margin: 0;
                  padding: 8px 12px;
                  font-family: 'Courier New', Courier, monospace;
                  font-size: 12px;
                  line-height: 1.35;
                  color: #000;
                  background: #fff;
                }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .font-bold { font-weight: bold; }
                .divider { border-top: 1px dashed #000; margin: 6px 0; }
                .double-divider { border-top: 2px solid #000; margin: 6px 0; }
                .row { display: flex; justify-content: space-between; }
                .badge { display: inline-block; padding: 2px 6px; border: 1px solid #000; font-size: 10px; font-weight: bold; }
              </style>
            </head>
            <body>
              <div class="text-center font-bold" style="font-size: 15px;">Z-REPORT / SHIFT CLOSE</div>
              ${isDuplicate ? '<div class="text-center badge">** DUPLICATE COPY **</div>' : ''}
              <div class="text-center font-bold">${regUnitName || 'SUPER SERV POS'}</div>
              <div class="text-center" style="font-size: 10px;">Counter: ${regUnitCode} | Cashier: ${regCashier}</div>
              <div class="text-center" style="font-size: 10px;">Date: ${regDate} ${new Date().toLocaleTimeString()}</div>
              <div class="double-divider"></div>
              <div class="row"><span>Opening Float:</span><span>${formatMoney(regFloat, currency)}</span></div>
              <div class="row font-bold"><span>Gross Sales:</span><span>${formatMoney(totalSales, currency)}</span></div>
              <div class="row" style="padding-left: 8px;"><span>- Cash Sales:</span><span>${formatMoney(cashSales, currency)}</span></div>
              <div class="row" style="padding-left: 8px;"><span>- Card Sales:</span><span>${formatMoney(cardSales, currency)}</span></div>
              <div class="row" style="padding-left: 8px;"><span>- Credit Sales:</span><span>${formatMoney(creditSales, currency)}</span></div>
              ${voidedSales.length > 0 ? `<div class="row" style="padding-left: 8px; color: #666;"><span>- Voided (${voidedSales.length}):</span><span>${formatMoney(voidedSalesTotal, currency)}</span></div>` : ''}
              <div class="divider"></div>
              <div class="row"><span>Petty Cash In:</span><span>+${formatMoney(cashInTotal, currency)}</span></div>
              <div class="row"><span>Cash Out / Exp:</span><span>-${formatMoney(cashOutTotal, currency)}</span></div>
              <div class="divider"></div>
              <div class="row font-bold"><span>Expected Cash:</span><span>${formatMoney(expectedCashInDrawer, currency)}</span></div>
              <div class="row font-bold"><span>Shift Balance:</span><span>${formatMoney(actualCash, currency)}</span></div>
              <div class="row font-bold"><span>Discrepancy:</span><span>${difference >= 0 ? '+' : ''}${formatMoney(difference, currency)}</span></div>
              <div class="divider"></div>
              <div class="row"><span>Next Shift Float:</span><span>${formatMoney(nextFloatNum, currency)}</span></div>
              <div class="row font-bold"><span>Safe Handover:</span><span>${formatMoney(safeDepositAmount, currency)}</span></div>
              <div class="divider"></div>
              <div class="row"><span>Tokens Issued:</span><span>${tokenCount} (${formatMoney(tokenRevenue, currency)})</span></div>
              <div class="double-divider"></div>
              <div class="text-center" style="font-size: 10px;">Shift closed & audited successfully.</div>
            </body>
            </html>
          `);
          doc.close();
          setTimeout(() => {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          }, 250);
        }
        setEmailStatusToast('Printing Z-Report via system print...');
      }
    } catch (err: any) {
      console.warn('Z-report print notice:', err?.message || err);
      setEmailStatusToast('Prepared Z-Report for printing.');
    }
    setTimeout(() => setEmailStatusToast(null), 3500);
  };

  const handleDirectPrintClosingReport = () => {
    if (printCount > 0) {
      setShowDuplicateWarning(true);
    } else {
      executePrintZReport(false);
    }
  };

  const PRESET_EMAILS = [
    { label: 'Super Serv POS (Default)', email: 'superservpos@gmail.com' },
    { label: 'Store Owner / Manager', email: reportEmailRecipient || 'superservpos@gmail.com' },
    { label: 'Finance & Audit', email: 'finance@pos.lk' }
  ];

  return (
    <div
      id="close-sale-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-4 overflow-y-auto"
    >
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-auto text-black">
        {/* Modal Top Header */}
        <div className="bg-white text-black border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white border border-amber-500 text-amber-600 flex items-center justify-center font-black shadow-2xs">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="font-black text-base flex items-center gap-2 text-black">
                Close Sale &amp; Shift Balancing (Z-Report)
              </div>
              <div className="text-xs text-slate-500 font-semibold">
                {regUnitCode} • {regUnitName} • Cashier: {regCashier}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-black transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Duplicate Print Warning Modal Dialog */}
        {showDuplicateWarning && (
          <div className="p-4 bg-amber-50 border-b border-amber-300 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0" />
              <div>
                <div className="font-black text-xs">⚠️ Duplicate Print Warning</div>
                <div className="text-[11px] text-amber-900">
                  This Z-Report has ALREADY been printed ({printCount} times). Direct print is intended for 1-time original printing. Print a DUPLICATE copy?
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowDuplicateWarning(false)}
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executePrintZReport(true)}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black border border-amber-600 font-black text-xs cursor-pointer shadow-2xs"
              >
                Print Duplicate Copy
              </button>
            </div>
          </div>
        )}

        {/* Modal Content */}
        <div className="p-6 max-h-[72vh] overflow-y-auto space-y-5 bg-white">
          {/* Summary KPIs Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">Opening Float</span>
              <span className="text-base font-black text-black">
                {formatMoney(regFloat, currency)}
              </span>
            </div>

            <div className="bg-white p-3 rounded-2xl border-2 border-amber-500 shadow-2xs">
              <span className="text-[11px] font-bold text-amber-900 uppercase block">
                Cash Sales
              </span>
              <span className="text-base font-black text-amber-950">
                {formatMoney(cashSales, currency)}
              </span>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-300 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-700 uppercase block">
                Card / Credit
              </span>
              <span className="text-base font-black text-black">
                {formatMoney(cardSales + creditSales, currency)}
              </span>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">Tokens Revenue</span>
              <span className="text-base font-black text-black">
                {formatMoney(tokenRevenue, currency)}
              </span>
            </div>
          </div>

          {/* Voided Sales Audit Alert */}
          {voidedSales.length > 0 && (
            <div className="p-3 bg-slate-50 border border-slate-300 rounded-2xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-700 font-bold">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                <span>Voided Transactions ({voidedSales.length} bills excluded from revenue):</span>
              </div>
              <span className="font-black text-slate-900 line-through">
                {formatMoney(voidedSalesTotal, currency)}
              </span>
            </div>
          )}

          {/* DEDICATED SHIFT BALANCE & CASH DRAWER RECONCILIATION */}
          <div className="bg-white border-2 border-amber-500 rounded-3xl p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-amber-200 pb-2.5">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-600" />
                <span className="text-sm font-black uppercase text-black">
                  Shift Balance &amp; Cash Drawer Reconciliation
                </span>
              </div>
              <button
                type="button"
                onClick={() => setUseManual(!useManual)}
                className="text-xs text-amber-800 font-bold hover:underline cursor-pointer"
              >
                {useManual ? 'Use Denominations Calculator' : 'Quick Shift Balance Input'}
              </button>
            </div>

            {/* Shift Balance Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-black text-black uppercase tracking-wider block mb-1">
                  Shift Balance / Counted Cash in Drawer
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    placeholder={String(expectedCashInDrawer)}
                    value={useManual ? (manualCount !== '' ? manualCount : expectedCashInDrawer) : countedDenomTotal}
                    onChange={(e) => {
                      setUseManual(true);
                      setManualCount(e.target.value);
                    }}
                    className="w-full px-4 py-3 rounded-2xl bg-amber-50/40 border-2 border-amber-500 text-xl font-black text-black focus:outline-amber-600 shadow-2xs"
                  />
                  <span className="absolute right-3 top-3.5 text-xs font-black text-amber-900">
                    {currency}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 mt-1">
                  <span>Expected: {formatMoney(expectedCashInDrawer, currency)}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setUseManual(true);
                      setManualCount(String(expectedCashInDrawer));
                    }}
                    className="text-amber-800 hover:underline cursor-pointer"
                  >
                    Match Expected
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-black uppercase tracking-wider block mb-1">
                  Next Shift Starting Float
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 5000"
                    value={nextShiftFloat}
                    onChange={(e) => setNextShiftFloat(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-300 text-xl font-black text-black focus:outline-amber-600 shadow-2xs"
                  />
                  <span className="absolute right-3 top-3.5 text-xs font-black text-slate-600">
                    {currency}
                  </span>
                </div>
                <div className="text-[11px] font-bold text-slate-500 mt-1">
                  Cash to leave in the till for the incoming cashier.
                </div>
              </div>
            </div>

            {/* Denomination Counter if toggled */}
            {!useManual && (
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="text-xs font-bold text-slate-700">Denomination Counter</div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {DENOMS.map((d) => (
                    <div key={d} className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
                      <span className="text-[10px] font-bold text-slate-500 block mb-0.5">Rs. {d}</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={denomCounts[d] || ''}
                        onChange={(e) => handleDenomChange(d, e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold text-black focus:outline-amber-500"
                      />
                      <div className="text-[10px] font-bold text-amber-800 text-right mt-1">
                        {formatMoney(d * (denomCounts[d] || 0), currency)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reconciliation Variance & Handover Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Difference card */}
              <div
                className={`p-3.5 rounded-2xl border-2 flex items-center justify-between ${
                  difference === 0
                    ? 'bg-white border-amber-500 text-amber-950 shadow-2xs'
                    : difference > 0
                    ? 'bg-white border-blue-600 text-blue-950 shadow-2xs'
                    : 'bg-white border-rose-600 text-rose-950 shadow-2xs'
                }`}
              >
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-black">
                    Discrepancy / Variance
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {difference === 0 ? '✓ Balanced' : difference > 0 ? 'Cash Overage (+)' : 'Cash Shortage (-)'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-black">
                    {difference >= 0 ? '+' : ''}
                    {formatMoney(difference, currency)}
                  </div>
                </div>
              </div>

              {/* Safe Deposit Card */}
              <div className="p-3.5 rounded-2xl border-2 border-emerald-500 bg-emerald-50/20 flex items-center justify-between text-black shadow-2xs">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-black">
                    Safe Deposit / Handover
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Hand over to Owner / Safe
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-emerald-950">
                    {formatMoney(safeDepositAmount, currency)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Closing Notes */}
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
              Shift Closing Notes / Handover Reason (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Shift balanced, Rs. 5000 float kept in drawer, balance handed to safe."
              value={closingNote}
              onChange={(e) => setClosingNote(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-medium text-black focus:outline-amber-500"
            />
          </div>

          {/* EMAIL SENDING PANEL */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 shadow-2xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-black uppercase text-black">
                  Send Closing Report via Email
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRecipientChoice('SELECT')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    recipientChoice === 'SELECT'
                      ? 'bg-white border-2 border-amber-500 text-amber-950 shadow-2xs font-extrabold'
                      : 'bg-white border border-slate-300 text-black hover:bg-slate-50'
                  }`}
                >
                  Select Email
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientChoice('CUSTOM')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    recipientChoice === 'CUSTOM'
                      ? 'bg-white border-2 border-amber-500 text-amber-950 shadow-2xs font-extrabold'
                      : 'bg-white border border-slate-300 text-black hover:bg-slate-50'
                  }`}
                >
                  Type Custom Email
                </button>
              </div>
            </div>

            {recipientChoice === 'SELECT' ? (
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                  Choose Recipient Address
                </label>
                <select
                  value={selectedRecipientEmail}
                  onChange={(e) => setSelectedRecipientEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black focus:outline-amber-500"
                >
                  {PRESET_EMAILS.map((em, idx) => (
                    <option key={idx} value={em.email}>
                      {em.label} ({em.email})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">
                  Type Custom Recipient Email
                </label>
                <input
                  type="email"
                  placeholder="e.g. superservpos@gmail.com / supervisor@store.com"
                  value={customRecipientEmail}
                  onChange={(e) => setCustomRecipientEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-black focus:outline-amber-500"
                />
              </div>
            )}

            {emailStatusToast && (
              <div className="p-2.5 bg-white text-amber-950 border border-amber-500 rounded-xl text-xs font-bold flex items-center gap-1.5 animate-in fade-in shadow-2xs">
                <CheckCircle2 className="w-4 h-4 text-amber-600" />
                {emailStatusToast}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleDispatchEmail('gmail')}
                className="px-3 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-950 border border-rose-400 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
                title="Send via Google Gmail Web Compose"
              >
                <div className="w-4 h-4 rounded bg-rose-600 text-white flex items-center justify-center font-bold text-[10px]">
                  M
                </div>
                <span>Gmail (Web)</span>
              </button>

              <button
                type="button"
                onClick={() => handleDispatchEmail('outlook')}
                className="px-3 py-2 rounded-xl bg-white hover:bg-blue-50 text-blue-950 border border-blue-400 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
                title="Send via Microsoft Outlook Web Compose"
              >
                <div className="w-4 h-4 rounded bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">
                  O
                </div>
                <span>Outlook</span>
              </button>

              <button
                type="button"
                onClick={() => handleDispatchEmail('mailto')}
                className="px-3 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95 cursor-pointer"
                title="Opens default device email app (mailto)"
              >
                <Send className="w-3.5 h-3.5 text-amber-600" />
                <span>Mail App</span>
              </button>

              <button
                type="button"
                onClick={handleCopyReportToClipboard}
                className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-black border border-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title="Copy formatted text to clipboard"
              >
                <Copy className="w-3.5 h-3.5 text-slate-700" />
                <span>Copy Text</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Action Buttons Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={handleDirectPrintClosingReport}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border border-amber-400 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
          >
            <Printer className="w-4 h-4 text-amber-600" /> Print Z-Report Slip {printCount > 0 ? `(${printCount} printed)` : ''}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-black border border-slate-300 font-bold text-xs transition-all cursor-pointer shadow-2xs"
            >
              Cancel
            </button>

            <button
              type="button"
              id="btn-close-shift-logout"
              onClick={handleCloseAndLogout}
              className="px-5 py-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-950 border-2 border-rose-600 font-black text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-98 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-rose-600" /> Close Shift &amp; Sale (Logout)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
