import React, { useState, useMemo } from 'react';
import { Sale, Product, DailyClosingReport, CompanySettings, AuthSession, AuthAccount, TokenOrder } from '../types/pos';
import { formatMoney, getNowParts } from '../services/storage';
import { emailService } from '../services/emailService';
import { EmailReportModal } from './EmailReportModal';
import * as XLSX from 'xlsx';
import {
  TrendingUp,
  FileSpreadsheet,
  Printer,
  Mail,
  Calendar,
  CreditCard,
  Banknote,
  DollarSign,
  Package,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowUpDown,
  Store,
  Ticket,
  CheckCircle2,
  Clock,
  Utensils,
  Ban,
  AlertCircle
} from 'lucide-react';

interface ReportsViewProps {
  sales: Sale[];
  tokens?: TokenOrder[];
  products: Product[];
  closingReports: DailyClosingReport[];
  settings: CompanySettings;
  session?: AuthSession | null;
  accounts?: AuthAccount[];
  reportEmailRecipient?: string;
  onSaveReportEmailRecipient?: (email: string) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  sales,
  tokens = [],
  products,
  closingReports,
  settings,
  session,
  accounts = [],
  reportEmailRecipient,
  onSaveReportEmailRecipient
}) => {
  const [unitFilter, setUnitFilter] = useState<string>('ALL');
  const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom' | 'calendar'>('today');
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(getNowParts().date);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [itemSearchTerm, setItemSearchTerm] = useState('');
  const [itemSortBy, setItemSortBy] = useState<'qty' | 'revenue' | 'name'>('qty');

  // Email modal state
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailModalTitle, setEmailModalTitle] = useState('Email POS Sales Report');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  const now = getNowParts();
  const today = now.date;

  // Helper to detect and filter out Unit 1 and LSEG data
  const isUnit1OrLseg = (val?: string) => {
    if (!val) return false;
    const str = val.trim().toLowerCase();
    return (
      str === 'unit 1' ||
      str === 'unit1' ||
      str === 'unit_1' ||
      str === 'lseg' ||
      str.includes('unit 1') ||
      str.includes('unit1') ||
      str.includes('lseg')
    );
  };

  // Remove all Unit 1 & LSEG data completely from all reports calculation
  const cleanSales = useMemo(() => {
    return sales.filter(
      (s) =>
        !isUnit1OrLseg(s.unitCode) &&
        !isUnit1OrLseg(s.unitName) &&
        !isUnit1OrLseg(s.cashier) &&
        !isUnit1OrLseg(s.id)
    );
  }, [sales]);

  const cleanTokens = useMemo(() => {
    return tokens.filter(
      (t) =>
        !isUnit1OrLseg(t.unitCode) &&
        !isUnit1OrLseg(t.unitName) &&
        !isUnit1OrLseg(t.cashier) &&
        !isUnit1OrLseg(t.id)
    );
  }, [tokens]);

  const cleanClosingReports = useMemo(() => {
    return closingReports.filter(
      (c) =>
        !isUnit1OrLseg(c.unitCode) &&
        !isUnit1OrLseg(c.unitName) &&
        !isUnit1OrLseg(c.cashier) &&
        !isUnit1OrLseg(c.registerId) &&
        !isUnit1OrLseg(c.id)
    );
  }, [closingReports]);

  // Distinct units for filter (Only registered active accounts and current clean data, excluding Unit 1 and LSEG)
  const distinctUnits = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((a) => {
      if (a.unitCode && !isUnit1OrLseg(a.unitCode) && !isUnit1OrLseg(a.unitName) && !isUnit1OrLseg(a.id) && !isUnit1OrLseg(a.username)) {
        set.add(a.unitCode.toUpperCase());
      }
    });
    cleanSales.forEach((s) => {
      if (s.unitCode && !isUnit1OrLseg(s.unitCode)) {
        set.add(s.unitCode.toUpperCase());
      }
    });
    if (set.size === 0) {
      set.add('MDS1');
      set.add('MDS2');
      set.add('MDS3');
    }
    return Array.from(set);
  }, [accounts, cleanSales]);

  // Isolate sales according to account or unit filter
  const scopedSales = useMemo(() => {
    if (session?.role === 'CASHIER') {
      const unit = session?.unitCode || 'Counter';
      return cleanSales.filter(
        (s) => s.unitCode === unit || (session?.user && s.cashier === session.user)
      );
    }
    if (unitFilter !== 'ALL') {
      return cleanSales.filter((s) => s.unitCode === unitFilter);
    }
    return cleanSales;
  }, [cleanSales, session, unitFilter]);

  // Isolate tokens according to unit filter
  const scopedTokens = useMemo(() => {
    if (session?.role === 'CASHIER') {
      const unit = session?.unitCode || 'Counter';
      return cleanTokens.filter(
        (t) => t.unitCode === unit || (session?.user && t.cashier === session.user)
      );
    }
    if (unitFilter !== 'ALL') {
      return cleanTokens.filter((t) => t.unitCode === unitFilter);
    }
    return cleanTokens;
  }, [cleanTokens, session, unitFilter]);

  // Isolate daily closing reports according to unit filter
  const scopedClosingReports = useMemo(() => {
    if (session?.role === 'CASHIER') {
      const unit = session?.unitCode || 'Counter';
      return cleanClosingReports.filter(
        (c) => c.unitCode === unit || (session?.user && c.cashier === session.user)
      );
    }
    if (unitFilter !== 'ALL') {
      return cleanClosingReports.filter((c) => c.unitCode === unitFilter);
    }
    return cleanClosingReports;
  }, [cleanClosingReports, session, unitFilter]);

  const getDateRange = () => {
    if (datePreset === 'today') {
      return { from: today, to: today };
    }
    if (datePreset === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yStr = d.toISOString().slice(0, 10);
      return { from: yStr, to: yStr };
    }
    if (datePreset === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return { from: d.toISOString().slice(0, 10), to: today };
    }
    if (datePreset === 'month') {
      const fromStr = `${today.slice(0, 8)}01`;
      return { from: fromStr, to: today };
    }
    if (datePreset === 'calendar') {
      return {
        from: selectedCalendarDate,
        to: selectedCalendarDate
      };
    }
    return {
      from: customFrom || today,
      to: customTo || today
    };
  };

  const { from, to } = getDateRange();

  const allFilteredSales = scopedSales.filter((s) => s.date >= from && s.date <= to);
  
  // Separate active sales from voided/cancelled sales
  const activeSales = allFilteredSales.filter((s) => !s.isVoided && s.status !== 'VOIDED');
  const voidedSales = allFilteredSales.filter((s) => s.isVoided || s.status === 'VOIDED');

  const filteredTokens = scopedTokens.filter((t) => {
    const tDate = t.businessDate || t.date;
    return tDate >= from && tDate <= to;
  });

  // Revenue & Profit strictly computed from active non-voided transactions
  const totalRevenue = activeSales.reduce((sum, s) => sum + s.grandTotal, 0);

  const totalProfit = activeSales.reduce((sum, s) => {
    let cost = 0;
    s.items.forEach((it) => {
      cost += (it.buyPrice || 0) * it.qty;
    });
    return sum + (s.grandTotal - cost);
  }, 0);

  const transactionCount = activeSales.length;
  const avgSale = transactionCount ? totalRevenue / transactionCount : 0;

  // Voided / Cancelled Transactions Metrics
  const voidedCount = voidedSales.length;
  const totalVoidedAmount = voidedSales.reduce((sum, s) => sum + s.grandTotal, 0);

  // Token Metrics
  const tokenTotalRevenue = filteredTokens.reduce((sum, t) => sum + (t.totalAmount || t.grandTotal || 0), 0);
  const tokenCompletedCount = filteredTokens.filter((t) => t.status === 'COMPLETED').length;
  const tokenPendingCount = filteredTokens.filter((t) => t.status === 'PENDING').length;
  const tokenPaidRevenue = filteredTokens
    .filter((t) => t.paymentStatus === 'PAID')
    .reduce((sum, t) => sum + (t.totalAmount || t.grandTotal || 0), 0);

  // Complete Item-wise Sales breakdown (Active Non-Voided Items)
  const itemSalesMap: {
    [name: string]: {
      name: string;
      category: string;
      unitPrice: number;
      qty: number;
      revenue: number;
      profit: number;
    };
  } = {};

  activeSales.forEach((s) => {
    s.items.forEach((it) => {
      const prod = products.find((p) => p.name === it.name);
      const cat = prod?.category || it.category || 'General';
      const buyPrice = it.buyPrice || prod?.buyPrice || 0;

      if (!itemSalesMap[it.name]) {
        itemSalesMap[it.name] = {
          name: it.name,
          category: cat,
          unitPrice: it.price,
          qty: 0,
          revenue: 0,
          profit: 0
        };
      }
      itemSalesMap[it.name].qty += it.qty;
      itemSalesMap[it.name].revenue += it.qty * it.price;
      itemSalesMap[it.name].profit += (it.price - buyPrice) * it.qty;
    });
  });

  const allItemSales = Object.values(itemSalesMap);

  const filteredItemSales = allItemSales
    .filter((it) => {
      if (!itemSearchTerm.trim()) return true;
      const q = itemSearchTerm.toLowerCase();
      return it.name.toLowerCase().includes(q) || it.category.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (itemSortBy === 'qty') return b.qty - a.qty;
      if (itemSortBy === 'revenue') return b.revenue - a.revenue;
      return a.name.localeCompare(b.name);
    });

  const totalUnitsSold = allItemSales.reduce((sum, it) => sum + it.qty, 0);

  // Voided Items breakdown (Items cancelled/returned)
  const voidedItemMap: { [name: string]: { name: string; category: string; unitPrice: number; qty: number; amount: number } } = {};
  voidedSales.forEach((s) => {
    s.items.forEach((it) => {
      const prod = products.find((p) => p.name === it.name);
      const cat = prod?.category || it.category || 'General';
      if (!voidedItemMap[it.name]) {
        voidedItemMap[it.name] = {
          name: it.name,
          category: cat,
          unitPrice: it.price,
          qty: 0,
          amount: 0
        };
      }
      voidedItemMap[it.name].qty += it.qty;
      voidedItemMap[it.name].amount += it.qty * it.price;
    });
  });
  const voidedItemsList = Object.values(voidedItemMap);

  // Category breakdown
  const categoryMap: { [cat: string]: { qty: number; revenue: number } } = {};
  activeSales.forEach((s) => {
    s.items.forEach((it) => {
      const prod = products.find((p) => p.name === it.name);
      const cat = prod?.category || it.category || 'General';
      if (!categoryMap[cat]) {
        categoryMap[cat] = { qty: 0, revenue: 0 };
      }
      categoryMap[cat].qty += it.qty;
      categoryMap[cat].revenue += it.qty * it.price;
    });
  });

  // Payment Breakdown
  const payMap = {
    CASH: { count: 0, total: 0 },
    CARD: { count: 0, total: 0 },
    CREDIT: { count: 0, total: 0 },
    'CASH+CARD': { count: 0, total: 0 }
  };

  activeSales.forEach((s) => {
    const m = s.paymentMethod;
    if (payMap[m]) {
      payMap[m].count += 1;
      payMap[m].total += s.grandTotal;
    }
  });

  const exportExcelReport = () => {
    const wb = XLSX.utils.book_new();

    // 1. Item-wise breakdown Sheet
    const itemBreakdownSheet = filteredItemSales.map((it) => ({
      'Item Name': it.name,
      'Category': it.category,
      'Unit Price': it.unitPrice,
      'Quantity Sold': it.qty,
      'Total Revenue': it.revenue,
      'Estimated Profit': it.profit
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemBreakdownSheet), 'Item Sales Breakdown');

    // 2. Active Sales Transactions Sheet
    const salesSheet = activeSales.map((s) => ({
      'Invoice No': s.invoiceNumber,
      Date: s.date,
      Time: s.time,
      Cashier: s.cashier,
      'Unit Code': s.unitCode,
      'Payment Method': s.paymentMethod,
      Department: s.department || '',
      'Items Count': s.items.reduce((sum, i) => sum + i.qty, 0),
      Subtotal: s.subtotal,
      Discount: s.discount,
      'Grand Total': s.grandTotal,
      'Credit Due': s.creditDueDate || '',
      'Credit Status': s.creditStatus || '',
      Status: 'COMPLETED'
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesSheet), 'Active Sales');

    // 3. Voided & Cancelled Bills Sheet (Dedicated VOID REPORT as requested)
    const voidedSheet = voidedSales.map((s) => ({
      'Invoice No': s.invoiceNumber,
      'Sale Date': s.date,
      'Sale Time': s.time,
      'Voided At': s.voidedAt || `${s.date} ${s.time}`,
      'Voided By': s.voidedBy || s.cashier,
      'Void Reason': s.voidReason || 'Not specified',
      Cashier: s.cashier,
      'Unit Code': s.unitCode || '',
      'Payment Method': s.paymentMethod,
      'Voided Amount': s.grandTotal,
      'Items In Bill': s.items.map((i) => `${i.name} (${i.qty}x)`).join(', ')
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        voidedSheet.length > 0
          ? voidedSheet
          : [
              {
                'Invoice No': 'N/A',
                'Status': 'No voided transactions in this period',
                'Voided Amount': 0
              }
            ]
      ),
      'Voided Bills Report'
    );

    // 4. Voided Items Summary Sheet
    if (voidedItemsList.length > 0) {
      const voidedItemsRows = voidedItemsList.map((v) => ({
        'Item Name': v.name,
        'Category': v.category,
        'Unit Price': v.unitPrice,
        'Quantity Cancelled / Voided': v.qty,
        'Cancelled Amount': v.amount
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(voidedItemsRows), 'Voided Items Summary');
    }

    // 5. Complete Audit Trail (All transactions with status)
    const auditSheet = allFilteredSales.map((s) => ({
      'Invoice No': s.invoiceNumber,
      Date: s.date,
      Time: s.time,
      Cashier: s.cashier,
      'Unit Code': s.unitCode,
      Status: s.isVoided || s.status === 'VOIDED' ? 'VOIDED' : 'COMPLETED',
      'Grand Total': s.grandTotal,
      'Payment Method': s.paymentMethod,
      'Void Reason': s.voidReason || '',
      'Voided At': s.voidedAt || '',
      'Voided By': s.voidedBy || '',
      Items: s.items.map((i) => `${i.name} (x${i.qty})`).join(', ')
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(auditSheet), 'All Transactions Audit');

    // 6. Tokens Sheet
    if (filteredTokens.length > 0) {
      const tokensSheet = filteredTokens.map((t) => ({
        'Token No': t.tokenNumber,
        'Token Code': t.tokenCode,
        'Customer / Ref': t.customerName || '',
        'Meal Type': t.mealType || '',
        Date: t.businessDate || t.date,
        Time: t.time,
        Status: t.status,
        'Payment Status': t.paymentStatus,
        'Payment Method': t.paymentMethod,
        'Total Amount': t.totalAmount || t.grandTotal || 0,
        Items: (t.items || []).map((i) => `${i.name} (x${i.qty})`).join(', '),
        'Completed At': t.completedAt || ''
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tokensSheet), 'Food Tokens & Pre-Orders');
    }

    // 7. Daily Closing Sheet
    const closingSheet = cleanClosingReports.map((c) => ({
      'Business Date': c.businessDate,
      'Unit Code': c.unitCode,
      'Unit Name': c.unitName,
      Cashier: c.cashier,
      Status: c.status,
      'Opening Float': c.openingFloat,
      'Total Sales': c.totalSales,
      'Cash Sales': c.cashSales,
      'Expected Cash': c.expectedCash,
      'Actual Cash': c.actualCash,
      Difference: c.difference,
      'Closed At': c.closedAt
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(closingSheet), 'Daily Closing Reports');

    XLSX.writeFile(wb, `ItemWise_POS_Report_${from}_to_${to}.xlsx`);
  };

  const handlePrintClosing = (report: DailyClosingReport) => {
    let iframe = document.getElementById('report-print-frame') as HTMLIFrameElement;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.id = 'report-print-frame';
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
    doc.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Daily Closing - ${report.unitCode}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #000; font-size: 13px; }
          h2 { margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; }
          td, th { padding: 8px; border-bottom: 1px solid #ddd; text-align: left; }
          .num { text-align: right; }
          .bold { font-weight: bold; }
        </style>
      </head>
      <body>
        <h2>DAILY POS CLOSING REPORT</h2>
        <div>Unit: <strong>${report.unitCode}</strong> - ${report.unitName}</div>
        <div>Cashier: ${report.cashier} | Date: ${report.businessDate}</div>
        <div>Status: ${report.status} | Closed At: ${report.closedAt}</div>
        
        <table>
          <tr><td>Total Sales Revenue</td><td class="num bold">${formatMoney(report.totalSales, settings.currency)}</td></tr>
          <tr><td>Cash Sales</td><td class="num">${formatMoney(report.cashSales, settings.currency)}</td></tr>
          <tr><td>Card Sales</td><td class="num">${formatMoney(report.cardSales, settings.currency)}</td></tr>
          <tr><td>Credit Sales</td><td class="num">${formatMoney(report.creditSales, settings.currency)}</td></tr>
          <tr><td>Opening Cash Float</td><td class="num">${formatMoney(report.openingFloat, settings.currency)}</td></tr>
          <tr><td>Cash In</td><td class="num">${formatMoney(report.cashIn, settings.currency)}</td></tr>
          <tr><td>Cash Out</td><td class="num">-${formatMoney(report.cashOut, settings.currency)}</td></tr>
          <tr style="background: #f1f5f9; font-weight: bold;"><td>Expected Cash</td><td class="num">${formatMoney(report.expectedCash || 0, settings.currency)}</td></tr>
          <tr style="background: #f1f5f9; font-weight: bold;"><td>Actual Cash Counted</td><td class="num">${formatMoney(report.actualCash || 0, settings.currency)}</td></tr>
          <tr style="font-weight: bold;"><td>Difference</td><td class="num">${(report.difference || 0) >= 0 ? '+' : ''}${formatMoney(report.difference || 0, settings.currency)}</td></tr>
        </table>
      </body>
      </html>
    `);
    doc.close();

    iframe.contentWindow?.focus();
    setTimeout(() => {
      iframe.contentWindow?.print();
    }, 150);
  };

  const handleEmailClosing = (report: DailyClosingReport) => {
    const data = emailService.generateClosingEmail(report, settings.currency);
    setEmailModalTitle(`Email Shift Closing Report (${report.unitCode})`);
    setEmailSubject(data.subject);
    setEmailBody(data.body);
    setIsEmailModalOpen(true);
  };

  const handleEmailRangeSummary = () => {
    const unitLabel = unitFilter === 'ALL' ? 'All Counter Units' : `Unit ${unitFilter}`;
    const data = emailService.generateRangeSummaryEmail(
      activeSales,
      products,
      from,
      to,
      unitLabel,
      settings.currency
    );
    setEmailModalTitle(`Email POS Sales Report (${from === to ? from : `${from} to ${to}`})`);
    setEmailSubject(data.subject);
    setEmailBody(data.body);
    setIsEmailModalOpen(true);
  };

  return (
    <div className="space-y-4 text-black">
      {/* Account / Unit Scope Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4 text-amber-600" />
          <span className="font-bold text-slate-600">Reporting Account / Unit:</span>
          <span className="px-2 py-0.5 rounded-lg bg-amber-100 border border-amber-400 text-amber-950 font-black">
            {session?.unitCode || session?.user || 'System'} ({session?.unitName || session?.unitCode || 'Counter'})
          </span>
        </div>

        {session?.role !== 'CASHIER' && distinctUnits.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-600">Filter Counter / Unit:</span>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="px-2.5 py-1 rounded-xl bg-white border border-slate-300 font-bold text-black text-xs focus:outline-amber-500 shadow-2xs"
            >
              <option value="ALL">All Units / Accounts (Total Business)</option>
              {distinctUnits.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Date Filter & Calendar Selection Bar */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setDatePreset('today')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                datePreset === 'today'
                  ? 'bg-white border-2 border-amber-500 text-amber-950 font-black shadow-2xs'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDatePreset('yesterday')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                datePreset === 'yesterday'
                  ? 'bg-white border-2 border-amber-500 text-amber-950 font-black shadow-2xs'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Yesterday
            </button>
            <button
              onClick={() => setDatePreset('week')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                datePreset === 'week'
                  ? 'bg-white border-2 border-amber-500 text-amber-950 font-black shadow-2xs'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setDatePreset('month')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                datePreset === 'month'
                  ? 'bg-white border-2 border-amber-500 text-amber-950 font-black shadow-2xs'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => setDatePreset('calendar')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                datePreset === 'calendar'
                  ? 'bg-white border-2 border-amber-500 text-amber-950 font-black shadow-2xs'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-amber-600" /> Choose Date (Calendar)
            </button>
            <button
              onClick={() => setDatePreset('custom')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                datePreset === 'custom'
                  ? 'bg-white border-2 border-amber-500 text-amber-950 font-black shadow-2xs'
                  : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              Date Range
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleEmailRangeSummary}
              className="px-4 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-extrabold text-xs flex items-center gap-2 shadow-2xs cursor-pointer active:scale-95 transition-all"
              title="Email this sales report summary to manager/owner"
            >
              <Mail className="w-4 h-4 text-amber-600" /> Email Sales Summary
            </button>
            <button
              onClick={exportExcelReport}
              className="px-4 py-2 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-500 font-extrabold text-xs flex items-center gap-2 shadow-2xs cursor-pointer active:scale-95 transition-all"
            >
              <FileSpreadsheet className="w-4 h-4 text-amber-600" /> Export Excel Report
            </button>
          </div>
        </div>

        {/* Datepicker Bar */}
        {datePreset === 'calendar' && (
          <div className="flex items-center gap-3 p-3 bg-amber-50/40 rounded-2xl border border-amber-300">
            <Calendar className="w-4 h-4 text-amber-700 shrink-0" />
            <div className="text-xs font-bold text-black">Select Specific Calendar Day:</div>
            <input
              type="date"
              value={selectedCalendarDate}
              onChange={(e) => setSelectedCalendarDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-white border border-amber-400 font-bold text-xs text-black shadow-2xs focus:outline-amber-500"
            />
            <div className="text-xs font-bold text-amber-900 ml-auto">
              Viewing sales on: <span className="font-extrabold">{selectedCalendarDate}</span>
            </div>
          </div>
        )}

        {datePreset === 'custom' && (
          <div className="flex items-center gap-2 p-3 bg-amber-50/40 rounded-2xl border border-amber-300">
            <Calendar className="w-4 h-4 text-amber-700" />
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-black"
            />
            <span className="text-xs text-slate-500 font-bold">to</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-black"
            />
          </div>
        )}
      </div>

      {/* Summary KPI Cards (Sales + Token Metrics + Void Metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Sales Revenue</div>
          <div className="text-xl font-black text-black mt-1">
            {formatMoney(totalRevenue, settings.currency)}
          </div>
          <div className="text-xs text-amber-800 font-bold mt-0.5">{activeSales.length} valid bills</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Units Sold</div>
          <div className="text-xl font-black text-amber-900 mt-1">
            {totalUnitsSold.toLocaleString()} <span className="text-xs font-bold text-slate-500">pcs</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{allItemSales.length} distinct items</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Estimated Profit</div>
          <div className="text-xl font-black text-emerald-800 mt-1">
            {formatMoney(totalProfit, settings.currency)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Based on buying costs</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Average Bill</div>
          <div className="text-xl font-black text-black mt-1">
            {formatMoney(avgSale, settings.currency)}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">Per counter bill</div>
        </div>

        {/* Voided Bills Metric */}
        <div className="bg-rose-50/50 border border-rose-200 rounded-3xl p-4 shadow-2xs">
          <div className="text-xs font-black text-rose-950 uppercase tracking-wider flex items-center justify-between">
            <span>Voided Bills</span>
            <Ban className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-xl font-black text-rose-700 mt-1">
            {formatMoney(totalVoidedAmount, settings.currency)}
          </div>
          <div className="text-xs text-rose-800 font-bold mt-0.5">
            {voidedCount} cancelled {voidedCount === 1 ? 'bill' : 'bills'}
          </div>
        </div>

        {/* Token Specific Metrics in Reports */}
        <div className="bg-amber-50/50 border-2 border-amber-400 rounded-3xl p-4 shadow-2xs">
          <div className="text-xs font-black text-amber-950 uppercase tracking-wider flex items-center gap-1">
            <Ticket className="w-3.5 h-3.5 text-amber-700" />
            <span>Tokens Revenue</span>
          </div>
          <div className="text-xl font-black text-amber-950 mt-1">
            {formatMoney(tokenTotalRevenue, settings.currency)}
          </div>
          <div className="text-xs text-amber-800 font-bold mt-0.5">
            {filteredTokens.length} total tokens
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Claimed Tokens</span>
          </div>
          <div className="text-xl font-black text-emerald-800 mt-1">
            {tokenCompletedCount} / {filteredTokens.length}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {tokenPendingCount} pending claims
          </div>
        </div>
      </div>

      {/* 1. ITEM-WISE SALES REPORT SECTION */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-600" />
            <div>
              <h3 className="font-black text-sm text-black uppercase tracking-wider">
                Item-Wise Sales Report
              </h3>
              <div className="text-xs text-slate-500">
                Detailed quantities and revenue breakdown for each individual sold product
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search item name / category..."
                value={itemSearchTerm}
                onChange={(e) => setItemSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs font-medium text-black bg-white focus:outline-amber-500 w-48 sm:w-64"
              />
            </div>

            {/* Sort Buttons */}
            <div className="flex items-center gap-1 bg-white border border-slate-300 p-0.5 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setItemSortBy('qty')}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-all ${
                  itemSortBy === 'qty'
                    ? 'bg-amber-500 text-black font-black shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Qty Sold ↓
              </button>
              <button
                type="button"
                onClick={() => setItemSortBy('revenue')}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-all ${
                  itemSortBy === 'revenue'
                    ? 'bg-amber-500 text-black font-black shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Revenue ↓
              </button>
              <button
                type="button"
                onClick={() => setItemSortBy('name')}
                className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-all ${
                  itemSortBy === 'name'
                    ? 'bg-amber-500 text-black font-black shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                Name A-Z
              </button>
            </div>
          </div>
        </div>

        {/* Item-Wise Table */}
        <div className="overflow-x-auto">
          {filteredItemSales.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              <div className="text-xs font-bold text-black">No products sold in this period</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Select another date or date range to view item sales.</div>
            </div>
          ) : (
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 bg-slate-50/60">
                  <th className="py-2.5 px-3 rounded-l-xl">Product Item Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3 text-right">Unit Price</th>
                  <th className="py-2.5 px-3 text-center">Quantity Sold</th>
                  <th className="py-2.5 px-3 text-right">Total Revenue</th>
                  <th className="py-2.5 px-3 text-right rounded-r-xl">Est. Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-black">
                {filteredItemSales.map((it) => (
                  <tr key={it.name} className="hover:bg-amber-50/30 transition-colors">
                    <td className="py-2.5 px-3 font-extrabold text-black">
                      {it.name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 font-semibold">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px]">
                        {it.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                      {formatMoney(it.unitPrice, settings.currency)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-amber-100 border border-amber-400 text-amber-950 font-black text-xs shadow-2xs">
                        {it.qty} pcs
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-black text-black">
                      {formatMoney(it.revenue, settings.currency)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-800">
                      {formatMoney(it.profit, settings.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-black text-xs bg-slate-50/80">
                  <td className="py-3 px-3">Total Summary</td>
                  <td className="py-3 px-3 text-slate-500">{filteredItemSales.length} items</td>
                  <td className="py-3 px-3"></td>
                  <td className="py-3 px-3 text-center text-amber-950 font-black">
                    {filteredItemSales.reduce((s, i) => s + i.qty, 0)} pcs
                  </td>
                  <td className="py-3 px-3 text-right text-black font-black">
                    {formatMoney(filteredItemSales.reduce((s, i) => s + i.revenue, 0), settings.currency)}
                  </td>
                  <td className="py-3 px-3 text-right text-emerald-800 font-black">
                    {formatMoney(filteredItemSales.reduce((s, i) => s + i.profit, 0), settings.currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* 2. FOOD TOKENS & PRE-ORDERS BREAKDOWN */}
      {filteredTokens.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Ticket className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="font-black text-sm text-black uppercase tracking-wider">
                  Food Tokens &amp; Meal Pre-Orders Summary
                </h3>
                <div className="text-xs text-slate-500">
                  {filteredTokens.length} tokens generated ({tokenCompletedCount} claimed, {tokenPendingCount} pending)
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm font-black text-black">
                {formatMoney(tokenTotalRevenue, settings.currency)}
              </div>
              <div className="text-[10px] text-emerald-700 font-extrabold">
                {formatMoney(tokenPaidRevenue, settings.currency)} paid in advance
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 bg-slate-50/60">
                  <th className="py-2.5 px-3 rounded-l-xl">Token #</th>
                  <th className="py-2.5 px-3">Meal / Customer</th>
                  <th className="py-2.5 px-3">Items Ordered</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Payment</th>
                  <th className="py-2.5 px-3 text-right rounded-r-xl">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-black">
                {filteredTokens.map((tok) => (
                  <tr key={tok.id} className="hover:bg-amber-50/20">
                    <td className="py-2.5 px-3 font-mono font-black text-black">
                      #{tok.tokenNumber} ({tok.tokenCode})
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-800">
                      {tok.customerName || 'Pre-order Meal'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {(tok.items || []).map((it) => `${it.qty}x ${it.name}`).join(', ')}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black border ${
                          tok.status === 'COMPLETED'
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                            : 'bg-amber-100 border-amber-400 text-amber-950'
                        }`}
                      >
                        {tok.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold">
                      <span
                        className={`text-[10px] ${
                          tok.paymentStatus === 'PAID' ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {tok.paymentStatus === 'PAID' ? '✓ Paid' : '⚠ Unpaid'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-black text-black">
                      {formatMoney(tok.totalAmount || tok.grandTotal || 0, settings.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. VOIDED & CANCELLED BILLS REPORT SECTION */}
      {voidedSales.length > 0 && (
        <div className="bg-white border border-rose-200 rounded-3xl p-5 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-rose-100">
            <div className="flex items-center gap-2">
              <Ban className="w-5 h-5 text-rose-600" />
              <div>
                <h3 className="font-black text-sm text-black uppercase tracking-wider flex items-center gap-2">
                  <span>Voided &amp; Cancelled Bills</span>
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 border border-rose-300 text-rose-900 text-[10px] font-black">
                    {voidedSales.length} {voidedSales.length === 1 ? 'Bill' : 'Bills'} Voided
                  </span>
                </h3>
                <div className="text-xs text-slate-500">
                  Audit log of transactions revoked or voided by managers/cashiers with specified reasons
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm font-black text-rose-700">
                {formatMoney(totalVoidedAmount, settings.currency)}
              </div>
              <div className="text-[10px] text-rose-600 font-bold">
                Total voided value
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-rose-100 text-[11px] font-black uppercase text-rose-900 bg-rose-50/50">
                  <th className="py-2.5 px-3 rounded-l-xl">Invoice #</th>
                  <th className="py-2.5 px-3">Date &amp; Time</th>
                  <th className="py-2.5 px-3">Voided By</th>
                  <th className="py-2.5 px-3">Void Reason</th>
                  <th className="py-2.5 px-3">Items Cancelled</th>
                  <th className="py-2.5 px-3 text-right rounded-r-xl">Voided Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-50 font-medium text-black">
                {voidedSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-rose-50/30">
                    <td className="py-2.5 px-3 font-mono font-black text-black">
                      {sale.invoiceNumber}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <div>{sale.date} {sale.time}</div>
                      {sale.voidedAt && sale.voidedAt !== `${sale.date} ${sale.time}` && (
                        <div className="text-[10px] text-rose-600">
                          Voided: {sale.voidedAt}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-black">
                      <div>{sale.voidedBy || sale.cashier}</div>
                      <div className="text-[10px] text-slate-500">Cashier: {sale.cashier}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="inline-block px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-900 font-bold text-[11px]">
                        {sale.voidReason || 'No reason specified'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-xs">
                      {(sale.items || []).map((it) => `${it.qty}x ${it.name}`).join(', ')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-black text-rose-700">
                      {formatMoney(sale.grandTotal, settings.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Grid: Category Breakdown & Payment Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs">
          <h3 className="font-extrabold text-sm text-black pb-3 border-b border-slate-200">
            Category Sales
          </h3>
          <div className="divide-y divide-slate-100 mt-1">
            {Object.entries(categoryMap).length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">No data available</div>
            ) : (
              Object.entries(categoryMap).map(([cat, d]) => (
                <div key={cat} className="py-2 flex justify-between text-xs">
                  <span className="font-bold text-black">{cat}</span>
                  <span className="font-black text-amber-900">
                    {d.qty} items · {formatMoney(d.revenue, settings.currency)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs">
          <h3 className="font-extrabold text-sm text-black pb-3 border-b border-slate-200">
            Payment Method Summary
          </h3>
          <div className="divide-y divide-slate-100 mt-1">
            {Object.entries(payMap).map(([method, d]) => (
              <div key={method} className="py-2.5 flex justify-between items-center text-xs">
                <span className="font-bold text-black uppercase">{method}</span>
                <div className="text-right">
                  <span className="font-black text-sm text-black">
                    {formatMoney(d.total, settings.currency)}
                  </span>
                  <span className="text-[10px] text-slate-500 block">{d.count} transactions</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Daily Closing Register History */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 shadow-2xs">
        <h3 className="font-extrabold text-sm text-black pb-3 border-b border-slate-200">
          Daily Shift &amp; Register Closing History
        </h3>
        <div className="divide-y divide-slate-200 mt-1">
          {scopedClosingReports.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">No shift closing records yet.</div>
          ) : (
            scopedClosingReports
              .slice()
              .reverse()
              .map((rep) => (
                <div key={rep.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-black text-xs text-black">
                      {rep.unitCode} ({rep.unitName}) · {rep.businessDate}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Cashier: {rep.cashier} · Total Sales: {formatMoney(rep.totalSales, settings.currency)} · Status: {rep.status}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right text-xs">
                      <div className="font-bold text-black">
                        Expected: {formatMoney(rep.expectedCash || 0, settings.currency)}
                      </div>
                      <div
                        className={`text-[11px] font-bold ${
                          (rep.difference || 0) === 0
                            ? 'text-amber-800'
                            : (rep.difference || 0) > 0
                            ? 'text-blue-700'
                            : 'text-rose-600'
                        }`}
                      >
                        Diff: {(rep.difference || 0) >= 0 ? '+' : ''}
                        {formatMoney(rep.difference || 0, settings.currency)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handlePrintClosing(rep)}
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-black border border-slate-300 font-bold text-xs flex items-center gap-1 cursor-pointer shadow-2xs"
                        title="Print Report"
                      >
                        <Printer className="w-3.5 h-3.5 text-amber-600" /> Print
                      </button>
                      <button
                        onClick={() => handleEmailClosing(rep)}
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-amber-50 text-amber-950 border border-amber-500 font-extrabold text-xs flex items-center gap-1 cursor-pointer shadow-2xs"
                        title="Email Report"
                      >
                        <Mail className="w-3.5 h-3.5 text-amber-600" /> Email
                      </button>
                    </div>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      {/* Dispatch Email Modal */}
      <EmailReportModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        title={emailModalTitle}
        defaultRecipient={reportEmailRecipient || 'superservpos@gmail.com'}
        initialSubject={emailSubject}
        initialBody={emailBody}
        onSaveRecipient={(email) => {
          if (onSaveReportEmailRecipient) {
            onSaveReportEmailRecipient(email);
          }
        }}
      />
    </div>
  );
};
