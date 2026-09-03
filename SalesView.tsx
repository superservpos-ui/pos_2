import React, { useState, useMemo } from 'react';
import { Sale, CompanySettings, AuthSession, AuthAccount, TokenOrder } from '../types/pos';
import { formatMoney } from '../services/storage';
import {
  Search,
  Printer,
  Eye,
  X,
  Filter,
  Store,
  ShieldCheck,
  Ticket,
  Receipt,
  CheckCircle2,
  Clock,
  Ban,
  AlertTriangle,
  RotateCcw,
  AlertCircle
} from 'lucide-react';

interface SalesViewProps {
  sales: Sale[];
  tokens?: TokenOrder[];
  settings: CompanySettings;
  session: AuthSession | null;
  accounts?: AuthAccount[];
  onViewSale: (sale: Sale) => void;
  onPrintSale: (sale: Sale) => void;
  onVoidSale?: (sale: Sale, reason: string) => void;
}

export const SalesView: React.FC<SalesViewProps> = ({
  sales,
  tokens = [],
  settings,
  session,
  accounts = [],
  onViewSale,
  onPrintSale,
  onVoidSale
}) => {
  const [activeTab, setActiveTab] = useState<'invoices' | 'tokens'>('invoices');
  const [unitFilter, setUnitFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'VOIDED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<Sale | null>(null);
  const [selectedTokenDetail, setSelectedTokenDetail] = useState<TokenOrder | null>(null);

  // Void Modal State
  const [voidingSale, setVoidingSale] = useState<Sale | null>(null);
  const [selectedVoidReason, setSelectedVoidReason] = useState<string>('Customer Cancellation');
  const [customVoidReason, setCustomVoidReason] = useState<string>('');
  const [voidSuccessToast, setVoidSuccessToast] = useState<string | null>(null);

  // Distinct units for admin filter
  const distinctUnits = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((a) => a.unitCode && set.add(a.unitCode.toUpperCase()));
    sales.forEach((s) => s.unitCode && set.add(s.unitCode.toUpperCase()));
    tokens.forEach((t) => t.unitCode && set.add(t.unitCode.toUpperCase()));
    return Array.from(set);
  }, [accounts, sales, tokens]);

  // Isolate sales: Cashier strictly views their own unit/account sales
  const scopedSales = useMemo(() => {
    if (session?.role === 'CASHIER') {
      const unit = session?.unitCode || 'Counter';
      return sales.filter(
        (s) => s.unitCode === unit || (session?.user && s.cashier === session.user)
      );
    }
    if (unitFilter !== 'ALL') {
      return sales.filter((s) => s.unitCode === unitFilter);
    }
    return sales;
  }, [sales, session, unitFilter]);

  // Isolate tokens
  const scopedTokens = useMemo(() => {
    if (session?.role === 'CASHIER') {
      const unit = session?.unitCode || 'Counter';
      return tokens.filter(
        (t) => t.unitCode === unit || (session?.user && t.cashier === session.user)
      );
    }
    if (unitFilter !== 'ALL') {
      return tokens.filter((t) => t.unitCode === unitFilter);
    }
    return tokens;
  }, [tokens, session, unitFilter]);

  const filteredSales = scopedSales
    .slice()
    .reverse()
    .filter((s) => {
      // Status filter
      if (statusFilter === 'ACTIVE' && (s.isVoided || s.status === 'VOIDED')) return false;
      if (statusFilter === 'VOIDED' && !s.isVoided && s.status !== 'VOIDED') return false;

      if (dateFilter && s.date !== dateFilter) return false;
      if (paymentFilter && s.paymentMethod !== paymentFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const invMatch = s.invoiceNumber.toLowerCase().includes(q);
        const cashierMatch = (s.cashier || '').toLowerCase().includes(q);
        const deptMatch = (s.department || '').toLowerCase().includes(q);
        const itemMatch = s.items.some((i) => i.name.toLowerCase().includes(q));
        return invMatch || cashierMatch || deptMatch || itemMatch;
      }
      return true;
    });

  const filteredTokens = scopedTokens
    .slice()
    .reverse()
    .filter((t) => {
      const tDate = t.businessDate || t.date;
      if (dateFilter && tDate !== dateFilter) return false;
      if (paymentFilter) {
        if (paymentFilter === 'CASH' && t.paymentMethod !== 'CASH') return false;
        if (paymentFilter === 'CARD' && t.paymentMethod !== 'CARD') return false;
      }
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const numMatch = (t.tokenNumber || '').toLowerCase().includes(q);
        const codeMatch = (t.tokenCode || '').toLowerCase().includes(q);
        const custMatch = (t.customerName || '').toLowerCase().includes(q);
        const phoneMatch = (t.phoneNumber || '').toLowerCase().includes(q);
        const itemMatch = (t.items || []).some((i) => i.name.toLowerCase().includes(q));
        return numMatch || codeMatch || custMatch || phoneMatch || itemMatch;
      }
      return true;
    });

  // Calculate KPIs - EXCLUDING VOIDED TRANSACTIONS from sales revenue
  const activeSalesOnly = filteredSales.filter((s) => !s.isVoided && s.status !== 'VOIDED');
  const voidedSalesOnly = filteredSales.filter((s) => s.isVoided || s.status === 'VOIDED');

  const totalFilteredAmount = activeSalesOnly.reduce((sum, s) => sum + s.grandTotal, 0);
  const totalCash = activeSalesOnly
    .filter((s) => s.paymentMethod === 'CASH' || s.paymentMethod === 'CASH+CARD')
    .reduce((sum, s) => sum + (s.paymentMethod === 'CASH' ? s.grandTotal : s.cashAmount || 0), 0);
  const totalCard = activeSalesOnly
    .filter((s) => s.paymentMethod === 'CARD' || s.paymentMethod === 'CASH+CARD')
    .reduce((sum, s) => sum + (s.paymentMethod === 'CARD' ? s.grandTotal : s.cardAmount || 0), 0);
  const totalCredit = activeSalesOnly
    .filter((s) => s.paymentMethod === 'CREDIT')
    .reduce((sum, s) => sum + s.grandTotal, 0);

  const totalVoidedAmount = voidedSalesOnly.reduce((sum, s) => sum + s.grandTotal, 0);
  const totalTokenRevenue = filteredTokens.reduce((sum, t) => sum + (t.totalAmount || t.grandTotal || 0), 0);

  const clearFilters = () => {
    setSearchTerm('');
    setDateFilter('');
    setPaymentFilter('');
    setUnitFilter('ALL');
    setStatusFilter('ALL');
  };

  const handleConfirmVoid = () => {
    if (!voidingSale || !onVoidSale) return;
    if (voidingSale.isVoided || voidingSale.status === 'VOIDED') {
      alert('This transaction has already been voided.');
      setVoidingSale(null);
      return;
    }

    const finalReason = selectedVoidReason === 'Other'
      ? (customVoidReason.trim() || 'Voided by Cashier')
      : selectedVoidReason;

    onVoidSale(voidingSale, finalReason);
    setVoidSuccessToast(`✓ Invoice #${voidingSale.invoiceNumber} has been VOIDED. Stock restored & excluded from revenue.`);
    setTimeout(() => setVoidSuccessToast(null), 4000);

    // Update local modal if open
    if (selectedSaleDetail && selectedSaleDetail.invoiceNumber === voidingSale.invoiceNumber) {
      setSelectedSaleDetail({
        ...selectedSaleDetail,
        status: 'VOIDED',
        isVoided: true,
        voidReason: finalReason
      });
    }

    setVoidingSale(null);
    setCustomVoidReason('');
  };

  return (
    <div className="space-y-4 bg-white text-black">
      {/* Toast Notification */}
      {voidSuccessToast && (
        <div className="p-3 bg-rose-50 border-2 border-rose-500 rounded-2xl flex items-center justify-between text-xs font-bold text-rose-900 shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-rose-600" />
            <span>{voidSuccessToast}</span>
          </div>
          <button onClick={() => setVoidSuccessToast(null)} className="text-rose-600 hover:text-rose-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Account Mode Indicator */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4 text-amber-600" />
          <span className="font-bold text-slate-600">Active Account / Unit:</span>
          <span className="px-2 py-0.5 rounded-lg bg-amber-100 border border-amber-400 text-amber-950 font-black">
            {session?.unitCode || session?.user || 'System'} ({session?.unitName || session?.unitCode || 'Counter'})
          </span>
        </div>

        {session?.role !== 'CASHIER' && distinctUnits.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-600">Filter Counter:</span>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="px-2.5 py-1 rounded-xl bg-white border border-slate-300 font-bold text-black text-xs focus:outline-amber-500 shadow-2xs"
            >
              <option value="ALL">All Units / Accounts</option>
              {distinctUnits.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tabs: Sales Invoices vs Tokens History */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'invoices'
              ? 'bg-amber-500 text-black font-black shadow-2xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Sales Invoices ({filteredSales.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('tokens')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'tokens'
              ? 'bg-amber-500 text-black font-black shadow-2xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Ticket className="w-4 h-4" />
          <span>Food Tokens &amp; Pre-Orders ({filteredTokens.length})</span>
        </button>
      </div>

      {/* Top Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-amber-600 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={
                activeTab === 'invoices'
                  ? 'Search invoice number, cashier, item name...'
                  : 'Search token number (#101), code, customer, item...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-amber-500"
            />
          </div>

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-amber-500"
          />

          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-medium text-black focus:outline-amber-500"
          >
            <option value="">All Payments</option>
            <option value="CASH">Cash</option>
            <option value="CARD">Card</option>
            {activeTab === 'invoices' && <option value="CREDIT">Credit</option>}
            {activeTab === 'invoices' && <option value="CASH+CARD">Cash + Card</option>}
          </select>

          {activeTab === 'invoices' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-bold text-black focus:outline-amber-500"
            >
              <option value="ALL">All Status (Active + Voided)</option>
              <option value="ACTIVE">Active Sales Only</option>
              <option value="VOIDED">Voided Invoices Only</option>
            </select>
          )}

          {(searchTerm || dateFilter || paymentFilter || statusFilter !== 'ALL') && (
            <button
              onClick={clearFilters}
              className="px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-black border border-slate-300 text-xs font-bold transition-all cursor-pointer shadow-2xs"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filtered KPIs */}
        {activeTab === 'invoices' ? (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-2 border-t border-slate-200 text-xs">
            <div className="p-2 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-slate-500 block font-medium">Active Bills</span>
              <span className="font-extrabold text-sm text-black">{activeSalesOnly.length}</span>
            </div>
            <div className="p-2 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-slate-500 block font-medium">Total Net Revenue</span>
              <span className="font-extrabold text-sm text-amber-900">{formatMoney(totalFilteredAmount, settings.currency)}</span>
            </div>
            <div className="p-2 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-slate-500 block font-medium">Cash Total</span>
              <span className="font-bold text-black">{formatMoney(totalCash, settings.currency)}</span>
            </div>
            <div className="p-2 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-slate-500 block font-medium">Card Total</span>
              <span className="font-bold text-black">{formatMoney(totalCard, settings.currency)}</span>
            </div>
            <div className="p-2 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-slate-500 block font-medium">Credit Receivables</span>
              <span className="font-bold text-amber-700">{formatMoney(totalCredit, settings.currency)}</span>
            </div>
            <div className="p-2 bg-rose-50 border border-rose-300 rounded-xl shadow-2xs">
              <span className="text-rose-700 block font-bold">Voided ({voidedSalesOnly.length})</span>
              <span className="font-black text-xs text-rose-900">
                -{formatMoney(totalVoidedAmount, settings.currency)}
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 text-xs">
            <div className="p-2 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-slate-500 block font-medium">Total Tokens</span>
              <span className="font-extrabold text-sm text-black">{filteredTokens.length}</span>
            </div>
            <div className="p-2 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-slate-500 block font-medium">Token Value / Revenue</span>
              <span className="font-extrabold text-sm text-amber-900">{formatMoney(totalTokenRevenue, settings.currency)}</span>
            </div>
            <div className="p-2 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-slate-500 block font-medium">Claimed / Completed</span>
              <span className="font-bold text-emerald-700">
                {filteredTokens.filter((t) => t.status === 'COMPLETED').length}
              </span>
            </div>
            <div className="p-2 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <span className="text-slate-500 block font-medium">Pending Claims</span>
              <span className="font-bold text-amber-800">
                {filteredTokens.filter((t) => t.status === 'PENDING').length}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Table: Invoices or Tokens */}
      {activeTab === 'invoices' ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white border-b border-slate-200 text-black font-extrabold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-3">Date / Time</th>
                  <th className="py-3 px-3">Cashier / Unit</th>
                  <th className="py-3 px-3">Items</th>
                  <th className="py-3 px-3">Payment</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                      No sales invoices found matching your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredSales.map((sale) => {
                    const isVoided = sale.isVoided || sale.status === 'VOIDED';

                    return (
                      <tr
                        key={sale.invoiceNumber}
                        className={`transition-colors ${
                          isVoided
                            ? 'bg-rose-50/40 text-slate-500 hover:bg-rose-50/70'
                            : 'hover:bg-amber-50/30'
                        }`}
                      >
                        <td className="py-3 px-4 font-black">
                          <span className={isVoided ? 'line-through text-slate-400' : 'text-black'}>
                            {sale.invoiceNumber}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-600 font-medium">
                          {sale.date} <span className="text-slate-400">· {sale.time}</span>
                        </td>
                        <td className="py-3 px-3 text-black font-bold">
                          {sale.cashier}
                          {sale.unitCode && (
                            <span className="block text-[10px] text-slate-500">{sale.unitCode}</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-700 max-w-[180px] truncate">
                          {sale.items.map((i) => `${i.name} (x${i.qty})`).join(', ')}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-block text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                              sale.paymentMethod === 'CASH'
                                ? 'bg-white border-amber-600 text-amber-800'
                                : sale.paymentMethod === 'CARD'
                                ? 'bg-white border-blue-500 text-blue-800'
                                : sale.paymentMethod === 'CREDIT'
                                ? 'bg-white border-amber-500 text-amber-800'
                                : 'bg-white border-purple-500 text-purple-800'
                            }`}
                          >
                            {sale.paymentMethod}
                          </span>
                          {sale.department && (
                            <span className="block text-[10px] font-semibold text-amber-700 mt-0.5">
                              {sale.department}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {isVoided ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-900 border border-rose-400 shadow-2xs" title={`Voided: ${sale.voidReason || 'Cashier void'}`}>
                              <Ban className="w-3 h-3 text-rose-600" /> VOIDED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-800 border border-emerald-300">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> COMPLETED
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-sm">
                          <span className={isVoided ? 'line-through text-slate-400' : 'text-black'}>
                            {formatMoney(sale.grandTotal, settings.currency)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedSaleDetail(sale)}
                              className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-black transition-colors cursor-pointer shadow-2xs"
                              title="View Invoice Details"
                            >
                              <Eye className="w-3.5 h-3.5 text-amber-600" />
                            </button>
                            <button
                              onClick={() => onPrintSale(sale)}
                              className="p-1.5 rounded-lg bg-white hover:bg-amber-50 border border-amber-600 text-amber-800 transition-colors cursor-pointer shadow-2xs"
                              title="Print Receipt"
                            >
                              <Printer className="w-3.5 h-3.5 text-amber-600" />
                            </button>

                            {/* VOID Button for Active Sales */}
                            {!isVoided ? (
                              <button
                                onClick={() => {
                                  setVoidingSale(sale);
                                  setSelectedVoidReason('Customer Cancellation');
                                  setCustomVoidReason('');
                                }}
                                className="px-2 py-1 rounded-lg bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 hover:text-rose-900 font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95"
                                title="Void this transaction and restore stock"
                              >
                                <Ban className="w-3 h-3 text-rose-600" /> VOID
                              </button>
                            ) : (
                              <span className="text-[10px] font-bold text-rose-600 px-1 py-0.5" title={sale.voidReason || 'Voided'}>
                                Voided
                              </span>
                            )}
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
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-white border-b border-slate-200 text-black font-extrabold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Token #</th>
                  <th className="py-3 px-3">Date / Time</th>
                  <th className="py-3 px-3">Customer / Meal</th>
                  <th className="py-3 px-3">Items</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-center">Payment</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTokens.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                      No pre-order tokens found matching your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredTokens.map((tok) => (
                    <tr
                      key={tok.id}
                      className="hover:bg-amber-50/30 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-black text-black">
                        #{tok.tokenNumber}
                        <span className="block text-[10px] text-slate-400 font-sans font-bold">{tok.tokenCode}</span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 font-medium">
                        {tok.businessDate || tok.date} <span className="text-slate-400">· {tok.time}</span>
                      </td>
                      <td className="py-3 px-3 text-black font-bold">
                        {tok.customerName || 'Standard Pre-Order'}
                        {tok.mealType && (
                          <span className="block text-[10px] text-amber-700 font-semibold">{tok.mealType}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-700 max-w-[200px] truncate">
                        {(tok.items || []).map((i) => `${i.name} (x${i.qty})`).join(', ')}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-block text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                            tok.status === 'COMPLETED'
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                              : tok.status === 'CANCELLED'
                              ? 'bg-rose-50 border-rose-400 text-rose-950'
                              : 'bg-amber-100 border-amber-400 text-amber-950'
                          }`}
                        >
                          {tok.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`text-[10px] font-black ${
                            tok.paymentStatus === 'PAID' ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {tok.paymentStatus === 'PAID' ? '✓ Paid' : '⚠ Unpaid'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-black text-sm text-black">
                        {formatMoney(tok.totalAmount || tok.grandTotal || 0, settings.currency)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setSelectedTokenDetail(tok)}
                          className="p-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-black transition-colors cursor-pointer shadow-2xs"
                          title="View Token Details"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-600" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoice Breakdown Modal */}
      {selectedSaleDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4 text-black">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-base text-black">
                    Invoice {selectedSaleDetail.invoiceNumber}
                  </h3>
                  {(selectedSaleDetail.isVoided || selectedSaleDetail.status === 'VOIDED') && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-400">
                      VOIDED
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  {selectedSaleDetail.date} {selectedSaleDetail.time} · Cashier: {selectedSaleDetail.cashier}
                </div>
              </div>
              <button
                onClick={() => setSelectedSaleDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Void Notice banner if voided */}
            {(selectedSaleDetail.isVoided || selectedSaleDetail.status === 'VOIDED') && (
              <div className="p-3 bg-rose-50 border-2 border-rose-300 rounded-xl text-xs text-rose-900 space-y-1">
                <div className="flex items-center gap-1.5 font-black text-rose-700">
                  <AlertTriangle className="w-4 h-4 text-rose-600" /> THIS INVOICE IS VOIDED
                </div>
                <p className="text-[11px] font-medium text-rose-800">
                  Reason: <span className="font-bold">{selectedSaleDetail.voidReason || 'Cashier cancellation'}</span>
                </p>
                {selectedSaleDetail.voidedAt && (
                  <p className="text-[10px] text-rose-600">
                    Voided At: {selectedSaleDetail.voidedAt} {selectedSaleDetail.voidedBy ? `by ${selectedSaleDetail.voidedBy}` : ''}
                  </p>
                )}
              </div>
            )}

            <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto pr-1">
              {selectedSaleDetail.items.map((item, idx) => (
                <div key={idx} className="py-2 flex justify-between text-xs">
                  <div>
                    <div className="font-bold text-black">{item.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {item.qty} x {formatMoney(item.price, settings.currency)}
                    </div>
                  </div>
                  <div className="font-extrabold text-black">
                    {formatMoney(item.qty * item.price, settings.currency)}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-200 space-y-1 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-bold text-black">{formatMoney(selectedSaleDetail.subtotal, settings.currency)}</span>
              </div>
              {selectedSaleDetail.discount > 0 && (
                <div className="flex justify-between text-rose-600 font-semibold">
                  <span>Discount:</span>
                  <span>-{formatMoney(selectedSaleDetail.discount, settings.currency)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-base text-black pt-1">
                <span>Total Amount:</span>
                <span className={selectedSaleDetail.isVoided ? 'line-through text-slate-400' : 'text-amber-900'}>
                  {formatMoney(selectedSaleDetail.grandTotal, settings.currency)}
                </span>
              </div>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-xl text-xs space-y-1">
              <div className="flex justify-between font-bold">
                <span>Payment:</span>
                <span className="text-black">{selectedSaleDetail.paymentMethod}</span>
              </div>
              {selectedSaleDetail.department && (
                <div className="flex justify-between">
                  <span>Department:</span>
                  <span className="font-bold text-amber-700">{selectedSaleDetail.department}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  onPrintSale(selectedSaleDetail);
                  setSelectedSaleDetail(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-600 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-4 h-4 text-amber-600" /> Print Receipt
              </button>

              {!selectedSaleDetail.isVoided && selectedSaleDetail.status !== 'VOIDED' && (
                <button
                  onClick={() => {
                    const s = selectedSaleDetail;
                    setSelectedSaleDetail(null);
                    setVoidingSale(s);
                    setSelectedVoidReason('Customer Cancellation');
                    setCustomVoidReason('');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-black text-xs flex items-center gap-1 cursor-pointer shadow-2xs active:scale-95"
                >
                  <Ban className="w-3.5 h-3.5 text-rose-600" /> Void Sale
                </button>
              )}

              <button
                onClick={() => setSelectedSaleDetail(null)}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-black font-bold text-xs cursor-pointer shadow-2xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VOID TRANSACTION CONFIRMATION MODAL */}
      {voidingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl border-2 border-rose-500 w-full max-w-md p-6 space-y-4 text-black">
            <div className="text-center">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 border-2 border-rose-500 text-rose-600 flex items-center justify-center mx-auto mb-2 font-bold shadow-2xs">
                <Ban className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-black text-rose-950">CONFIRM VOID TRANSACTION</h2>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                This will void Invoice #{voidingSale.invoiceNumber}, restore product inventory, and exclude it from sales revenue.
              </p>
            </div>

            {/* Bill Summary Box */}
            <div className="bg-rose-50/50 border border-rose-200 rounded-2xl p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between font-bold">
                <span className="text-slate-600">Invoice Number:</span>
                <span className="text-black font-mono font-black">#{voidingSale.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Date &amp; Time:</span>
                <span className="font-semibold text-black">{voidingSale.date} {voidingSale.time}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Cashier:</span>
                <span className="font-semibold text-black">{voidingSale.cashier} ({voidingSale.unitCode || 'Counter'})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Payment Mode:</span>
                <span className="font-bold text-amber-800">{voidingSale.paymentMethod}</span>
              </div>
              <div className="flex justify-between font-black text-sm pt-1 border-t border-rose-200 text-rose-950">
                <span>Grand Total:</span>
                <span>{formatMoney(voidingSale.grandTotal, settings.currency)}</span>
              </div>
            </div>

            {/* Void Reason Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Select Void Reason:
              </label>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {[
                  'Customer Cancellation',
                  'Wrong Item Selected',
                  'Cashier Error',
                  'Duplicate Bill',
                  'Payment Issue',
                  'Other'
                ].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setSelectedVoidReason(reason)}
                    className={`p-2 rounded-xl text-left font-bold transition-all border cursor-pointer ${
                      selectedVoidReason === reason
                        ? 'bg-rose-500 text-white border-rose-600 shadow-2xs'
                        : 'bg-white text-black border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>

              {selectedVoidReason === 'Other' && (
                <input
                  type="text"
                  placeholder="Enter custom reason for voiding..."
                  value={customVoidReason}
                  onChange={(e) => setCustomVoidReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-rose-300 text-xs font-bold text-black focus:outline-rose-500 mt-2"
                />
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVoidingSale(null)}
                className="flex-1 py-3 rounded-xl bg-white border border-slate-300 text-black font-bold text-xs hover:bg-slate-50 cursor-pointer shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmVoid}
                className="flex-2 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Ban className="w-4 h-4" /> CONFIRM &amp; VOID SALE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Token Details Modal */}
      {selectedTokenDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4 text-black">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-black">
                  Token #{selectedTokenDetail.tokenNumber} ({selectedTokenDetail.tokenCode})
                </h3>
                <div className="text-xs text-slate-500 font-medium">
                  {selectedTokenDetail.businessDate || selectedTokenDetail.date} {selectedTokenDetail.time} · Cashier: {selectedTokenDetail.cashier}
                </div>
              </div>
              <button
                onClick={() => setSelectedTokenDetail(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-amber-50/50 border border-amber-300 rounded-xl text-xs space-y-1">
              <div className="flex justify-between">
                <span className="font-bold text-slate-600">Customer / Phone:</span>
                <span className="font-extrabold text-black">
                  {selectedTokenDetail.customerName || 'None'} {selectedTokenDetail.phoneNumber ? `(${selectedTokenDetail.phoneNumber})` : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-600">Meal Service:</span>
                <span className="font-extrabold text-amber-900">{selectedTokenDetail.mealType || 'General'}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-slate-600">Status:</span>
                <span className="font-black text-black">{selectedTokenDetail.status}</span>
              </div>
            </div>

            <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto pr-1">
              {(selectedTokenDetail.items || []).map((item, idx) => (
                <div key={idx} className="py-2 flex justify-between text-xs">
                  <div>
                    <div className="font-bold text-black">{item.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {item.qty} x {formatMoney(item.price, settings.currency)}
                    </div>
                  </div>
                  <div className="font-extrabold text-black">
                    {formatMoney(item.qty * item.price, settings.currency)}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-200 flex justify-between font-black text-base text-black">
              <span>Token Total:</span>
              <span className="text-amber-900">
                {formatMoney(selectedTokenDetail.totalAmount || selectedTokenDetail.grandTotal || 0, settings.currency)}
              </span>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSelectedTokenDetail(null)}
                className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-black font-bold text-xs cursor-pointer shadow-2xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
