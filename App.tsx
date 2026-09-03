import React, { useState, useEffect, useRef } from 'react';
import {
  AuthAccount,
  AuthSession,
  Product,
  Sale,
  Register,
  TokenOrder,
  CompanySettings,
  DailyClosingReport,
  CashMovement
} from './types/pos';
import {
  loadData,
  saveData,
  getNowParts,
  uid,
  INITIAL_PRODUCTS,
  DEFAULT_SETTINGS,
  DEFAULT_DEPARTMENTS,
  DEFAULT_ACCOUNTS
} from './services/storage';
import {
  initFirebaseAuth,
  subscribeToFirebaseAccounts,
  saveAccountToFirebase,
  subscribeToFirebaseSales,
  saveSaleToFirebase,
  subscribeToFirebaseTokens,
  saveTokenToFirebase,
  subscribeToFirebaseRegisters,
  saveRegisterToFirebase,
  subscribeToFirebaseClosingReports,
  saveClosingReportToFirebase,
  subscribeToFirebaseProducts,
  getFirebaseProducts,
  saveProductToFirebase,
  saveMultipleProductsToFirebase,
  deleteProductFromFirebase,
  deleteMultipleProductsFromFirebase,
  deleteAllProductsFromFirebase,
  deleteAccountFromFirebase,
  saveSettingsToFirebase,
  syncOfflineQueueToFirebase,
  syncAllLocalDataToFirestore,
  getOfflineQueueCount,
  isFirestoreQuotaExhausted
} from './services/firebase';

// Components
import { LoginModal } from './components/LoginModal';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { POSBilling } from './components/POSBilling';
import { SalesView } from './components/SalesView';
import { SupervisorAdminProducts } from './components/SupervisorAdminProducts';
import { ReportsView } from './components/ReportsView';
import { TokenView } from './components/TokenView';
import { ImportExportView } from './components/ImportExportView';
import { SettingsView } from './components/SettingsView';
import { CashManagementModal } from './components/CashManagementModal';
import { CloseSaleModal } from './components/CloseSaleModal';
import { ReceiptModal } from './components/ReceiptModal';
import { VirtualKeyboard } from './components/VirtualKeyboard';

// Helper to detect legacy / removed units like Unit 1 and LSEG
export const isUnit1OrLseg = (val?: string): boolean => {
  if (!val) return false;
  const str = val.trim().toLowerCase();
  return (
    str === 'unit 1' ||
    str === 'unit1' ||
    str === 'unit_1' ||
    str === 'unit 2' ||
    str === 'unit2' ||
    str === 'unit_2' ||
    str === 'lseg' ||
    str === 'main counter' ||
    str.includes('unit 1') ||
    str.includes('unit1') ||
    str.includes('lseg')
  );
};

export const App: React.FC = () => {
  // Persistence state
  const [accounts, setAccounts] = useState<AuthAccount[]>(() => {
    const loaded = loadData<AuthAccount[]>('pos_accounts', []);
    const filtered = (loaded || []).filter((a) => {
      return !isUnit1OrLseg(a.unitName) && !isUnit1OrLseg(a.unitCode) && !isUnit1OrLseg(a.id);
    });
    const uniqueMap = new Map<string, AuthAccount>();
    filtered.forEach((a) => {
      const key = a.id || a.unitCode?.toUpperCase();
      if (key && !uniqueMap.has(key)) {
        uniqueMap.set(key, a);
      }
    });
    const list = Array.from(uniqueMap.values());
    return list.length > 0 ? list : DEFAULT_ACCOUNTS;
  });
  const [session, setSession] = useState<AuthSession | null>(() => loadData('pos_session', null));
  const [products, setProducts] = useState<Product[]>(() => {
    const loaded = loadData('pos_products', []);
    return loaded && loaded.length > 0 ? loaded : INITIAL_PRODUCTS;
  });
  const [sales, setSales] = useState<Sale[]>(() => {
    const loaded = loadData<Sale[]>('pos_sales', []);
    return (loaded || []).filter(
      (s) => !isUnit1OrLseg(s.unitCode) && !isUnit1OrLseg(s.unitName) && !isUnit1OrLseg(s.cashier) && !isUnit1OrLseg(s.invoiceNumber)
    );
  });
  const [registers, setRegisters] = useState<Register[]>(() => {
    const loaded = loadData<Register[]>('pos_registers', []);
    return (loaded || []).filter(
      (r) => !isUnit1OrLseg(r.unitCode) && !isUnit1OrLseg(r.unitName) && !isUnit1OrLseg(r.cashier) && !isUnit1OrLseg(r.id)
    );
  });
  const [cashMovements, setCashMovements] = useState<CashMovement[]>(() =>
    loadData('pos_cash_movements', [])
  );
  const [tokens, setTokens] = useState<TokenOrder[]>(() => {
    const loaded = loadData<TokenOrder[]>('pos_tokens', []);
    return (loaded || []).filter(
      (t) => !isUnit1OrLseg(t.unitCode) && !isUnit1OrLseg(t.unitName) && !isUnit1OrLseg(t.cashier) && !isUnit1OrLseg(t.id)
    );
  });
  const [closingReports, setClosingReports] = useState<DailyClosingReport[]>(() => {
    const loaded = loadData<DailyClosingReport[]>('pos_closing_reports', []);
    return (loaded || []).filter(
      (c) =>
        !isUnit1OrLseg(c.unitCode) &&
        !isUnit1OrLseg(c.unitName) &&
        !isUnit1OrLseg(c.cashier) &&
        !isUnit1OrLseg(c.registerId) &&
        !isUnit1OrLseg(c.id)
    );
  });
  const [departments, setDepartments] = useState<string[]>(() =>
    loadData('pos_departments', DEFAULT_DEPARTMENTS)
  );
  const [settings, setSettings] = useState<CompanySettings>(() =>
    loadData('pos_settings', DEFAULT_SETTINGS)
  );
  const [reportEmailRecipient, setReportEmailRecipient] = useState<string>(() =>
    loadData('pos_report_email', 'superservpos@gmail.com')
  );
  const [closingTime, setClosingTime] = useState<string>(() =>
    loadData('pos_closing_time', '23:59')
  );

  // App UI State
  const [activePage, setActivePage] = useState<string>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() => getOfflineQueueCount());

  // Modals state
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [isCloseSaleModalOpen, setIsCloseSaleModalOpen] = useState(false);
  const [receiptToPrint, setReceiptToPrint] = useState<Sale | null>(null);
  const [isPrintCopy, setIsPrintCopy] = useState(false);

  // Virtual Keyboard state
  const [keyboardEnabled, setKeyboardEnabled] = useState<boolean>(false);
  const [activeInputRef, setActiveInputRef] = useState<HTMLInputElement | null>(null);

  // Sync offline queue & all local data when coming online or manually requested
  const triggerSync = async () => {
    if (navigator.onLine && !isFirestoreQuotaExhausted()) {
      await syncAllLocalDataToFirestore();
      setPendingSyncCount(getOfflineQueueCount());
    }
  };

  // Firebase Firestore realtime synchronization
  useEffect(() => {
    initFirebaseAuth();

    // Instant direct fetch from Firebase Firestore on boot
    getFirebaseProducts().then((fbProducts) => {
      if (fbProducts && fbProducts.length > 0) {
        setProducts(fbProducts);
        saveData('pos_products', fbProducts);
      }
    }).catch(() => {});

    // Subscribe to products in Firebase (Real-time synchronization across all browsers, tabs, and registers)
    const unsubProducts = subscribeToFirebaseProducts((fbProducts) => {
      if (fbProducts && fbProducts.length > 0) {
        setProducts(fbProducts);
        saveData('pos_products', fbProducts);
      }
    });

    // Subscribe to accounts saved in Firebase
    const unsubAccounts = subscribeToFirebaseAccounts((fbAccounts) => {
      if (fbAccounts) {
        const filtered = fbAccounts.filter(
          (a) => !isUnit1OrLseg(a.unitName) && !isUnit1OrLseg(a.unitCode) && !isUnit1OrLseg(a.id)
        );
        const uniqueMap = new Map<string, AuthAccount>();
        filtered.forEach((a) => {
          const key = a.id || a.unitCode?.toUpperCase();
          if (key && !uniqueMap.has(key)) {
            uniqueMap.set(key, a);
          }
        });
        const list = Array.from(uniqueMap.values());
        setAccounts(list);
        saveData('pos_accounts', list);
      }
    });

    // Subscribe to sales in Firebase
    const unsubSales = subscribeToFirebaseSales((fbSales) => {
      if (fbSales && fbSales.length > 0) {
        setSales((prev) => {
          const map = new Map<string, Sale>();
          prev.filter((s) => !isUnit1OrLseg(s.unitCode) && !isUnit1OrLseg(s.unitName) && !isUnit1OrLseg(s.cashier)).forEach((s) => map.set(s.invoiceNumber, s));
          fbSales.filter((s) => !isUnit1OrLseg(s.unitCode) && !isUnit1OrLseg(s.unitName) && !isUnit1OrLseg(s.cashier)).forEach((s) => map.set(s.invoiceNumber, s));
          return Array.from(map.values());
        });
      }
    });

    // Subscribe to tokens in Firebase
    const unsubTokens = subscribeToFirebaseTokens((fbTokens) => {
      if (fbTokens && fbTokens.length > 0) {
        setTokens((prev) => {
          const map = new Map<string, TokenOrder>();
          prev.filter((t) => !isUnit1OrLseg(t.unitCode) && !isUnit1OrLseg(t.unitName) && !isUnit1OrLseg(t.cashier)).forEach((t) => map.set(t.id, t));
          fbTokens.filter((t) => !isUnit1OrLseg(t.unitCode) && !isUnit1OrLseg(t.unitName) && !isUnit1OrLseg(t.cashier)).forEach((t) => map.set(t.id, t));
          return Array.from(map.values());
        });
      }
    });

    // Subscribe to registers in Firebase
    const unsubRegisters = subscribeToFirebaseRegisters((fbRegs) => {
      if (fbRegs && fbRegs.length > 0) {
        setRegisters((prev) => {
          const map = new Map<string, Register>();
          prev.filter((r) => !isUnit1OrLseg(r.unitCode) && !isUnit1OrLseg(r.unitName) && !isUnit1OrLseg(r.cashier)).forEach((r) => map.set(r.id, r));
          fbRegs.filter((r) => !isUnit1OrLseg(r.unitCode) && !isUnit1OrLseg(r.unitName) && !isUnit1OrLseg(r.cashier)).forEach((r) => map.set(r.id, r));
          return Array.from(map.values());
        });
      }
    });

    // Subscribe to closing reports in Firebase
    const unsubReports = subscribeToFirebaseClosingReports((fbReports) => {
      if (fbReports && fbReports.length > 0) {
        setClosingReports((prev) => {
          const map = new Map<string, DailyClosingReport>();
          prev.filter((c) => !isUnit1OrLseg(c.unitCode) && !isUnit1OrLseg(c.unitName) && !isUnit1OrLseg(c.cashier)).forEach((r) => map.set(r.id, r));
          fbReports.filter((c) => !isUnit1OrLseg(c.unitCode) && !isUnit1OrLseg(c.unitName) && !isUnit1OrLseg(c.cashier)).forEach((r) => map.set(r.id, r));
          return Array.from(map.values());
        });
      }
    });

    return () => {
      unsubProducts();
      unsubAccounts();
      unsubSales();
      unsubTokens();
      unsubRegisters();
      unsubReports();
    };
  }, []);

  // Save to local storage on state update
  useEffect(() => {
    saveData('pos_accounts', accounts);
  }, [accounts]);

  useEffect(() => {
    saveData('pos_session', session);
  }, [session]);

  useEffect(() => {
    saveData('pos_products', products);
  }, [products]);

  useEffect(() => {
    saveData('pos_sales', sales);
  }, [sales]);

  useEffect(() => {
    saveData('pos_registers', registers);
  }, [registers]);

  useEffect(() => {
    saveData('pos_cash_movements', cashMovements);
  }, [cashMovements]);

  useEffect(() => {
    saveData('pos_tokens', tokens);
  }, [tokens]);

  useEffect(() => {
    saveData('pos_closing_reports', closingReports);
  }, [closingReports]);

  useEffect(() => {
    saveData('pos_departments', departments);
  }, [departments]);

  useEffect(() => {
    saveData('pos_settings', settings);
    const root = document.documentElement;
    if (settings.themeMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.setAttribute('data-theme-color', settings.themeColor || 'amber');
  }, [settings]);

  useEffect(() => {
    saveData('pos_report_email', reportEmailRecipient);
  }, [reportEmailRecipient]);

  useEffect(() => {
    saveData('pos_closing_time', closingTime);
  }, [closingTime]);

  // Online / Offline monitor & periodic sync check
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setPendingSyncCount(getOfflineQueueCount());
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic auto-sync interval (throttled & quota-safe)
    const interval = setInterval(() => {
      const count = getOfflineQueueCount();
      setPendingSyncCount(count);
      if (navigator.onLine && count > 0 && !isFirestoreQuotaExhausted()) {
        triggerSync();
      }
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  // AUTO-CLOSE SALE / SHIFT ENGINE (Requirement 6)
  // If the sale / shift was not closed manually, at the scheduled closing time (or when day changes),
  // the system will automatically close open registers and generate closing reports.
  useEffect(() => {
    const checkAutoClose = () => {
      const now = getNowParts();
      const openRegs = registers.filter((r) => r.status === 'OPEN');
      if (openRegs.length === 0) return;

      const [targetH, targetM] = (closingTime || '23:59').split(':').map((n) => parseInt(n) || 0);
      const currentH = now.dateObj.getHours();
      const currentM = now.dateObj.getMinutes();

      const isPastClosingTime =
        currentH > targetH || (currentH === targetH && currentM >= targetM);

      openRegs.forEach((reg) => {
        // Auto close if from a previous day OR past today's configured closing time
        const isFromPreviousDate = reg.businessDate && reg.businessDate < now.date;
        if (isFromPreviousDate || isPastClosingTime) {
          const regSales = sales.filter(
            (s) =>
              (s.registerId === reg.id || s.unitCode === reg.unitCode) &&
              (s.date === reg.businessDate || s.date === reg.date) &&
              !s.isVoided &&
              s.status !== 'VOIDED'
          );
          const totalSalesRevenue = regSales.reduce((sum, s) => sum + s.grandTotal, 0);
          const cashSales = regSales
            .filter((s) => s.paymentMethod === 'CASH')
            .reduce((sum, s) => sum + s.grandTotal, 0);
          const cardSales = regSales
            .filter((s) => s.paymentMethod === 'CARD')
            .reduce((sum, s) => sum + s.grandTotal, 0);
          const creditSales = regSales
            .filter((s) => s.paymentMethod === 'CREDIT')
            .reduce((sum, s) => sum + s.grandTotal, 0);
          const splitSales = regSales
            .filter((s) => s.paymentMethod === 'CASH+CARD')
            .reduce((sum, s) => sum + s.grandTotal, 0);

          const regMovements = (reg.cashMovements || []).concat(
            cashMovements.filter((m) => m.registerId === reg.id)
          );
          const cashInTotal = regMovements
            .filter((m) => m.type === 'CASH_IN')
            .reduce((sum, m) => sum + m.amount, 0);
          const cashOutTotal = regMovements
            .filter((m) => m.type === 'CASH_OUT')
            .reduce((sum, m) => sum + m.amount, 0);

          const openingFloat = reg.openingFloat || 0;
          const expectedCash = openingFloat + cashSales + cashInTotal - cashOutTotal;

          const autoReport: DailyClosingReport = {
            id: uid('close_rep'),
            businessDate: reg.businessDate || now.date,
            date: reg.businessDate || now.date,
            closedAt: `${now.date} ${now.time}`,
            unitCode: reg.unitCode,
            unitName: reg.unitName || reg.unitCode || 'Counter',
            cashier: reg.cashier,
            registerId: reg.id,
            status: 'AUTO CLOSED',
            openingFloat: openingFloat,
            totalSales: totalSalesRevenue,
            cashSales: cashSales,
            cardSales: cardSales,
            creditSales: creditSales,
            splitSales: splitSales,
            cashIn: cashInTotal,
            cashOut: cashOutTotal,
            expectedCash: expectedCash,
            actualCash: expectedCash,
            difference: 0,
            transactionCount: regSales.length,
            notes: `[Auto-Closed] System auto-closed shift at scheduled closing time (${closingTime})`
          };

          handleCloseRegisterReport(autoReport);
        }
      });
    };

    const interval = setInterval(checkAutoClose, 30000); // check every 30s
    checkAutoClose();
    return () => clearInterval(interval);
  }, [registers, sales, cashMovements, closingTime]);

  // Active register for current logged-in cashier
  const activeRegister =
    registers.find(
      (r) =>
        r.status === 'OPEN' &&
        ((session?.unitCode && r.unitCode === session.unitCode) ||
          (session?.user && r.cashier === session.user))
    ) || null;

  // Handle register opening upon Cashier login
  const handleLoginSuccess = (newSession: AuthSession, openingFloat?: number) => {
    setSession(newSession);

    if (newSession.role === 'CASHIER') {
      const now = getNowParts();
      // Check if open register already exists
      const existingOpen = registers.find(
        (r) => r.status === 'OPEN' && r.unitCode === newSession.unitCode
      );

      if (!existingOpen) {
        const newRegister: Register = {
          id: uid('reg'),
          date: now.date,
          businessDate: now.date,
          shift: 'Shift 1',
          cashier: newSession.user,
          unitCode: newSession.unitCode || 'UNIT01',
          unitName: newSession.unitName || newSession.unitCode || 'Counter',
          openingFloat: openingFloat || 0,
          cashMovements: [],
          status: 'OPEN',
          openedAt: `${now.date} ${now.time}`
        };
        setRegisters((prev) => [...prev, newRegister]);
        saveRegisterToFirebase(newRegister);
      }
      setActivePage('dashboard');
    } else {
      setActivePage('dashboard');
    }
  };

  const handleLogout = () => {
    setSession(null);
  };

  // Complete Sale Handler (Real-time Firebase + Thermal receipt)
  const handleCompleteSale = (sale: Sale) => {
    setSales((prev) => [...prev, sale]);
    saveSaleToFirebase(sale);

    // Auto-open thermal receipt modal
    setReceiptToPrint(sale);
    setIsPrintCopy(false);

    // Update active register sales
    if (activeRegister) {
      setRegisters((prev) =>
        prev.map((r) =>
          r.id === activeRegister.id
            ? { ...r, totalSales: (r.totalSales || 0) + sale.grandTotal }
            : r
        )
      );
    }
  };

  // Record Sale without popping open the POS receipt modal (used for token orders where token slips/voucher print directly)
  const handleRecordSaleOnly = (sale: Sale) => {
    setSales((prev) => [...prev, sale]);
    saveSaleToFirebase(sale);

    if (activeRegister) {
      setRegisters((prev) =>
        prev.map((r) =>
          r.id === activeRegister.id
            ? { ...r, totalSales: (r.totalSales || 0) + sale.grandTotal }
            : r
        )
      );
    }
  };

  // Token Handlers
  const handleSaveToken = (token: TokenOrder) => {
    setTokens((prev) => {
      const idx = prev.findIndex((t) => t.id === token.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = token;
        return copy;
      }
      return [token, ...prev];
    });
    saveTokenToFirebase(token);
  };

  const handleSaveTokens = (newTokens: TokenOrder[]) => {
    if (!newTokens || newTokens.length === 0) return;
    setTokens((prev) => {
      const newIds = new Set(newTokens.map((t) => t.id));
      const remaining = prev.filter((t) => !newIds.has(t.id));
      return [...newTokens, ...remaining];
    });
    newTokens.forEach((t) => saveTokenToFirebase(t));
  };

  const handleUpdateTokenStatus = (tokenId: string, status: 'COMPLETED' | 'CANCELLED') => {
    const now = getNowParts();
    setTokens((prev) =>
      prev.map((t) => {
        if (t.id === tokenId) {
          const updated: TokenOrder = {
            ...t,
            status,
            completedAt: `${now.date} ${now.time}`
          };
          saveTokenToFirebase(updated);
          return updated;
        }
        return t;
      })
    );
  };

  const handleUpdateTokenPayment = (tokenId: string, paymentStatus: 'PAID' | 'UNPAID') => {
    setTokens((prev) =>
      prev.map((t) => {
        if (t.id === tokenId) {
          const updated: TokenOrder = {
            ...t,
            paymentStatus
          };
          saveTokenToFirebase(updated);
          return updated;
        }
        return t;
      })
    );
  };

  // Cash Movements Handlers
  const handleSaveCashMovement = (movement: CashMovement) => {
    setCashMovements((prev) => [movement, ...prev]);

    const now = getNowParts();
    if (activeRegister) {
      setRegisters((prev) =>
        prev.map((r) => {
          if (r.id === activeRegister.id) {
            const updated = {
              ...r,
              cashMovements: [...(r.cashMovements || []), movement]
            };
            saveRegisterToFirebase(updated);
            return updated;
          }
          return r;
        })
      );
    } else {
      const newReg: Register = {
        id: uid('reg'),
        date: now.date,
        businessDate: now.date,
        shift: 'Shift 1',
        cashier: session?.user || 'Cashier',
        unitCode: session?.unitCode || 'UNIT01',
        unitName: session?.unitName || session?.unitCode || 'Counter',
        openingFloat: 0,
        cashMovements: [movement],
        status: 'OPEN',
        openedAt: `${now.date} ${now.time}`
      };
      setRegisters((prev) => [...prev, newReg]);
      saveRegisterToFirebase(newReg);
    }
  };

  const handleAddCashMovement = (
    type: 'IN' | 'OUT' | 'CASH_IN' | 'CASH_OUT',
    amount: number,
    reason: string
  ) => {
    const now = getNowParts();
    const movement: CashMovement = {
      id: uid('cash_mov'),
      type: type === 'IN' || type === 'CASH_IN' ? 'CASH_IN' : 'CASH_OUT',
      amount,
      reason,
      date: now.date,
      time: now.time,
      cashier: session?.user || 'Cashier',
      unit: session?.unitCode || activeRegister?.unitCode || 'UNIT01',
      registerId: activeRegister?.id || 'default_reg',
      timestamp: `${now.date} ${now.time}`
    };
    handleSaveCashMovement(movement);
  };

  // Close Register / Shift Report Handler
  const handleCloseRegisterReport = (report: DailyClosingReport) => {
    // 1. Save closing report to state and Firebase
    setClosingReports((prev) => [report, ...prev]);
    saveClosingReportToFirebase(report);

    // 2. Mark register as CLOSED and sync to Firebase
    setRegisters((prev) =>
      prev.map((r) => {
        if (r.id === report.registerId || (r.unitCode === report.unitCode && r.status === 'OPEN')) {
          const closedReg: Register = {
            ...r,
            status: 'CLOSED',
            closingCash: report.actualCash || 0,
            actualCash: report.actualCash,
            expectedCash: report.expectedCash,
            difference: report.difference,
            closedAt: report.closedAt,
            notes: report.notes || report.note
          };
          saveRegisterToFirebase(closedReg);
          return closedReg;
        }
        return r;
      })
    );
  };

  // Products CRUD Handlers
  const handleSaveProduct = (prod: Product) => {
    setProducts((prev) => {
      const idx = prev.findIndex((p) => p.id === prod.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = prod;
        return copy;
      }
      return [prod, ...prev];
    });
    saveProductToFirebase(prod);
  };

  const handleDeleteProduct = (id: string) => {
    setProducts((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      saveData('pos_products', updated);
      return updated;
    });
    deleteProductFromFirebase(id);
  };

  const handleDeleteMultipleProducts = (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    setProducts((prev) => {
      const updated = prev.filter((p) => !idSet.has(p.id));
      saveData('pos_products', updated);
      return updated;
    });
    deleteMultipleProductsFromFirebase(ids);
  };

  const handleDeleteAllProducts = () => {
    const allIds = products.map((p) => p.id);
    setProducts([]);
    saveData('pos_products', []);
    deleteAllProductsFromFirebase(allIds);
  };

  const handleImportProducts = async (importedProducts: Product[]) => {
    setProducts(importedProducts);
    saveData('pos_products', importedProducts);
    await saveMultipleProductsToFirebase(importedProducts);
  };

  const handleBulkUpdatePrices = async (updates: { id: string; price: number }[]) => {
    const updateMap = new Map<string, number>();
    updates.forEach((u) => updateMap.set(u.id, u.price));

    const updated = products.map((p) => {
      if (updateMap.has(p.id)) {
        return {
          ...p,
          sellPrice: updateMap.get(p.id)!,
          updatedDate: getNowParts().date
        };
      }
      return p;
    });

    setProducts(updated);
    saveData('pos_products', updated);
    const affectedProducts = updated.filter((p) => updateMap.has(p.id));
    await saveMultipleProductsToFirebase(affectedProducts);
  };

  const handleDeleteAccount = (id: string) => {
    const acc = accounts.find(
      (a) => a.id === id || a.unitCode === id || a.unitCode?.toUpperCase() === id.toUpperCase()
    );
    const unitCode = acc?.unitCode || id;
    const accountId = acc?.id || id;
    const unitCodeUpper = unitCode.toUpperCase();

    setAccounts((prev) => {
      const updated = prev.filter(
        (a) =>
          a.id !== accountId &&
          a.id !== id &&
          a.unitCode !== unitCode &&
          a.unitCode?.toUpperCase() !== unitCodeUpper
      );
      saveData('pos_accounts', updated);
      return updated;
    });

    if (acc) {
      deleteAccountFromFirebase(acc.unitCode);
      deleteAccountFromFirebase(acc.id);
    } else {
      deleteAccountFromFirebase(id);
    }
  };

  const handleSaveAccount = (account: AuthAccount) => {
    setAccounts((prev) => {
      const idx = prev.findIndex((a) => a.id === account.id || a.unitCode === account.unitCode);
      let updated: AuthAccount[];
      if (idx >= 0) {
        updated = [...prev];
        updated[idx] = account;
      } else {
        updated = [...prev, account];
      }
      saveData('pos_accounts', updated);
      return updated;
    });
    saveAccountToFirebase(account);
  };

  const handleVoidSale = (sale: Sale, reason: string) => {
    const now = getNowParts();
    const updatedSale: Sale = {
      ...sale,
      status: 'VOIDED',
      isVoided: true,
      voidReason: reason,
      voidedAt: `${now.date} ${now.time}`,
      voidedBy: session?.user || 'Admin'
    };

    setSales((prev) => {
      const updated = prev.map((s) => (s.invoiceNumber === sale.invoiceNumber ? updatedSale : s));
      saveData('pos_sales', updated);
      return updated;
    });

    saveSaleToFirebase(updatedSale);

    // Restore stock if inventory tracking is enabled
    if (sale.items && sale.items.length > 0) {
      setProducts((prev) => {
        let hasChanges = false;
        const updated = prev.map((prod) => {
          const soldItem = sale.items.find((it) => it.productId === prod.id || it.name === prod.name);
          if (soldItem && typeof prod.stockQty === 'number') {
            hasChanges = true;
            return {
              ...prod,
              stockQty: prod.stockQty + soldItem.qty
            };
          }
          return prod;
        });
        if (hasChanges) {
          saveData('pos_products', updated);
          saveMultipleProductsToFirebase(updated);
        }
        return updated;
      });
    }
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col font-sans antialiased selection:bg-amber-500 selection:text-black">
      {/* 1. Login Modal Gate */}
      {!session && (
        <LoginModal
          accounts={accounts}
          settings={settings}
          onLoginSuccess={handleLoginSuccess}
          onDeleteAccount={handleDeleteAccount}
          onSaveAccount={(acc) => {
            setAccounts((prev) => {
              const map = new Map<string, AuthAccount>();
              prev.forEach((a) => map.set(a.unitCode.toUpperCase(), a));
              map.set(acc.unitCode.toUpperCase(), acc);
              return Array.from(map.values());
            });
            saveAccountToFirebase(acc);
          }}
        />
      )}

      {/* 2. Main Authenticated App Layout */}
      {session && (
        <div className="flex-1 flex flex-col h-screen overflow-hidden bg-white text-black">
          {/* Top Application Header */}
          <Header
            session={session}
            settings={settings}
            activeRegister={activeRegister}
            isOnline={isOnline}
            pendingSyncCount={pendingSyncCount}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
            onToggleKeyboard={() => setKeyboardEnabled(!keyboardEnabled)}
            onLogout={handleLogout}
            onTriggerSync={triggerSync}
          />

          {/* Body with Sidebar and Main Content */}
          <div className="flex-1 flex overflow-hidden bg-white">
            <Sidebar
              activePage={activePage}
              session={session}
              collapsed={sidebarCollapsed}
              onSelectPage={(page) => setActivePage(page)}
            />

            <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 bg-white">
              {activePage === 'dashboard' && (
                <Dashboard
                  sales={sales}
                  products={products}
                  session={session}
                  activeRegister={activeRegister}
                  settings={settings}
                  accounts={accounts}
                  onNavigate={(page) => setActivePage(page)}
                  onOpenCashManagement={() => setIsCashModalOpen(true)}
                  onOpenCloseSale={() => setIsCloseSaleModalOpen(true)}
                  onViewSale={(sale) => {
                    setReceiptToPrint(sale);
                    setIsPrintCopy(true);
                  }}
                />
              )}

              {activePage === 'pos' && session && (session.role === 'CASHIER' || session.role === 'ADMIN') && (
                <POSBilling
                  products={products}
                  session={session}
                  activeRegister={activeRegister}
                  settings={settings}
                  departments={departments}
                  tokens={tokens}
                  invoiceCounter={
                    sales.filter(
                      (s) =>
                        (s.unitCode && session.unitCode && s.unitCode.toUpperCase() === session.unitCode.toUpperCase()) ||
                        (!session.unitCode && (!s.unitCode || s.unitCode === 'UC01'))
                    ).length + 1
                  }
                  onCompleteSale={handleCompleteSale}
                  onSaleCompleted={handleCompleteSale}
                  onRecordSaleOnly={handleRecordSaleOnly}
                  onSaveToken={handleSaveToken}
                  onSaveTokens={handleSaveTokens}
                  onOpenCashManagement={() => setIsCashModalOpen(true)}
                  onOpenCloseSale={() => setIsCloseSaleModalOpen(true)}
                />
              )}

              {activePage === 'sales' && (
                <SalesView
                  sales={sales}
                  tokens={tokens}
                  settings={settings}
                  session={session}
                  accounts={accounts}
                  onViewSale={(sale) => {
                    setReceiptToPrint(sale);
                    setIsPrintCopy(false);
                  }}
                  onPrintSale={(sale) => {
                    setReceiptToPrint(sale);
                    setIsPrintCopy(true);
                  }}
                  onVoidSale={handleVoidSale}
                />
              )}

              {activePage === 'token' && (
                <TokenView
                  products={products}
                  tokens={tokens}
                  session={session}
                  settings={settings}
                  currency={settings.currency}
                  onSaveToken={handleSaveToken}
                  onSaveTokens={handleSaveTokens}
                  onUpdateTokenStatus={handleUpdateTokenStatus}
                  onUpdateTokenPayment={handleUpdateTokenPayment}
                />
              )}

              {(activePage === 'products' || activePage === 'price-update') &&
                session.role === 'ADMIN' && (
                  <SupervisorAdminProducts
                    products={products}
                    settings={settings}
                    onSaveProduct={handleSaveProduct}
                    onDeleteProduct={handleDeleteProduct}
                    onDeleteMultipleProducts={handleDeleteMultipleProducts}
                    onDeleteAllProducts={handleDeleteAllProducts}
                    onImportProducts={handleImportProducts}
                    onBulkUpdatePrices={handleBulkUpdatePrices}
                    onSaveSettings={(s) => {
                      setSettings(s);
                      saveSettingsToFirebase(s);
                      saveData('pos_settings', s);
                    }}
                  />
                )}

              {activePage === 'reports' && (
                <ReportsView
                  sales={sales}
                  tokens={tokens}
                  products={products}
                  closingReports={closingReports}
                  settings={settings}
                  session={session}
                  accounts={accounts}
                  reportEmailRecipient={reportEmailRecipient}
                  onSaveReportEmailRecipient={(e) => setReportEmailRecipient(e)}
                />
              )}

              {activePage === 'import-export' && session.role === 'ADMIN' && (
                <ImportExportView
                  products={products}
                  sales={sales}
                  registers={registers}
                  tokens={tokens}
                  settings={settings}
                  onImportProducts={handleImportProducts}
                  onRestoreBackup={(backup) => {
                    if (backup.products) handleImportProducts(backup.products);
                    if (backup.sales) setSales(backup.sales);
                    if (backup.settings) setSettings(backup.settings);
                  }}
                />
              )}

              {activePage === 'settings' && session.role === 'ADMIN' && (
                <SettingsView
                  settings={settings}
                  departments={departments}
                  reportEmailRecipient={reportEmailRecipient}
                  closingTime={closingTime}
                  accounts={accounts}
                  onSaveSettings={(s) => setSettings(s)}
                  onSaveDepartments={(d) => setDepartments(d)}
                  onSaveEmailRecipient={(e) => setReportEmailRecipient(e)}
                  onSaveClosingTime={(t) => setClosingTime(t)}
                  onDeleteAccount={handleDeleteAccount}
                  onSaveAccount={handleSaveAccount}
                />
              )}
            </main>
          </div>
        </div>
      )}

      {/* Cash In / Out Modal */}
      {isCashModalOpen && (
        <CashManagementModal
          isOpen={isCashModalOpen}
          activeRegister={activeRegister}
          session={session}
          currency={settings.currency}
          onClose={() => setIsCashModalOpen(false)}
          onAddCashMovement={handleAddCashMovement}
        />
      )}

      {/* Close Sale & Shift Modal */}
      {isCloseSaleModalOpen && (
        <CloseSaleModal
          isOpen={isCloseSaleModalOpen}
          activeRegister={activeRegister}
          sales={sales}
          tokens={tokens}
          cashMovements={cashMovements}
          session={session}
          currency={settings.currency}
          reportEmailRecipient={reportEmailRecipient}
          onClose={() => setIsCloseSaleModalOpen(false)}
          onConfirmClose={handleCloseRegisterReport}
          onLogout={handleLogout}
        />
      )}

      {/* Direct Thermal Receipt Printer Modal */}
      {receiptToPrint && (
        <ReceiptModal
          sale={receiptToPrint}
          settings={settings}
          isCopy={isPrintCopy}
          onClose={() => {
            setReceiptToPrint(null);
            if (session && (session.role === 'CASHIER' || session.role === 'ADMIN')) {
              setActivePage('pos');
            }
          }}
          onNewSale={() => {
            setReceiptToPrint(null);
            if (session && (session.role === 'CASHIER' || session.role === 'ADMIN')) {
              setActivePage('pos');
            }
          }}
        />
      )}

      {/* Floating Drag & Drop On-Screen Virtual Keyboard */}
      {keyboardEnabled && (
        <VirtualKeyboard
          enabled={keyboardEnabled}
          activeInput={activeInputRef}
          onClose={() => setKeyboardEnabled(false)}
          onToggle={() => setKeyboardEnabled(!keyboardEnabled)}
        />
      )}
    </div>
  );
};

export default App;
