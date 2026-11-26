(function (global) {
  'use strict';

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  function exportToJSON(state) {
    const storage = global.ApnaDukanStorage;
    const payload = {
      app: 'ApnaDukan',
      version: state.version || 1,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      inventory: state.inventory,
      stockInHistory: state.stockInHistory,
      billHistory: state.billHistory,
      nextBillNumber: state.nextBillNumber
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const filename = `ApnaDukan-Backup-${storage.getTodayISO()}.json`;
    triggerDownload(blob, filename);
    return filename;
  }

  function exportToExcel(state) {
    if (!global.XLSX) {
      throw new Error('SheetJS (XLSX) library is not loaded.');
    }
    const XLSX = global.XLSX;
    const storage = global.ApnaDukanStorage;
    const metrics = storage.computeMetrics(state);

    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summaryRows = [
      { Metric: 'Shop Name', Value: state.settings.shopName },
      { Metric: 'Address', Value: state.settings.address || '-' },
      { Metric: 'Mobile', Value: state.settings.phone || '-' },
      { Metric: 'Export Date', Value: storage.getTodayISO() },
      { Metric: '', Value: '' },
      { Metric: 'Total Products', Value: metrics.totalProducts },
      { Metric: 'Total Stock Value (₹)', Value: metrics.totalStockValue },
      { Metric: 'Total Sales (₹)', Value: metrics.totalSales },
      { Metric: 'Est. Profit (₹)', Value: metrics.estProfit },
      { Metric: 'Low Stock Items', Value: metrics.lowStockCount },
      { Metric: 'Out of Stock Items', Value: metrics.outOfStockCount },
      { Metric: 'Total Bills', Value: (state.billHistory || []).length },
      { Metric: 'Total Stock In Entries', Value: (state.stockInHistory || []).length }
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    wsSummary['!cols'] = [{ wch: 28 }, { wch: 36 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    // Sheet 2: Inventory
    const invRows = (state.inventory || []).map((item) => {
      const current = storage.getCurrentStock(item);
      const status = storage.getStockStatus(item);
      return {
        'Item Code': item.code,
        'Item Name': item.name,
        'Category': item.category,
        'Unit': item.unit,
        'Buy Price (₹)': item.buyPrice,
        'Sell Price (₹)': item.sellPrice,
        'Opening Stock': item.openingStock,
        'Stock In (+)': item.stockIn,
        'Stock Out (-)': item.stockOut,
        'Current Stock': current,
        'Min Alert Level': item.minAlertLevel,
        'Status': status.shortLabel,
        'Stock Value (₹)': storage.getStockValue(item)
      };
    });
    const wsInventory = XLSX.utils.json_to_sheet(
      invRows.length ? invRows : [{ Message: 'No inventory items' }]
    );
    wsInventory['!cols'] = [
      { wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 10 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
      { wch: 12 }, { wch: 14 }, { wch: 15 }, { wch: 14 }, { wch: 16 }
    ];
    XLSX.utils.book_append_sheet(wb, wsInventory, 'Inventory');

    // Sheet 3: Stock In
    const sinRows = (state.stockInHistory || []).map((entry) => ({
      'Date': entry.date,
      'Supplier Name': entry.supplierName || '-',
      'Item Code': entry.itemCode || '-',
      'Item Name': entry.itemName,
      'Unit': entry.unit,
      'Quantity Added': entry.qty,
      'Buy Rate (₹)': entry.buyRate,
      'Total Cost (₹)': entry.totalCost,
      'Notes': entry.notes || ''
    }));
    const wsStockIn = XLSX.utils.json_to_sheet(
      sinRows.length ? sinRows : [{ Message: 'No stock-in records' }]
    );
    wsStockIn['!cols'] = [
      { wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 26 },
      { wch: 10 }, { wch: 15 }, { wch: 13 }, { wch: 15 }, { wch: 28 }
    ];
    XLSX.utils.book_append_sheet(wb, wsStockIn, 'Stock In');

    // Sheet 4: Bill History
    const billRows = (state.billHistory || []).map((bill) => ({
      'Bill No': bill.billNo,
      'Date': bill.date,
      'Customer Name': bill.customerName,
      'Customer Phone': bill.customerPhone || '-',
      'Payment Mode': bill.paymentMode,
      'Items Count': (bill.items || []).length,
      'Items Details': (bill.items || []).map((l) => `${l.itemName} (${l.qty} ${l.unit})`).join(', '),
      'Sub Total (₹)': bill.subTotal,
      'Discount (₹)': bill.discount,
      'Grand Total (₹)': bill.grandTotal
    }));
    const wsBills = XLSX.utils.json_to_sheet(
      billRows.length ? billRows : [{ Message: 'No bills recorded' }]
    );
    wsBills['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 15 },
      { wch: 14 }, { wch: 12 }, { wch: 42 }, { wch: 14 }, { wch: 12 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(wb, wsBills, 'Bill History');

    const filename = `ApnaDukan-Report-${storage.getTodayISO()}.xlsx`;
    XLSX.writeFile(wb, filename);
    return filename;
  }

  global.ApnaDukanExport = {
    exportToJSON,
    exportToExcel
  };
})(window);
