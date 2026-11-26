(function (global) {
  'use strict';

  const Storage = global.ApnaDukanStorage;
  const PDF = global.ApnaDukanPDF;
  const Export = global.ApnaDukanExport;

  let state = Storage.loadState();
  let stockChartInstance = null;
  let billRowsState = [];
  let pendingDeleteBillId = null;
  let pendingImportState = null;
  let pendingConfirmCallback = null;
  let activeViewBillId = null;
  let deferredInstallPrompt = null;
  let activeStockSystem = 'all';

  function isUrgentStock(item) {
    const key = Storage.getStockStatus(item).key;
    return key === 'low' || key === 'out';
  }

  function sortUrgentFirst(items) {
    return [...items].sort((a, b) => Storage.getCurrentStock(a) - Storage.getCurrentStock(b));
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'success');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(14px)';
      toast.style.transition = 'opacity 0.2s, transform 0.2s';
      setTimeout(() => toast.remove(), 220);
    }, 3200);
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  }

  function openConfirmDialog(title, message, okLabel, okClass, callback) {
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').textContent = message;
    const okBtn = document.getElementById('confirm-modal-ok-btn');
    okBtn.textContent = okLabel || 'हाँ / Confirm';
    okBtn.className = 'btn ' + (okClass || 'btn-primary');
    pendingConfirmCallback = callback;
    openModal('confirm-modal');
  }

  function persistAndRefresh() {
    const saved = Storage.saveState(state);
    if (!saved) {
      showToast('स्टोरेज भर गया है! कृपया छोटा लोगो उपयोग करें या पुराना डेटा बैकअप लें।', 'error');
    }
    renderAll();
  }

  function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach((sec) => {
      sec.classList.toggle('active', sec.id === 'view-' + viewName);
    });
    document.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-nav') === viewName);
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (viewName === 'dashboard') {
      renderDashboardChart();
    }
  }

  // =========================================================
  // (A) HEADER & SHOP SETTINGS
  // =========================================================
  function renderHeader() {
    const { shopName, address, phone, logo } = state.settings;
    document.getElementById('header-shop-name').textContent = shopName || 'अपना दुकान (ApnaDukan)';

    const parts = [];
    if (address) parts.push(address);
    if (phone) parts.push('Mob: ' + phone);
    const subEl = document.getElementById('header-shop-subtitle');
    if (parts.length) {
      subEl.textContent = parts.join(' • ');
      subEl.classList.remove('hidden');
    } else {
      subEl.textContent = '';
      subEl.classList.add('hidden');
    }

    // Rule A: strictly hide logo element if no logo uploaded
    const logoImg = document.getElementById('header-shop-logo');
    if (logo && logo.startsWith('data:image/')) {
      logoImg.src = logo;
      logoImg.classList.remove('hidden');
    } else {
      logoImg.removeAttribute('src');
      logoImg.classList.add('hidden');
    }
  }

  function readSettingsInputs() {
    return {
      shopName: document.getElementById('set-shop-name').value.trim(),
      phone: document.getElementById('set-phone').value.trim(),
      address: document.getElementById('set-address').value.trim(),
      footerNote: document.getElementById('set-footer-note').value.trim()
    };
  }

  function applySettingsInputsToState(useDefaultIfEmpty) {
    const vals = readSettingsInputs();
    state.settings.shopName = vals.shopName || (useDefaultIfEmpty ? Storage.DEFAULT_SETTINGS.shopName : state.settings.shopName);
    state.settings.phone = vals.phone;
    state.settings.address = vals.address;
    state.settings.footerNote = vals.footerNote;
  }

  function renderLogoPreview() {
    const s = state.settings;
    const preview = document.getElementById('set-logo-preview');
    const removeBtn = document.getElementById('set-logo-remove-btn');
    if (s.logo && s.logo.startsWith('data:image/')) {
      preview.src = s.logo;
      preview.classList.remove('hidden');
      removeBtn.classList.remove('hidden');
    } else {
      preview.removeAttribute('src');
      preview.classList.add('hidden');
      removeBtn.classList.add('hidden');
    }
  }

  function renderSettingsForm() {
    const s = state.settings;
    document.getElementById('set-shop-name').value = s.shopName || '';
    document.getElementById('set-phone').value = s.phone || '';
    document.getElementById('set-address').value = s.address || '';
    document.getElementById('set-footer-note').value = s.footerNote || '';
    renderLogoPreview();
  }

  function resizeLogoToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Image read failed'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Invalid image file'));
        img.onload = () => {
          const maxDim = 360;
          let w = img.naturalWidth || img.width || 300;
          let h = img.naturalHeight || img.height || 300;
          if (w > maxDim || h > maxDim) {
            const ratio = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, w);
          canvas.height = Math.max(1, h);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const isPngLike = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/svg+xml';
          let dataUrl = canvas.toDataURL(isPngLike ? 'image/png' : 'image/jpeg', 0.88);
          if (dataUrl.length > 350000) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          }
          resolve(dataUrl);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // =========================================================
  // (B) DASHBOARD
  // =========================================================
  function buildDashboardRowHtml(item, showMinAlert) {
    const current = Storage.getCurrentStock(item);
    const st = Storage.getStockStatus(item);
    const stockCell = showMinAlert
      ? `<strong>${Storage.formatQty(current)}</strong> ${escapeHtml(item.unit)} <span style="font-size: 0.75rem; color: var(--text-soft);">(Min: ${Storage.formatQty(item.minAlertLevel)})</span>`
      : `<strong>${Storage.formatQty(current)}</strong> ${escapeHtml(item.unit)}`;
    return `
      <tr>
        <td><span class="badge badge-navy">${escapeHtml(item.code)}</span></td>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td>${escapeHtml(item.category)}</td>
        <td class="text-right tabular">${stockCell}</td>
        <td class="text-right tabular">${Storage.formatINR(item.sellPrice)}</td>
        <td><span class="badge ${st.badgeClass}">${escapeHtml(st.label)}</span></td>
        <td class="text-right">
          <button type="button" class="btn btn-sm ${showMinAlert ? 'btn-primary' : 'btn-outline'} quick-stock-in-btn" data-item-id="${escapeHtml(item.id)}">+ Stock</button>
        </td>
      </tr>
    `;
  }

  function buildDashboardCardHtml(item, isUrgent) {
    const current = Storage.getCurrentStock(item);
    const st = Storage.getStockStatus(item);
    return `
      <div class="m-card${isUrgent ? ' is-urgent' : ''}">
        <div class="m-card-head">
          <div>
            <span class="badge badge-navy">${escapeHtml(item.code)}</span>
            <h4 class="m-card-title" style="margin-top: 4px;">${escapeHtml(item.name)}</h4>
            <div class="m-card-sub">${escapeHtml(item.category)}${isUrgent ? ' • Min Alert: ' + Storage.formatQty(item.minAlertLevel) + ' ' + escapeHtml(item.unit) : ''}</div>
          </div>
          <span class="badge ${st.badgeClass}">${escapeHtml(st.shortLabel)}</span>
        </div>
        <div class="m-card-stats" style="grid-template-columns: repeat(2, 1fr);">
          <div>
            <div class="m-stat-label">मौजूदा स्टॉक / Stock</div>
            <div class="m-stat-val">${Storage.formatQty(current)} ${escapeHtml(item.unit)}</div>
          </div>
          <div>
            <div class="m-stat-label">बिक्री मूल्य / Sell Price</div>
            <div class="m-stat-val">${Storage.formatINR(item.sellPrice)}</div>
          </div>
        </div>
        <div class="m-card-actions">
          <button type="button" class="btn btn-sm ${isUrgent ? 'btn-primary' : 'btn-outline'} quick-stock-in-btn" data-item-id="${escapeHtml(item.id)}">+ माल जोड़ें / Stock In</button>
        </div>
      </div>
    `;
  }

  function renderDashboard() {
    const metrics = Storage.computeMetrics(state);
    document.getElementById('kpi-total-products').textContent = String(metrics.totalProducts);
    document.getElementById('kpi-stock-value').textContent = Storage.formatINR(metrics.totalStockValue);
    document.getElementById('kpi-total-sales').textContent = Storage.formatINR(metrics.totalSales);
    document.getElementById('kpi-est-profit').textContent = Storage.formatINR(metrics.estProfit);
    document.getElementById('kpi-low-stock').textContent = String(metrics.lowStockCount);
    document.getElementById('kpi-out-stock').textContent = String(metrics.outOfStockCount);

    const alertCount = metrics.lowStockCount + metrics.outOfStockCount;
    ['nav-stock-badge-desktop', 'nav-stock-badge-mobile'].forEach((id) => {
      const badge = document.getElementById(id);
      if (!badge) return;
      if (alertCount > 0) {
        badge.textContent = alertCount > 99 ? '99+' : String(alertCount);
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    });

    const lowItems = sortUrgentFirst(state.inventory.filter(isUrgentStock));
    const fullItems = sortUrgentFirst(state.inventory.filter((it) => !isUrgentStock(it)));

    // Priority alert banner at top of dashboard
    const alertStrip = document.getElementById('dashboard-low-alert-strip');
    if (alertCount > 0) {
      document.getElementById('dashboard-alert-title').textContent =
        `⚠ ध्यान दें: ${alertCount} आइटम कम या खत्म स्टॉक में हैं! (${metrics.outOfStockCount} खत्म, ${metrics.lowStockCount} कम)`;
      document.getElementById('dashboard-alert-sub').textContent =
        lowItems.slice(0, 3).map((i) => `${i.name} (${Storage.formatQty(Storage.getCurrentStock(i))})`).join(' • ');
      alertStrip.classList.remove('hidden');
    } else {
      alertStrip.classList.add('hidden');
    }

    document.getElementById('dashboard-low-badge').textContent = `${lowItems.length} आइटम`;
    document.getElementById('dashboard-full-badge').textContent = `${fullItems.length} आइटम`;

    const lowTbody = document.getElementById('dashboard-low-tbody');
    const lowCards = document.getElementById('dashboard-low-cards');
    if (!lowItems.length) {
      const msg = state.inventory.length
        ? '✅ बढ़िया! अभी कोई कम या खत्म स्टॉक आइटम नहीं है।'
        : 'अभी कोई आइटम नहीं है। Inventory टैब में नया आइटम जोड़ें।';
      lowTbody.innerHTML = `<tr><td colspan="7" class="empty-state">${msg}</td></tr>`;
      lowCards.innerHTML = `<div class="empty-state">${msg}</div>`;
    } else {
      lowTbody.innerHTML = lowItems.map((it) => buildDashboardRowHtml(it, true)).join('');
      lowCards.innerHTML = lowItems.map((it) => buildDashboardCardHtml(it, true)).join('');
    }

    const fullTbody = document.getElementById('dashboard-full-tbody');
    const fullCards = document.getElementById('dashboard-full-cards');
    if (!fullItems.length) {
      const msg = 'पूरा स्टॉक श्रेणी में अभी कोई आइटम नहीं है।';
      fullTbody.innerHTML = `<tr><td colspan="7" class="empty-state">${msg}</td></tr>`;
      fullCards.innerHTML = `<div class="empty-state">${msg}</div>`;
    } else {
      fullTbody.innerHTML = fullItems.map((it) => buildDashboardRowHtml(it, false)).join('');
      fullCards.innerHTML = fullItems.map((it) => buildDashboardCardHtml(it, false)).join('');
    }

    renderDashboardChart();
  }

  function renderDashboardChart() {
    const emptyEl = document.getElementById('chart-empty-state');
    const wrapperEl = document.getElementById('chart-wrapper');
    const canvas = document.getElementById('stock-chart');
    if (!canvas || !global.Chart) return;

    if (!state.inventory.length) {
      emptyEl.classList.remove('hidden');
      wrapperEl.classList.add('hidden');
      if (stockChartInstance) {
        stockChartInstance.destroy();
        stockChartInstance = null;
      }
      return;
    }

    emptyEl.classList.add('hidden');
    wrapperEl.classList.remove('hidden');

    const topItems = [...state.inventory]
      .sort((a, b) => Storage.getCurrentStock(b) - Storage.getCurrentStock(a))
      .slice(0, 12);

    const labels = topItems.map((it) => it.name.length > 24 ? it.name.slice(0, 22) + '...' : it.name);
    const values = topItems.map((it) => Math.max(0, Storage.getCurrentStock(it)));
    const bgColors = topItems.map((it) => {
      const key = Storage.getStockStatus(it).key;
      if (key === 'out') return '#DC2626';
      if (key === 'low') return '#D97706';
      return '#2C7A7B';
    });

    if (stockChartInstance) {
      stockChartInstance.destroy();
    }

    stockChartInstance = new global.Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Current Stock',
          data: values,
          backgroundColor: bgColors,
          borderRadius: 6,
          barThickness: 18
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                const item = topItems[ctx.dataIndex];
                return ` Stock: ${Storage.formatQty(ctx.raw)} ${item ? item.unit : ''}`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: '#E2E8F0' },
            ticks: { color: '#475569' }
          },
          y: {
            grid: { display: false },
            ticks: { color: '#1E3A5F', font: { weight: '600' } }
          }
        }
      }
    });
  }

  // =========================================================
  // (C) INVENTORY
  // =========================================================
  function renderInventoryCategoryFilter() {
    const sel = document.getElementById('inv-category-filter');
    const prev = sel.value || 'all';
    const categories = Array.from(new Set(state.inventory.map((i) => i.category).filter(Boolean))).sort();
    sel.innerHTML = '<option value="all">सभी श्रेणी / All Categories</option>' +
      categories.map((cat) => `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`).join('');
    sel.value = categories.includes(prev) ? prev : 'all';
  }

  function setInventorySystem(sys) {
    activeStockSystem = sys || 'all';
    document.querySelectorAll('.stock-sys-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-stock-system') === activeStockSystem);
    });
    const statusSel = document.getElementById('inv-status-filter');
    if (activeStockSystem === 'low_out' && statusSel.value !== 'low' && statusSel.value !== 'out') {
      statusSel.value = 'low_out';
    } else if (activeStockSystem === 'full') {
      statusSel.value = 'in';
    } else if (activeStockSystem === 'all' && (statusSel.value === 'low_out' || statusSel.value === 'in')) {
      statusSel.value = 'all';
    }
    renderInventory();
  }

  function buildInventoryRowHtml(item, isUrgent) {
    const current = Storage.getCurrentStock(item);
    const status = Storage.getStockStatus(item);
    const value = Storage.getStockValue(item);
    return `
      <tr>
        <td><span class="badge badge-navy">${escapeHtml(item.code)}</span></td>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td>${escapeHtml(item.category)}</td>
        <td>${escapeHtml(item.unit)}</td>
        <td class="text-right tabular">${Storage.formatINR(item.buyPrice)}</td>
        <td class="text-right tabular">${Storage.formatINR(item.sellPrice)}</td>
        <td class="text-right tabular">${Storage.formatQty(item.openingStock)}</td>
        <td class="text-right tabular" style="color: var(--success-text);">+${Storage.formatQty(item.stockIn)}</td>
        <td class="text-right tabular" style="color: var(--danger-text);">-${Storage.formatQty(item.stockOut)}</td>
        <td class="text-right tabular"><strong>${Storage.formatQty(current)}</strong> <span style="font-size: 0.72rem; color: var(--text-soft);">(${Storage.formatQty(item.minAlertLevel)})</span></td>
        <td><span class="badge ${status.badgeClass}">${escapeHtml(status.shortLabel)}</span></td>
        <td class="text-right tabular">${Storage.formatINR(value)}</td>
        <td class="text-right">
          <div class="action-group">
            <button type="button" class="btn btn-sm ${isUrgent ? 'btn-primary' : 'btn-outline'} quick-stock-in-btn" data-item-id="${escapeHtml(item.id)}">+ Stock</button>
            <button type="button" class="btn btn-sm btn-outline edit-item-btn" data-id="${escapeHtml(item.id)}">Edit</button>
            <button type="button" class="btn btn-sm btn-danger delete-item-btn" data-id="${escapeHtml(item.id)}">Delete</button>
          </div>
        </td>
      </tr>
    `;
  }

  function buildInventoryCardHtml(item, isUrgent) {
    const current = Storage.getCurrentStock(item);
    const status = Storage.getStockStatus(item);
    const value = Storage.getStockValue(item);
    return `
      <div class="m-card${isUrgent ? ' is-urgent' : ''}">
        <div class="m-card-head">
          <div>
            <span class="badge badge-navy">${escapeHtml(item.code)}</span>
            <h4 class="m-card-title" style="margin-top: 4px;">${escapeHtml(item.name)}</h4>
            <div class="m-card-sub">${escapeHtml(item.category)} • Min: ${Storage.formatQty(item.minAlertLevel)} | In: +${Storage.formatQty(item.stockIn)} | Out: -${Storage.formatQty(item.stockOut)}</div>
          </div>
          <span class="badge ${status.badgeClass}">${escapeHtml(status.shortLabel)}</span>
        </div>
        <div class="m-card-stats">
          <div>
            <div class="m-stat-label">Stock</div>
            <div class="m-stat-val">${Storage.formatQty(current)} ${escapeHtml(item.unit)}</div>
          </div>
          <div>
            <div class="m-stat-label">Buy / Sell</div>
            <div class="m-stat-val">${Storage.formatINR(item.buyPrice)} / ${Storage.formatINR(item.sellPrice)}</div>
          </div>
          <div>
            <div class="m-stat-label">Value</div>
            <div class="m-stat-val">${Storage.formatINR(value)}</div>
          </div>
        </div>
        <div class="m-card-actions">
          <button type="button" class="btn btn-sm ${isUrgent ? 'btn-primary' : 'btn-outline'} quick-stock-in-btn" data-item-id="${escapeHtml(item.id)}">+ Stock</button>
          <button type="button" class="btn btn-sm btn-outline edit-item-btn" data-id="${escapeHtml(item.id)}">Edit</button>
          <button type="button" class="btn btn-sm btn-danger delete-item-btn" data-id="${escapeHtml(item.id)}">Delete</button>
        </div>
      </div>
    `;
  }

  function renderInventory() {
    renderInventoryCategoryFilter();
    const search = (document.getElementById('inv-search').value || '').trim().toLowerCase();
    const catFilter = document.getElementById('inv-category-filter').value;
    const statusFilter = document.getElementById('inv-status-filter').value;

    const matchesSearchAndCat = state.inventory.filter((item) => {
      const matchesSearch = !search ||
        item.name.toLowerCase().includes(search) ||
        item.code.toLowerCase().includes(search) ||
        item.category.toLowerCase().includes(search);
      const matchesCat = catFilter === 'all' || item.category === catFilter;
      return matchesSearch && matchesCat;
    });

    const filtered = matchesSearchAndCat.filter((item) => {
      const key = Storage.getStockStatus(item).key;
      if (statusFilter === 'low_out') return key === 'low' || key === 'out';
      if (statusFilter !== 'all') return key === statusFilter;
      if (activeStockSystem === 'low_out') return key === 'low' || key === 'out';
      if (activeStockSystem === 'full') return key === 'in';
      return true;
    });

    const lowItems = sortUrgentFirst(filtered.filter(isUrgentStock));
    const fullItems = sortUrgentFirst(filtered.filter((it) => !isUrgentStock(it)));

    const totalLowAll = state.inventory.filter(isUrgentStock).length;
    const totalFullAll = state.inventory.length - totalLowAll;
    document.getElementById('inv-low-tab-count').textContent = String(totalLowAll);
    document.getElementById('inv-full-tab-count').textContent = String(totalFullAll);
    document.getElementById('inv-low-badge').textContent = `${lowItems.length} आइटम`;
    document.getElementById('inv-full-badge').textContent = `${fullItems.length} आइटम`;

    const showLowSection = activeStockSystem !== 'full' && statusFilter !== 'in';
    const showFullSection = activeStockSystem !== 'low_out' && statusFilter !== 'low_out' && statusFilter !== 'low' && statusFilter !== 'out';
    document.getElementById('inv-low-section').classList.toggle('hidden', !showLowSection);
    document.getElementById('inv-full-section').classList.toggle('hidden', !showFullSection);

    const lowTbody = document.getElementById('inv-low-tbody');
    const lowCards = document.getElementById('inv-low-cards');
    if (!lowItems.length) {
      const msg = state.inventory.length
        ? '✅ इस फ़िल्टर में कोई कम या खत्म स्टॉक आइटम नहीं है।'
        : 'कोई आइटम नहीं मिला। "+ नया आइटम / Add Item" पर क्लिक करें।';
      lowTbody.innerHTML = `<tr><td colspan="13" class="empty-state">${msg}</td></tr>`;
      lowCards.innerHTML = `<div class="empty-state">${msg}</div>`;
    } else {
      lowTbody.innerHTML = lowItems.map((it) => buildInventoryRowHtml(it, true)).join('');
      lowCards.innerHTML = lowItems.map((it) => buildInventoryCardHtml(it, true)).join('');
    }

    const fullTbody = document.getElementById('inv-full-tbody');
    const fullCards = document.getElementById('inv-full-cards');
    if (!fullItems.length) {
      const msg = 'पूरा स्टॉक श्रेणी में अभी कोई आइटम नहीं मिला।';
      fullTbody.innerHTML = `<tr><td colspan="13" class="empty-state">${msg}</td></tr>`;
      fullCards.innerHTML = `<div class="empty-state">${msg}</div>`;
    } else {
      fullTbody.innerHTML = fullItems.map((it) => buildInventoryRowHtml(it, false)).join('');
      fullCards.innerHTML = fullItems.map((it) => buildInventoryCardHtml(it, false)).join('');
    }
  }

  function openItemModal(itemToEdit) {
    const isEdit = !!itemToEdit;
    document.getElementById('item-modal-title').textContent = isEdit
      ? 'आइटम एडिट करें / Edit Item'
      : 'नया आइटम जोड़ें / Add New Item';
    document.getElementById('item-id').value = isEdit ? itemToEdit.id : '';
    document.getElementById('item-code').value = isEdit ? itemToEdit.code : Storage.getNextItemCode(state.inventory);
    document.getElementById('item-name').value = isEdit ? itemToEdit.name : '';
    document.getElementById('item-category').value = isEdit ? itemToEdit.category : 'किराना / Grocery';
    document.getElementById('item-unit').value = isEdit ? itemToEdit.unit : 'Pcs';
    document.getElementById('item-buy-price').value = isEdit ? itemToEdit.buyPrice : '';
    document.getElementById('item-sell-price').value = isEdit ? itemToEdit.sellPrice : '';
    document.getElementById('item-opening-stock').value = isEdit ? itemToEdit.openingStock : '0';
    document.getElementById('item-min-alert').value = isEdit ? itemToEdit.minAlertLevel : '5';
    openModal('item-modal');
    setTimeout(() => document.getElementById('item-name').focus(), 40);
  }

  // =========================================================
  // (D) STOCK IN
  // =========================================================
  function renderStockInDropdown(preselectId) {
    const sel = document.getElementById('sin-item');
    const currentVal = preselectId || sel.value;
    if (!state.inventory.length) {
      sel.innerHTML = '<option value="">पहले Inventory में आइटम जोड़ें</option>';
      return;
    }
    sel.innerHTML = '<option value="">-- आइटम चुनें / Select Item --</option>' +
      state.inventory.map((item) => {
        const cur = Storage.getCurrentStock(item);
        return `<option value="${escapeHtml(item.id)}">[${escapeHtml(item.code)}] ${escapeHtml(item.name)} (Stock: ${Storage.formatQty(cur)} ${escapeHtml(item.unit)})</option>`;
      }).join('');
    if (currentVal && state.inventory.some((i) => i.id === currentVal)) {
      sel.value = currentVal;
      syncStockInRate();
    }
  }

  function syncStockInRate() {
    const itemId = document.getElementById('sin-item').value;
    const item = state.inventory.find((i) => i.id === itemId);
    if (item) {
      document.getElementById('sin-rate').value = item.buyPrice;
    }
    updateStockInTotal();
  }

  function updateStockInTotal() {
    const qty = parseFloat(document.getElementById('sin-qty').value) || 0;
    const rate = parseFloat(document.getElementById('sin-rate').value) || 0;
    document.getElementById('sin-total').value = Storage.formatINR(qty * rate);
  }

  function renderStockInHistory() {
    const search = (document.getElementById('sin-search').value || '').trim().toLowerCase();
    const list = (state.stockInHistory || []).filter((e) => {
      if (!search) return true;
      return (e.itemName || '').toLowerCase().includes(search) ||
        (e.supplierName || '').toLowerCase().includes(search) ||
        (e.itemCode || '').toLowerCase().includes(search);
    });

    const tbody = document.getElementById('sin-history-tbody');
    const cardsEl = document.getElementById('sin-history-cards');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">अभी कोई Stock In रिकॉर्ड नहीं है।</td></tr>';
      cardsEl.innerHTML = '<div class="empty-state">अभी कोई Stock In रिकॉर्ड नहीं है।</div>';
      return;
    }

    tbody.innerHTML = list.map((entry) => `
      <tr>
        <td>${escapeHtml(entry.date)}</td>
        <td>${escapeHtml(entry.supplierName || '-')}</td>
        <td><strong>${escapeHtml(entry.itemName)}</strong></td>
        <td class="text-right tabular">+${Storage.formatQty(entry.qty)} ${escapeHtml(entry.unit)}</td>
        <td class="text-right tabular">${Storage.formatINR(entry.buyRate)}</td>
        <td class="text-right tabular"><strong>${Storage.formatINR(entry.totalCost)}</strong></td>
        <td>${escapeHtml(entry.notes || '-')}</td>
        <td class="text-right">
          <button type="button" class="btn btn-sm btn-danger delete-sin-btn" data-id="${escapeHtml(entry.id)}">Delete</button>
        </td>
      </tr>
    `).join('');

    cardsEl.innerHTML = list.map((entry) => `
      <div class="m-card">
        <div class="m-card-head">
          <div>
            <h4 class="m-card-title">${escapeHtml(entry.itemName)}</h4>
            <div class="m-card-sub">${escapeHtml(entry.date)} • Supplier: ${escapeHtml(entry.supplierName || '-')}</div>
          </div>
          <span class="badge badge-success">+${Storage.formatQty(entry.qty)} ${escapeHtml(entry.unit)}</span>
        </div>
        <div class="m-card-stats" style="grid-template-columns: repeat(2, 1fr);">
          <div>
            <div class="m-stat-label">Buy Rate</div>
            <div class="m-stat-val">${Storage.formatINR(entry.buyRate)}</div>
          </div>
          <div>
            <div class="m-stat-label">Total Cost</div>
            <div class="m-stat-val">${Storage.formatINR(entry.totalCost)}</div>
          </div>
        </div>
        ${entry.notes ? `<div class="m-card-sub" style="margin-bottom: 8px;">Note: ${escapeHtml(entry.notes)}</div>` : ''}
        <div class="m-card-actions">
          <button type="button" class="btn btn-sm btn-danger delete-sin-btn" data-id="${escapeHtml(entry.id)}">Delete Entry</button>
        </div>
      </div>
    `).join('');
  }

  // =========================================================
  // (E) CREATE BILL / INVOICE
  // =========================================================
  function resetBillForm() {
    document.getElementById('bill-no').value = Storage.formatBillNo(state.nextBillNumber);
    document.getElementById('bill-date').value = Storage.getTodayISO();
    document.getElementById('bill-customer').value = '';
    document.getElementById('bill-phone').value = '';
    document.getElementById('bill-payment-mode').value = 'Cash';
    document.getElementById('bill-discount').value = '0';
    billRowsState = [{ rowId: Storage.generateId('row'), itemId: '', qty: 1, rate: 0 }];
    renderBillRows();
  }

  function getRequestedQtyMap() {
    const map = {};
    for (const row of billRowsState) {
      if (!row.itemId) continue;
      const q = Number(row.qty) || 0;
      map[row.itemId] = Storage.roundQty((map[row.itemId] || 0) + q);
    }
    return map;
  }

  function renderBillRows() {
    const container = document.getElementById('bill-rows-container');
    const itemMap = new Map(state.inventory.map((i) => [i.id, i]));
    const requestedMap = getRequestedQtyMap();

    const optionsHtml = '<option value="">-- आइटम चुनें / Select Item --</option>' +
      state.inventory.map((it) => {
        const cur = Storage.getCurrentStock(it);
        return `<option value="${escapeHtml(it.id)}">[${escapeHtml(it.code)}] ${escapeHtml(it.name)} — ${Storage.formatINR(it.sellPrice)} (Stock: ${Storage.formatQty(cur)} ${escapeHtml(it.unit)})</option>`;
      }).join('');

    container.innerHTML = billRowsState.map((row, idx) => {
      const item = itemMap.get(row.itemId);
      const available = item ? Storage.getCurrentStock(item) : 0;
      const totalReq = item ? (requestedMap[item.id] || 0) : 0;
      const exceedsStock = item && totalReq > available;
      const lineAmount = Storage.roundMoney((Number(row.qty) || 0) * (Number(row.rate) || 0));

      return `
        <div class="bill-row-card" data-row-id="${escapeHtml(row.rowId)}">
          <div class="bill-row-grid">
            <div class="form-group bill-cell-item">
              <label class="form-label">आइटम #${idx + 1} / Item</label>
              <select class="form-control bill-item-select" data-row-id="${escapeHtml(row.rowId)}">
                ${optionsHtml}
              </select>
              ${item ? `<div class="stock-hint">उपलब्ध स्टॉक / Available: ${Storage.formatQty(available)} ${escapeHtml(item.unit)}</div>` : ''}
            </div>
            <div class="form-group bill-cell-qty">
              <label class="form-label">Qty</label>
              <input type="number" class="form-control tabular bill-qty-input" inputmode="decimal" data-row-id="${escapeHtml(row.rowId)}" step="any" min="0.001" value="${escapeHtml(row.qty)}">
            </div>
            <div class="form-group bill-cell-rate">
              <label class="form-label">Rate (₹)</label>
              <input type="number" class="form-control tabular bill-rate-input" inputmode="decimal" data-row-id="${escapeHtml(row.rowId)}" step="any" min="0" value="${escapeHtml(row.rate)}">
            </div>
            <div class="form-group bill-cell-amount">
              <label class="form-label">Amount</label>
              <input type="text" class="form-control tabular bill-amount-display" value="${Storage.formatINR(lineAmount)}" readonly>
            </div>
            <div class="form-group bill-cell-remove">
              <button type="button" class="btn btn-danger bill-remove-row-btn" data-row-id="${escapeHtml(row.rowId)}" title="Remove Row">&times;</button>
            </div>
          </div>
          ${exceedsStock ? `<div class="stock-warning">⚠ चेतावनी: कुल मात्रा (${Storage.formatQty(totalReq)}) उपलब्ध स्टॉक (${Storage.formatQty(available)} ${escapeHtml(item.unit)}) से ज़्यादा है!</div>` : ''}
        </div>
      `;
    }).join('');

    // Set selected values after innerHTML
    billRowsState.forEach((row) => {
      const sel = container.querySelector(`.bill-item-select[data-row-id="${row.rowId}"]`);
      if (sel) sel.value = row.itemId;
    });

    updateBillTotals();
  }

  function updateBillTotals() {
    let subTotal = 0;
    for (const row of billRowsState) {
      if (!row.itemId) continue;
      subTotal += (Number(row.qty) || 0) * (Number(row.rate) || 0);
    }
    subTotal = Storage.roundMoney(subTotal);
    const discountRaw = Math.max(0, parseFloat(document.getElementById('bill-discount').value) || 0);
    const discount = Storage.roundMoney(Math.min(subTotal, discountRaw));
    const grandTotal = Storage.roundMoney(Math.max(0, subTotal - discount));

    document.getElementById('bill-subtotal').textContent = Storage.formatINR(subTotal);
    document.getElementById('bill-grand-total').textContent = Storage.formatINR(grandTotal);
  }

  function finalizeAndSaveBill() {
    const billNo = (document.getElementById('bill-no').value || '').trim() || Storage.formatBillNo(state.nextBillNumber);
    const date = document.getElementById('bill-date').value || Storage.getTodayISO();
    const customerName = (document.getElementById('bill-customer').value || '').trim() || 'Walk-in Customer';
    const customerPhone = (document.getElementById('bill-phone').value || '').trim();
    const paymentMode = document.getElementById('bill-payment-mode').value || 'Cash';

    const itemMap = new Map(state.inventory.map((i) => [i.id, i]));
    const validLines = [];
    for (const row of billRowsState) {
      if (!row.itemId) continue;
      const item = itemMap.get(row.itemId);
      if (!item) continue;
      const qty = Storage.roundQty(row.qty);
      const rate = Storage.roundMoney(row.rate);
      if (qty <= 0) continue;
      validLines.push({
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        unit: item.unit,
        qty,
        rate,
        buyPrice: item.buyPrice,
        amount: Storage.roundMoney(qty * rate)
      });
    }

    const subTotal = Storage.roundMoney(validLines.reduce((acc, l) => acc + l.amount, 0));
    const discountRaw = Math.max(0, parseFloat(document.getElementById('bill-discount').value) || 0);
    const discount = Storage.roundMoney(Math.min(subTotal, discountRaw));
    const grandTotal = Storage.roundMoney(Math.max(0, subTotal - discount));

    // Deduct stock from inventory
    for (const line of validLines) {
      const invItem = itemMap.get(line.itemId);
      if (invItem) {
        invItem.stockOut = Storage.roundQty((Number(invItem.stockOut) || 0) + line.qty);
      }
    }

    const billRecord = {
      id: Storage.generateId('bill'),
      billNo,
      date,
      customerName,
      customerPhone,
      paymentMode,
      items: validLines,
      subTotal,
      discount,
      grandTotal,
      createdAt: new Date().toISOString()
    };

    state.billHistory.unshift(billRecord);
    const numMatch = billNo.match(/(\d+)$/);
    if (numMatch) {
      const parsed = parseInt(numMatch[1], 10);
      if (parsed >= state.nextBillNumber) state.nextBillNumber = parsed + 1;
    } else {
      state.nextBillNumber += 1;
    }

    persistAndRefresh();
    resetBillForm();

    try {
      const pdfFile = PDF.generateInvoicePDF(billRecord, state.settings);
      showToast(`बिल ${billRecord.billNo} सेव हुआ और ${pdfFile} डाउनलोड हो गया!`, 'success');
    } catch (err) {
      console.error('PDF error:', err);
      showToast(`बिल ${billRecord.billNo} सेव हुआ, लेकिन PDF बनाने में त्रुटि आई।`, 'warning');
    }
  }

  // =========================================================
  // (F) BILL HISTORY
  // =========================================================
  function renderBillHistory() {
    const search = (document.getElementById('history-search').value || '').trim().toLowerCase();
    const modeFilter = document.getElementById('history-payment-filter').value;

    const list = (state.billHistory || []).filter((bill) => {
      const matchesSearch = !search ||
        (bill.billNo || '').toLowerCase().includes(search) ||
        (bill.customerName || '').toLowerCase().includes(search) ||
        (bill.customerPhone || '').toLowerCase().includes(search);
      const matchesMode = modeFilter === 'all' || bill.paymentMode === modeFilter;
      return matchesSearch && matchesMode;
    });

    const tbody = document.getElementById('bill-history-tbody');
    const cardsEl = document.getElementById('bill-history-cards');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">अभी कोई बिल रिकॉर्ड नहीं है।</td></tr>';
      cardsEl.innerHTML = '<div class="empty-state">अभी कोई बिल रिकॉर्ड नहीं है।</div>';
      return;
    }

    tbody.innerHTML = list.map((bill) => `
      <tr>
        <td><span class="badge badge-navy">${escapeHtml(bill.billNo)}</span></td>
        <td>${escapeHtml(bill.date)}</td>
        <td>
          <strong>${escapeHtml(bill.customerName)}</strong>
          ${bill.customerPhone ? `<div style="font-size: 0.76rem; color: var(--text-soft);">${escapeHtml(bill.customerPhone)}</div>` : ''}
        </td>
        <td class="text-center tabular">${(bill.items || []).length}</td>
        <td class="text-right tabular"><strong>${Storage.formatINR(bill.grandTotal)}</strong></td>
        <td><span class="badge badge-teal">${escapeHtml(bill.paymentMode)}</span></td>
        <td class="text-right">
          <div class="action-group">
            <button type="button" class="btn btn-sm btn-outline view-bill-btn" data-id="${escapeHtml(bill.id)}">View</button>
            <button type="button" class="btn btn-sm btn-navy pdf-bill-btn" data-id="${escapeHtml(bill.id)}">PDF</button>
            <button type="button" class="btn btn-sm btn-danger delete-bill-btn" data-id="${escapeHtml(bill.id)}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('');

    cardsEl.innerHTML = list.map((bill) => `
      <div class="m-card">
        <div class="m-card-head">
          <div>
            <span class="badge badge-navy">${escapeHtml(bill.billNo)}</span>
            <h4 class="m-card-title" style="margin-top: 4px;">${escapeHtml(bill.customerName)}</h4>
            <div class="m-card-sub">${escapeHtml(bill.date)}${bill.customerPhone ? ' • ' + escapeHtml(bill.customerPhone) : ''}</div>
          </div>
          <span class="badge badge-teal">${escapeHtml(bill.paymentMode)}</span>
        </div>
        <div class="m-card-stats" style="grid-template-columns: repeat(2, 1fr);">
          <div>
            <div class="m-stat-label">Items</div>
            <div class="m-stat-val">${(bill.items || []).length}</div>
          </div>
          <div>
            <div class="m-stat-label">Grand Total</div>
            <div class="m-stat-val">${Storage.formatINR(bill.grandTotal)}</div>
          </div>
        </div>
        <div class="m-card-actions">
          <button type="button" class="btn btn-sm btn-outline view-bill-btn" data-id="${escapeHtml(bill.id)}">View</button>
          <button type="button" class="btn btn-sm btn-navy pdf-bill-btn" data-id="${escapeHtml(bill.id)}">PDF</button>
          <button type="button" class="btn btn-sm btn-danger delete-bill-btn" data-id="${escapeHtml(bill.id)}">Delete</button>
        </div>
      </div>
    `).join('');
  }

  function openViewBillModal(bill) {
    activeViewBillId = bill.id;
    const s = state.settings;
    // Rule A: strictly omit logo markup when no logo uploaded
    const logoHtml = (s.logo && s.logo.startsWith('data:image/'))
      ? `<img src="${s.logo}" alt="Shop Logo" class="invoice-logo">`
      : '';

    const rowsHtml = (bill.items || []).map((line, i) => `
      <tr>
        <td class="text-center">${i + 1}</td>
        <td>${escapeHtml(line.itemName)}</td>
        <td class="text-right tabular">${Storage.formatQty(line.qty)} ${escapeHtml(line.unit)}</td>
        <td class="text-right tabular">${Storage.formatINR(line.rate)}</td>
        <td class="text-right tabular"><strong>${Storage.formatINR(line.amount)}</strong></td>
      </tr>
    `).join('');

    document.getElementById('bill-view-content').innerHTML = `
      <div class="invoice-top">
        <div class="invoice-shop-wrap">
          ${logoHtml}
          <div>
            <h3 style="margin: 0; color: var(--navy);">${escapeHtml(s.shopName)}</h3>
            ${s.address ? `<div style="font-size: 0.84rem; color: var(--text-muted);">${escapeHtml(s.address)}</div>` : ''}
            ${s.phone ? `<div style="font-size: 0.84rem; color: var(--text-muted);">Mob: ${escapeHtml(s.phone)}</div>` : ''}
          </div>
        </div>
        <div style="text-align: right;">
          <span class="badge badge-teal" style="margin-bottom: 4px;">INVOICE</span>
          <div style="font-weight: 800; color: var(--navy);">${escapeHtml(bill.billNo)}</div>
          <div style="font-size: 0.82rem; color: var(--text-soft);">Date: ${escapeHtml(bill.date)}</div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; font-size: 0.88rem;">
        <div>
          <strong>ग्राहक / Customer:</strong> ${escapeHtml(bill.customerName)}
          ${bill.customerPhone ? ` (${escapeHtml(bill.customerPhone)})` : ''}
        </div>
        <div>
          <strong>Payment:</strong> <span class="badge badge-navy">${escapeHtml(bill.paymentMode)}</span>
        </div>
      </div>

      <div class="table-wrap" style="margin-bottom: 12px;">
        <table style="min-width: 440px;">
          <thead>
            <tr>
              <th class="text-center">S.No</th>
              <th>Item</th>
              <th class="text-right">Qty</th>
              <th class="text-right">Rate</th>
              <th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>

      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px; font-size: 0.92rem;">
        <div>Sub Total: <strong class="tabular">${Storage.formatINR(bill.subTotal)}</strong></div>
        <div>Discount: <strong class="tabular">- ${Storage.formatINR(bill.discount || 0)}</strong></div>
        <div style="font-size: 1.12rem; color: var(--navy); border-top: 2px solid var(--navy); padding-top: 4px; margin-top: 4px;">
          Grand Total: <strong class="tabular">${Storage.formatINR(bill.grandTotal)}</strong>
        </div>
      </div>

      ${s.footerNote ? `<div style="margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--border); text-align: center; color: var(--teal-dark); font-weight: 600; font-size: 0.88rem;">${escapeHtml(s.footerNote)}</div>` : ''}
    `;

    openModal('bill-view-modal');
  }

  // =========================================================
  // RENDER ALL & EVENT BINDING
  // =========================================================
  function renderAll() {
    renderHeader();
    renderDashboard();
    renderInventory();
    renderStockInDropdown();
    renderStockInHistory();
    renderBillRows();
    renderBillHistory();
    renderSettingsForm();
  }

  function updateNetworkIndicator() {
    const pill = document.getElementById('network-status-pill');
    const txt = document.getElementById('network-status-text');
    if (navigator.onLine) {
      pill.classList.remove('is-offline');
      txt.textContent = 'ऑफलाइन रेडी';
    } else {
      pill.classList.add('is-offline');
      txt.textContent = 'ऑफलाइन मोड';
    }
  }

  function registerPWA() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.protocol === 'http:')) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => {
          const detail = document.getElementById('pwa-status-detail');
          if (detail) detail.textContent = 'Service Worker सक्रिय • 100% Offline Ready PWA';
        })
        .catch((err) => {
          console.warn('SW registration skipped/failed:', err);
        });
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      document.getElementById('pwa-install-btn').classList.remove('hidden');
      document.getElementById('settings-install-btn').classList.remove('hidden');
    });

    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      document.getElementById('pwa-install-btn').classList.add('hidden');
      document.getElementById('settings-install-btn').classList.add('hidden');
      showToast('ApnaDukan ऐप आपके डिवाइस में इंस्टॉल हो गया!', 'success');
    });

    async function handleInstallClick() {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        deferredInstallPrompt = null;
        document.getElementById('pwa-install-btn').classList.add('hidden');
        document.getElementById('settings-install-btn').classList.add('hidden');
      }
    }

    document.getElementById('pwa-install-btn').addEventListener('click', handleInstallClick);
    document.getElementById('settings-install-btn').addEventListener('click', handleInstallClick);
  }

  function bindEvents() {
    // Navigation tabs & shortcuts
    document.querySelectorAll('[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.getAttribute('data-nav')));
    });
    document.querySelectorAll('[data-jump]').forEach((btn) => {
      btn.addEventListener('click', () => switchView(btn.getAttribute('data-jump')));
    });

    // Modal close buttons & backdrop click
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close-modal')));
    });
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) backdrop.classList.remove('open');
      });
    });

    // Generic Confirm Modal OK
    document.getElementById('confirm-modal-ok-btn').addEventListener('click', () => {
      const cb = pendingConfirmCallback;
      pendingConfirmCallback = null;
      closeModal('confirm-modal');
      if (typeof cb === 'function') cb();
    });

    // Header direct 1-click JSON Backup button
    document.getElementById('header-backup-btn').addEventListener('click', () => {
      try {
        const file = Export.exportToJSON(state);
        showToast(`पूरा JSON बैकअप ${file} डिवाइस में सेव हो गया!`, 'success');
      } catch (err) {
        console.error(err);
        showToast('बैकअप डाउनलोड करने में त्रुटि आई।', 'error');
      }
    });

    // Dashboard alert jump & section shortcuts
    document.getElementById('jump-low-stock-btn').addEventListener('click', () => {
      document.getElementById('dashboard-low-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.getElementById('dash-view-low-inv-btn').addEventListener('click', () => {
      switchView('inventory');
      setInventorySystem('low_out');
    });
    document.getElementById('dash-view-full-inv-btn').addEventListener('click', () => {
      switchView('inventory');
      setInventorySystem('full');
    });

    // Dashboard Quick Stock In button (works for both desktop table & mobile cards)
    document.getElementById('view-dashboard').addEventListener('click', (e) => {
      const btn = e.target.closest('.quick-stock-in-btn');
      if (!btn) return;
      const itemId = btn.getAttribute('data-item-id');
      switchView('stock-in');
      renderStockInDropdown(itemId);
      document.getElementById('sin-qty').focus();
    });

    // Inventory two-system tabs & filters
    document.getElementById('inv-system-tabs').addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.stock-sys-tab');
      if (!tabBtn) return;
      setInventorySystem(tabBtn.getAttribute('data-stock-system'));
    });
    document.getElementById('inv-search').addEventListener('input', renderInventory);
    document.getElementById('inv-category-filter').addEventListener('change', renderInventory);
    document.getElementById('inv-status-filter').addEventListener('change', () => {
      const val = document.getElementById('inv-status-filter').value;
      if (val === 'low_out' || val === 'low' || val === 'out') {
        activeStockSystem = 'low_out';
      } else if (val === 'in') {
        activeStockSystem = 'full';
      } else {
        activeStockSystem = 'all';
      }
      document.querySelectorAll('.stock-sys-tab').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-stock-system') === activeStockSystem);
      });
      renderInventory();
    });

    // Add / Edit / Delete / Quick-Stock Inventory Item (works for both desktop table & mobile cards)
    document.getElementById('open-add-item-btn').addEventListener('click', () => openItemModal(null));

    document.getElementById('view-inventory').addEventListener('click', (e) => {
      const stockBtn = e.target.closest('.quick-stock-in-btn');
      if (stockBtn) {
        const itemId = stockBtn.getAttribute('data-item-id');
        switchView('stock-in');
        renderStockInDropdown(itemId);
        document.getElementById('sin-qty').focus();
        return;
      }
      const editBtn = e.target.closest('.edit-item-btn');
      if (editBtn) {
        const item = state.inventory.find((i) => i.id === editBtn.getAttribute('data-id'));
        if (item) openItemModal(item);
        return;
      }
      const delBtn = e.target.closest('.delete-item-btn');
      if (delBtn) {
        const item = state.inventory.find((i) => i.id === delBtn.getAttribute('data-id'));
        if (!item) return;
        openConfirmDialog(
          'आइटम डिलीट करें / Delete Item',
          `क्या आप "${item.name}" को Inventory से हटाना चाहते हैं?`,
          'हाँ, डिलीट करें',
          'btn-danger-solid',
          () => {
            state.inventory = state.inventory.filter((i) => i.id !== item.id);
            persistAndRefresh();
            showToast(`"${item.name}" Inventory से हटा दिया गया।`, 'success');
          }
        );
      }
    });

    document.getElementById('item-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = document.getElementById('item-id').value.trim();
      const code = document.getElementById('item-code').value.trim();
      const name = document.getElementById('item-name').value.trim();
      const category = document.getElementById('item-category').value.trim() || 'अन्य / Other';
      const unit = document.getElementById('item-unit').value || 'Pcs';
      const buyPrice = Math.max(0, Storage.roundMoney(document.getElementById('item-buy-price').value));
      const sellPrice = Math.max(0, Storage.roundMoney(document.getElementById('item-sell-price').value));
      const openingStock = Math.max(0, Storage.roundQty(document.getElementById('item-opening-stock').value));
      const minAlertLevel = Math.max(0, Storage.roundQty(document.getElementById('item-min-alert').value));

      if (!name || !code) {
        showToast('कृपया Item Code और Item Name भरें।', 'warning');
        return;
      }

      const dupCode = state.inventory.some(
        (it) => it.code.toLowerCase() === code.toLowerCase() && it.id !== id
      );
      if (dupCode) {
        showToast(`Item Code "${code}" पहले से मौजूद है! कृपया अलग कोड डालें।`, 'warning');
        return;
      }

      if (id) {
        const idx = state.inventory.findIndex((i) => i.id === id);
        if (idx !== -1) {
          state.inventory[idx] = Object.assign({}, state.inventory[idx], {
            code,
            name,
            category,
            unit,
            buyPrice,
            sellPrice,
            openingStock,
            minAlertLevel
          });
          showToast(`"${name}" अपडेट हो गया!`, 'success');
        }
      } else {
        state.inventory.push({
          id: Storage.generateId('itm'),
          code,
          name,
          category,
          unit,
          buyPrice,
          sellPrice,
          openingStock,
          stockIn: 0,
          stockOut: 0,
          minAlertLevel
        });
        showToast(`नया आइटम "${name}" जुड़ गया!`, 'success');
      }

      closeModal('item-modal');
      persistAndRefresh();
    });

    // Stock In Form
    document.getElementById('sin-date').value = Storage.getTodayISO();
    document.getElementById('sin-item').addEventListener('change', syncStockInRate);
    document.getElementById('sin-qty').addEventListener('input', updateStockInTotal);
    document.getElementById('sin-rate').addEventListener('input', updateStockInTotal);
    document.getElementById('sin-search').addEventListener('input', renderStockInHistory);

    document.getElementById('stock-in-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const itemId = document.getElementById('sin-item').value;
      const item = state.inventory.find((i) => i.id === itemId);
      if (!item) {
        showToast('कृपया पहले कोई आइटम चुनें।', 'warning');
        return;
      }
      const date = document.getElementById('sin-date').value || Storage.getTodayISO();
      const supplierName = document.getElementById('sin-supplier').value.trim();
      const qty = Storage.roundQty(document.getElementById('sin-qty').value);
      const buyRate = Math.max(0, Storage.roundMoney(document.getElementById('sin-rate').value));
      const notes = document.getElementById('sin-notes').value.trim();
      const updateBuyPrice = document.getElementById('sin-update-buy-price').checked;

      if (qty <= 0) {
        showToast('कृपया 0 से ज़्यादा मात्रा डालें।', 'warning');
        return;
      }

      item.stockIn = Storage.roundQty((Number(item.stockIn) || 0) + qty);
      if (updateBuyPrice) {
        item.buyPrice = buyRate;
      }

      state.stockInHistory.unshift({
        id: Storage.generateId('sin'),
        date,
        supplierName,
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        unit: item.unit,
        qty,
        buyRate,
        totalCost: Storage.roundMoney(qty * buyRate),
        notes
      });

      document.getElementById('sin-qty').value = '';
      document.getElementById('sin-notes').value = '';
      document.getElementById('sin-total').value = '₹0';
      document.getElementById('sin-update-buy-price').checked = false;

      persistAndRefresh();
      showToast(`${item.name} में +${Storage.formatQty(qty)} ${item.unit} स्टॉक जुड़ गया!`, 'success');
    });

    document.getElementById('view-stock-in').addEventListener('click', (e) => {
      const btn = e.target.closest('.delete-sin-btn');
      if (!btn) return;
      const entryId = btn.getAttribute('data-id');
      const entry = state.stockInHistory.find((s) => s.id === entryId);
      if (!entry) return;
      openConfirmDialog(
        'Stock In एंट्री हटाएं',
        `"${entry.itemName}" (+${Storage.formatQty(entry.qty)} ${entry.unit}) की खरीद एंट्री हटाने पर यह मात्रा स्टॉक से भी घट जाएगी। जारी रखें?`,
        'हाँ, हटाएं',
        'btn-danger-solid',
        () => {
          const item = state.inventory.find((i) => i.id === entry.itemId);
          if (item) {
            item.stockIn = Math.max(0, Storage.roundQty((Number(item.stockIn) || 0) - entry.qty));
          }
          state.stockInHistory = state.stockInHistory.filter((s) => s.id !== entryId);
          persistAndRefresh();
          showToast('Stock In एंट्री हटा दी गई।', 'success');
        }
      );
    });

    // Create Bill Events
    document.getElementById('add-bill-row-btn').addEventListener('click', () => {
      billRowsState.push({ rowId: Storage.generateId('row'), itemId: '', qty: 1, rate: 0 });
      renderBillRows();
    });

    document.getElementById('bill-rows-container').addEventListener('change', (e) => {
      const sel = e.target.closest('.bill-item-select');
      if (!sel) return;
      const row = billRowsState.find((r) => r.rowId === sel.getAttribute('data-row-id'));
      if (!row) return;
      row.itemId = sel.value;
      const item = state.inventory.find((i) => i.id === row.itemId);
      row.rate = item ? item.sellPrice : 0;
      if (!row.qty || row.qty <= 0) row.qty = 1;
      renderBillRows();
    });

    document.getElementById('bill-rows-container').addEventListener('input', (e) => {
      const qtyInput = e.target.closest('.bill-qty-input');
      if (qtyInput) {
        const rowId = qtyInput.getAttribute('data-row-id');
        const row = billRowsState.find((r) => r.rowId === rowId);
        if (!row) return;
        row.qty = parseFloat(qtyInput.value) || 0;
        const card = qtyInput.closest('.bill-row-card');
        const amountEl = card.querySelector('.bill-amount-display');
        if (amountEl) {
          amountEl.value = Storage.formatINR((Number(row.qty) || 0) * (Number(row.rate) || 0));
        }
        // Update live stock warnings without losing input focus
        const itemMap = new Map(state.inventory.map((i) => [i.id, i]));
        const reqMap = getRequestedQtyMap();
        document.querySelectorAll('.bill-row-card').forEach((rowCard) => {
          const rObj = billRowsState.find((r) => r.rowId === rowCard.getAttribute('data-row-id'));
          if (!rObj) return;
          const item = itemMap.get(rObj.itemId);
          const existingWarn = rowCard.querySelector('.stock-warning');
          if (existingWarn) existingWarn.remove();
          if (item) {
            const avail = Storage.getCurrentStock(item);
            const totalReq = reqMap[item.id] || 0;
            if (totalReq > avail) {
              const warn = document.createElement('div');
              warn.className = 'stock-warning';
              warn.textContent = `⚠ चेतावनी: कुल मात्रा (${Storage.formatQty(totalReq)}) उपलब्ध स्टॉक (${Storage.formatQty(avail)} ${item.unit}) से ज़्यादा है!`;
              rowCard.appendChild(warn);
            }
          }
        });
        updateBillTotals();
        return;
      }

      const rateInput = e.target.closest('.bill-rate-input');
      if (rateInput) {
        const row = billRowsState.find((r) => r.rowId === rateInput.getAttribute('data-row-id'));
        if (!row) return;
        row.rate = Math.max(0, parseFloat(rateInput.value) || 0);
        const card = rateInput.closest('.bill-row-card');
        const amountEl = card.querySelector('.bill-amount-display');
        if (amountEl) {
          amountEl.value = Storage.formatINR((Number(row.qty) || 0) * (Number(row.rate) || 0));
        }
        updateBillTotals();
      }
    });

    document.getElementById('bill-rows-container').addEventListener('click', (e) => {
      const rmBtn = e.target.closest('.bill-remove-row-btn');
      if (!rmBtn) return;
      if (billRowsState.length === 1) {
        billRowsState[0] = { rowId: Storage.generateId('row'), itemId: '', qty: 1, rate: 0 };
      } else {
        billRowsState = billRowsState.filter((r) => r.rowId !== rmBtn.getAttribute('data-row-id'));
      }
      renderBillRows();
    });

    document.getElementById('bill-discount').addEventListener('input', updateBillTotals);
    document.getElementById('reset-bill-btn').addEventListener('click', resetBillForm);

    document.getElementById('bill-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const itemMap = new Map(state.inventory.map((i) => [i.id, i]));
      const validRows = billRowsState.filter((r) => r.itemId && itemMap.has(r.itemId) && (Number(r.qty) || 0) > 0);
      if (!validRows.length) {
        showToast('कृपया बिल में कम से कम 1 वैध आइटम और मात्रा जोड़ें।', 'warning');
        return;
      }

      let subTotal = 0;
      for (const r of validRows) {
        subTotal += (Number(r.qty) || 0) * (Number(r.rate) || 0);
      }
      const discount = Math.max(0, parseFloat(document.getElementById('bill-discount').value) || 0);
      if (discount > subTotal) {
        showToast('Discount राशि Sub Total से ज़्यादा नहीं हो सकती।', 'warning');
        return;
      }

      const reqMap = getRequestedQtyMap();
      const overStockItems = [];
      for (const [itemId, reqQty] of Object.entries(reqMap)) {
        const item = itemMap.get(itemId);
        if (!item) continue;
        const avail = Storage.getCurrentStock(item);
        if (reqQty > avail) {
          overStockItems.push(`${item.name} (मांग: ${Storage.formatQty(reqQty)}, उपलब्ध: ${Storage.formatQty(avail)})`);
        }
      }

      if (overStockItems.length) {
        openConfirmDialog(
          'कम स्टॉक चेतावनी / Low Stock Warning',
          `निम्नलिखित आइटम्स की मात्रा उपलब्ध स्टॉक से ज़्यादा है:\n${overStockItems.join(', ')}\nक्या फिर भी बिल सेव करना चाहते हैं?`,
          'हाँ, बिल सेव करें',
          'btn-primary',
          finalizeAndSaveBill
        );
        return;
      }

      finalizeAndSaveBill();
    });

    // Bill History Events
    document.getElementById('history-search').addEventListener('input', renderBillHistory);
    document.getElementById('history-payment-filter').addEventListener('change', renderBillHistory);

    document.getElementById('view-history').addEventListener('click', (e) => {
      const viewBtn = e.target.closest('.view-bill-btn');
      if (viewBtn) {
        const bill = state.billHistory.find((b) => b.id === viewBtn.getAttribute('data-id'));
        if (bill) openViewBillModal(bill);
        return;
      }
      const pdfBtn = e.target.closest('.pdf-bill-btn');
      if (pdfBtn) {
        const bill = state.billHistory.find((b) => b.id === pdfBtn.getAttribute('data-id'));
        if (bill) {
          try {
            const file = PDF.generateInvoicePDF(bill, state.settings);
            showToast(`${file} डाउनलोड हो गया!`, 'success');
          } catch (err) {
            console.error(err);
            showToast('PDF जनरेट करने में त्रुटि आई।', 'error');
          }
        }
        return;
      }
      const delBtn = e.target.closest('.delete-bill-btn');
      if (delBtn) {
        const bill = state.billHistory.find((b) => b.id === delBtn.getAttribute('data-id'));
        if (!bill) return;
        pendingDeleteBillId = bill.id;
        document.getElementById('delete-bill-msg').textContent =
          `क्या आप बिल ${bill.billNo} (${bill.customerName} — ${Storage.formatINR(bill.grandTotal)}) को डिलीट करना चाहते हैं?`;
        document.getElementById('delete-bill-restore-stock').checked = true;
        openModal('delete-bill-modal');
      }
    });

    document.getElementById('bill-view-download-pdf').addEventListener('click', () => {
      const bill = state.billHistory.find((b) => b.id === activeViewBillId);
      if (!bill) return;
      try {
        const file = PDF.generateInvoicePDF(bill, state.settings);
        showToast(`${file} डाउनलोड हो गया!`, 'success');
      } catch (err) {
        console.error(err);
        showToast('PDF डाउनलोड करने में त्रुटि आई।', 'error');
      }
    });

    document.getElementById('confirm-delete-bill-btn').addEventListener('click', () => {
      if (!pendingDeleteBillId) return;
      const bill = state.billHistory.find((b) => b.id === pendingDeleteBillId);
      const restoreStock = document.getElementById('delete-bill-restore-stock').checked;
      if (bill && restoreStock) {
        const itemMap = new Map(state.inventory.map((i) => [i.id, i]));
        for (const line of (bill.items || [])) {
          const item = itemMap.get(line.itemId);
          if (item) {
            item.stockOut = Math.max(0, Storage.roundQty((Number(item.stockOut) || 0) - (Number(line.qty) || 0)));
          }
        }
      }
      state.billHistory = state.billHistory.filter((b) => b.id !== pendingDeleteBillId);
      pendingDeleteBillId = null;
      closeModal('delete-bill-modal');
      persistAndRefresh();
      showToast(restoreStock ? 'बिल डिलीट हुआ और स्टॉक वापस जुड़ गया!' : 'बिल डिलीट हो गया।', 'success');
    });

    // Settings Form & Logo Upload (preserves typed fields across logo changes + saves reliably)
    ['set-shop-name', 'set-phone', 'set-address', 'set-footer-note'].forEach((fieldId) => {
      document.getElementById(fieldId).addEventListener('change', () => {
        applySettingsInputsToState(false);
        Storage.saveState(state);
        renderHeader();
      });
    });

    document.getElementById('set-logo-upload-btn').addEventListener('click', () => {
      document.getElementById('set-logo-input').click();
    });

    document.getElementById('set-logo-input').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const base64 = await resizeLogoToBase64(file);
        applySettingsInputsToState(true);
        state.settings.logo = base64;
        if (!Storage.saveState(state)) {
          showToast('स्टोरेज भर गया है! कृपया छोटा लोगो उपयोग करें।', 'error');
          return;
        }
        renderHeader();
        renderLogoPreview();
        showToast('दुकान का लोगो व विवरण सेव हो गया!', 'success');
      } catch (err) {
        console.error(err);
        showToast('इमेज अपलोड करने में त्रुटि। कृपया वैध इमेज चुनें।', 'error');
      }
    });

    document.getElementById('set-logo-remove-btn').addEventListener('click', () => {
      applySettingsInputsToState(true);
      state.settings.logo = '';
      Storage.saveState(state);
      renderHeader();
      renderLogoPreview();
      showToast('दुकान का लोगो हटा दिया गया।', 'success');
    });

    document.getElementById('settings-form').addEventListener('submit', (e) => {
      e.preventDefault();
      applySettingsInputsToState(true);
      if (!Storage.saveState(state)) {
        showToast('डेटा सेव नहीं हो सका (ब्राउज़र स्टोरेज सीमा/त्रुटि)।', 'error');
        return;
      }
      renderHeader();
      renderSettingsForm();
      showToast('दुकान का नाम, नंबर, पता और लोगो सफलतापूर्वक सेव हो गए!', 'success');
    });

    // Backup, Export & Import
    document.getElementById('export-json-btn').addEventListener('click', () => {
      try {
        const file = Export.exportToJSON(state);
        showToast(`पूरा बैकअप ${file} डाउनलोड हो गया!`, 'success');
      } catch (err) {
        console.error(err);
        showToast('JSON एक्सपोर्ट में त्रुटि आई।', 'error');
      }
    });

    document.getElementById('export-excel-btn').addEventListener('click', () => {
      try {
        const file = Export.exportToExcel(state);
        showToast(`Excel रिपोर्ट ${file} डाउनलोड हो गई!`, 'success');
      } catch (err) {
        console.error(err);
        showToast('Excel एक्सपोर्ट में त्रुटि आई।', 'error');
      }
    });

    document.getElementById('import-json-btn').addEventListener('click', () => {
      document.getElementById('import-json-input').click();
    });

    document.getElementById('import-json-input').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const validated = Storage.validateBackupPayload(parsed);
          pendingImportState = validated;
          document.getElementById('import-summary-box').innerHTML = `
            <div><strong>Shop Name:</strong> ${escapeHtml(validated.settings.shopName)}</div>
            <div><strong>Shop Logo:</strong> ${validated.settings.logo ? 'Included' : 'None'}</div>
            <div><strong>Inventory Products:</strong> ${validated.inventory.length}</div>
            <div><strong>Stock In Records:</strong> ${validated.stockInHistory.length}</div>
            <div><strong>Bills in History:</strong> ${validated.billHistory.length}</div>
          `;
          openModal('import-confirm-modal');
        } catch (err) {
          showToast(err.message || 'अमान्य JSON बैकअप फाइल!', 'error');
        }
      };
      reader.onerror = () => showToast('बैकअप फाइल पढ़ने में त्रुटि हुई।', 'error');
      reader.readAsText(file);
    });

    document.getElementById('confirm-import-btn').addEventListener('click', () => {
      if (!pendingImportState) return;
      state = pendingImportState;
      pendingImportState = null;
      closeModal('import-confirm-modal');
      persistAndRefresh();
      resetBillForm();
      showToast('बैकअप सफलतापूर्वक रिस्टोर हो गया!', 'success');
    });

    // Clear All / Reset Data
    document.getElementById('open-reset-modal-btn').addEventListener('click', () => openModal('reset-modal'));

    document.getElementById('reset-blank-btn').addEventListener('click', () => {
      const keepSettings = document.getElementById('reset-keep-settings').checked;
      const savedSettings = Object.assign({}, state.settings);
      state = Storage.createInitialState(false);
      if (keepSettings) {
        state.settings = savedSettings;
      }
      closeModal('reset-modal');
      persistAndRefresh();
      resetBillForm();
      showToast('सारा स्टॉक व बिल डेटा साफ हो गया — अब आप नया काम शुरू कर सकते हैं!', 'success');
    });

    document.getElementById('reset-sample-btn').addEventListener('click', () => {
      state = Storage.createInitialState(true);
      closeModal('reset-modal');
      persistAndRefresh();
      resetBillForm();
      showToast('5 सैंपल आइटम्स लोड हो गए!', 'success');
    });

    window.addEventListener('online', updateNetworkIndicator);
    window.addEventListener('offline', updateNetworkIndicator);
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    resetBillForm();
    renderAll();
    updateNetworkIndicator();
    registerPWA();
  });
})(window);
