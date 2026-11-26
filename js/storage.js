(function (global) {
  'use strict';

  const STORAGE_KEY = 'apnadukan_pos_data_v1';

  const DEFAULT_SETTINGS = {
    shopName: 'अपना दुकान (ApnaDukan)',
    address: '',
    phone: '',
    footerNote: 'धन्यवाद! फिर पधारें | Thank you! Visit again.',
    logo: ''
  };

  function getSampleInventory() {
    return [
      {
        id: 'itm-sample-1',
        code: 'ITM-101',
        name: 'Tata Salt (टाटा नमक) 1Kg',
        category: 'किराना / Grocery',
        unit: 'Packet',
        buyPrice: 20,
        sellPrice: 28,
        openingStock: 45,
        stockIn: 0,
        stockOut: 0,
        minAlertLevel: 10
      },
      {
        id: 'itm-sample-2',
        code: 'ITM-102',
        name: 'Aashirvaad Atta 5Kg',
        category: 'किराना / Grocery',
        unit: 'Bag',
        buyPrice: 205,
        sellPrice: 235,
        openingStock: 18,
        stockIn: 0,
        stockOut: 0,
        minAlertLevel: 5
      },
      {
        id: 'itm-sample-3',
        code: 'ITM-103',
        name: 'Fortune Mustard Oil 1L',
        category: 'तेल व घी / Oil & Ghee',
        unit: 'Bottle',
        buyPrice: 135,
        sellPrice: 155,
        openingStock: 24,
        stockIn: 0,
        stockOut: 0,
        minAlertLevel: 8
      },
      {
        id: 'itm-sample-4',
        code: 'ITM-104',
        name: 'Amul Taaza Milk 500ml',
        category: 'डेयरी / Dairy',
        unit: 'Packet',
        buyPrice: 25,
        sellPrice: 28,
        openingStock: 4,
        stockIn: 0,
        stockOut: 0,
        minAlertLevel: 10
      },
      {
        id: 'itm-sample-5',
        code: 'ITM-105',
        name: 'Parle-G Gold Biscuit',
        category: 'बिस्कुट / Snacks',
        unit: 'Packet',
        buyPrice: 8,
        sellPrice: 10,
        openingStock: 0,
        stockIn: 0,
        stockOut: 0,
        minAlertLevel: 15
      }
    ];
  }

  function createInitialState(withSamples) {
    return {
      version: 1,
      settings: Object.assign({}, DEFAULT_SETTINGS),
      inventory: withSamples ? getSampleInventory() : [],
      stockInHistory: [],
      billHistory: [],
      nextBillNumber: 101
    };
  }

  function roundQty(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return 0;
    return Math.round((n + Number.EPSILON) * 1000) / 1000;
  }

  function roundMoney(val) {
    const n = Number(val);
    if (!Number.isFinite(n)) return 0;
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function formatINR(val) {
    const num = roundMoney(val);
    return '₹' + num.toLocaleString('en-IN', {
      minimumFractionDigits: num % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    });
  }

  function formatQty(val) {
    const num = roundQty(val);
    return Number.isInteger(num) ? String(num) : String(num);
  }

  function getTodayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function generateId(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function getCurrentStock(item) {
    const open = Number(item.openingStock) || 0;
    const sin = Number(item.stockIn) || 0;
    const sout = Number(item.stockOut) || 0;
    return roundQty(open + sin - sout);
  }

  function getStockStatus(item) {
    const current = getCurrentStock(item);
    const minAlert = Number(item.minAlertLevel) || 0;
    if (current <= 0) {
      return {
        key: 'out',
        label: 'Out of Stock / खत्म',
        shortLabel: 'Out of Stock',
        badgeClass: 'badge-danger'
      };
    }
    if (current <= minAlert) {
      return {
        key: 'low',
        label: 'Low Stock / कम स्टॉक',
        shortLabel: 'Low Stock',
        badgeClass: 'badge-warning'
      };
    }
    return {
      key: 'in',
      label: 'In Stock / स्टॉक में',
      shortLabel: 'In Stock',
      badgeClass: 'badge-success'
    };
  }

  function getStockValue(item) {
    const current = Math.max(0, getCurrentStock(item));
    return roundMoney(current * (Number(item.buyPrice) || 0));
  }

  function addDaysISO(baseIso, deltaDays) {
    const parts = String(baseIso || getTodayISO()).split('-').map(Number);
    const d = new Date(parts[0], (parts[1] || 1) - 1, (parts[2] || 1) + deltaDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function computeSalesAndProfit(bills, inventory) {
    const itemMap = new Map((inventory || []).map((it) => [it.id, it]));
    let totalSales = 0;
    let estProfit = 0;

    for (const bill of (bills || [])) {
      totalSales += Number(bill.grandTotal) || 0;
      let billGrossProfit = 0;
      for (const line of (bill.items || [])) {
        const refItem = itemMap.get(line.itemId);
        const buyPrice = line.buyPrice != null
          ? (Number(line.buyPrice) || 0)
          : (refItem ? (Number(refItem.buyPrice) || 0) : 0);
        const sellPrice = Number(line.rate) || 0;
        const qty = Number(line.qty) || 0;
        billGrossProfit += (sellPrice - buyPrice) * qty;
      }
      estProfit += billGrossProfit - (Number(bill.discount) || 0);
    }

    return {
      totalSales: roundMoney(totalSales),
      estProfit: roundMoney(estProfit),
      billCount: (bills || []).length
    };
  }

  function filterBillsByPeriod(bills, period) {
    const list = bills || [];
    if (!period || period === 'all') return list;
    const today = getTodayISO();
    if (period === 'today') {
      return list.filter((b) => b.date === today);
    }
    if (period === 'month') {
      const start30 = addDaysISO(today, -29);
      return list.filter((b) => b.date >= start30 && b.date <= today);
    }
    if (period === 'year') {
      const start365 = addDaysISO(today, -364);
      return list.filter((b) => b.date >= start365 && b.date <= today);
    }
    return list;
  }

  function computePeriodSummary(state) {
    const inventory = state.inventory || [];
    const bills = state.billHistory || [];
    return {
      today: computeSalesAndProfit(filterBillsByPeriod(bills, 'today'), inventory),
      month: computeSalesAndProfit(filterBillsByPeriod(bills, 'month'), inventory),
      year: computeSalesAndProfit(filterBillsByPeriod(bills, 'year'), inventory),
      all: computeSalesAndProfit(bills, inventory)
    };
  }

  function computeMetrics(state) {
    const inventory = state.inventory || [];
    const bills = state.billHistory || [];

    let totalStockValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    for (const item of inventory) {
      totalStockValue += getStockValue(item);
      const st = getStockStatus(item);
      if (st.key === 'low') lowStockCount += 1;
      else if (st.key === 'out') outOfStockCount += 1;
    }

    const sp = computeSalesAndProfit(bills, inventory);

    return {
      totalProducts: inventory.length,
      totalStockValue: roundMoney(totalStockValue),
      totalSales: sp.totalSales,
      estProfit: sp.estProfit,
      lowStockCount,
      outOfStockCount
    };
  }

  function getNextItemCode(inventory) {
    let maxNum = 100;
    for (const item of inventory || []) {
      const match = String(item.code || '').match(/(\d+)$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
    return 'ITM-' + (maxNum + 1);
  }

  function formatBillNo(num) {
    return 'INV-' + String(num);
  }

  function normalizeState(raw) {
    const s = Object.assign({}, raw || {});
    const settings = Object.assign({}, DEFAULT_SETTINGS, s.settings && typeof s.settings === 'object' ? s.settings : {});
    settings.shopName = String(settings.shopName || DEFAULT_SETTINGS.shopName).trim() || DEFAULT_SETTINGS.shopName;
    settings.address = String(settings.address || '');
    settings.phone = String(settings.phone || '');
    settings.footerNote = String(settings.footerNote || '');
    settings.logo = typeof settings.logo === 'string' && settings.logo.startsWith('data:image/') ? settings.logo : '';

    const inventory = Array.isArray(s.inventory)
      ? s.inventory.map((it) => ({
          id: String(it.id || generateId('itm')),
          code: String(it.code || '').trim(),
          name: String(it.name || '').trim(),
          category: String(it.category || 'अन्य / Other').trim(),
          unit: String(it.unit || 'Pcs').trim(),
          buyPrice: Math.max(0, roundMoney(it.buyPrice)),
          sellPrice: Math.max(0, roundMoney(it.sellPrice)),
          openingStock: Math.max(0, roundQty(it.openingStock)),
          stockIn: Math.max(0, roundQty(it.stockIn)),
          stockOut: Math.max(0, roundQty(it.stockOut)),
          minAlertLevel: Math.max(0, roundQty(it.minAlertLevel))
        })).filter((it) => it.name.length > 0)
      : [];

    const stockInHistory = Array.isArray(s.stockInHistory)
      ? s.stockInHistory.map((entry) => ({
          id: String(entry.id || generateId('sin')),
          date: String(entry.date || getTodayISO()),
          supplierName: String(entry.supplierName || ''),
          itemId: String(entry.itemId || ''),
          itemCode: String(entry.itemCode || ''),
          itemName: String(entry.itemName || ''),
          unit: String(entry.unit || 'Pcs'),
          qty: Math.max(0, roundQty(entry.qty)),
          buyRate: Math.max(0, roundMoney(entry.buyRate)),
          totalCost: Math.max(0, roundMoney(entry.totalCost)),
          notes: String(entry.notes || '')
        }))
      : [];

    const billHistory = Array.isArray(s.billHistory)
      ? s.billHistory.map((bill) => ({
          id: String(bill.id || generateId('bill')),
          billNo: String(bill.billNo || ''),
          date: String(bill.date || getTodayISO()),
          customerName: String(bill.customerName || 'Walk-in Customer'),
          customerPhone: String(bill.customerPhone || ''),
          paymentMode: String(bill.paymentMode || 'Cash'),
          items: Array.isArray(bill.items)
            ? bill.items.map((line) => ({
                itemId: String(line.itemId || ''),
                itemCode: String(line.itemCode || ''),
                itemName: String(line.itemName || ''),
                unit: String(line.unit || 'Pcs'),
                qty: Math.max(0, roundQty(line.qty)),
                rate: Math.max(0, roundMoney(line.rate)),
                buyPrice: Math.max(0, roundMoney(line.buyPrice)),
                amount: Math.max(0, roundMoney(line.amount))
              }))
            : [],
          subTotal: Math.max(0, roundMoney(bill.subTotal)),
          discount: Math.max(0, roundMoney(bill.discount)),
          grandTotal: Math.max(0, roundMoney(bill.grandTotal)),
          createdAt: String(bill.createdAt || new Date().toISOString())
        }))
      : [];

    let nextBillNumber = parseInt(s.nextBillNumber, 10);
    if (!Number.isFinite(nextBillNumber) || nextBillNumber < 101) {
      nextBillNumber = 101;
    }
    for (const bill of billHistory) {
      const m = String(bill.billNo || '').match(/(\d+)$/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n >= nextBillNumber) nextBillNumber = n + 1;
      }
    }

    return {
      version: 1,
      settings,
      inventory,
      stockInHistory,
      billHistory,
      nextBillNumber
    };
  }

  function validateBackupPayload(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('अमान्य बैकअप फाइल: JSON ऑब्जेक्ट नहीं मिला। / Invalid JSON backup object.');
    }
    if (!raw.settings || typeof raw.settings !== 'object') {
      throw new Error('बैकअप फाइल में Shop Settings मौजूद नहीं हैं। / Missing settings in backup.');
    }
    if (!Array.isArray(raw.inventory)) {
      throw new Error('बैकअप फाइल में Inventory लिस्ट मौजूद नहीं है। / Missing inventory array.');
    }
    if (!Array.isArray(raw.stockInHistory)) {
      throw new Error('बैकअप फाइल में Stock In हिस्ट्री मौजूद नहीं है। / Missing stockInHistory array.');
    }
    if (!Array.isArray(raw.billHistory)) {
      throw new Error('बैकअप फाइल में Bill History मौजूद नहीं है। / Missing billHistory array.');
    }
    for (const item of raw.inventory) {
      if (!item || typeof item !== 'object' || !String(item.name || '').trim()) {
        throw new Error('Inventory में कोई आइटम अधूरा है (नाम खाली है)। / Invalid inventory item found.');
      }
    }
    return normalizeState(raw);
  }

  function loadState() {
    try {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const fresh = createInitialState(true);
        saveState(fresh);
        return fresh;
      }
      return normalizeState(JSON.parse(raw));
    } catch (err) {
      console.error('Failed to load state from localStorage:', err);
      return createInitialState(true);
    }
  }

  function saveState(state) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error('Failed to save state to localStorage:', err);
      return false;
    }
  }

  global.ApnaDukanStorage = {
    STORAGE_KEY,
    DEFAULT_SETTINGS,
    createInitialState,
    loadState,
    saveState,
    normalizeState,
    validateBackupPayload,
    getCurrentStock,
    getStockStatus,
    getStockValue,
    computeMetrics,
    computePeriodSummary,
    computeSalesAndProfit,
    filterBillsByPeriod,
    addDaysISO,
    getNextItemCode,
    formatBillNo,
    formatINR,
    formatQty,
    roundQty,
    roundMoney,
    getTodayISO,
    generateId
  };
})(window);
