(function (global) {
  'use strict';

  const NAVY = [30, 58, 95];
  const TEAL = [44, 122, 123];
  const TEXT_DARK = [15, 23, 42];
  const TEXT_MUTED = [71, 85, 105];
  const BORDER = [226, 232, 240];

  function hasComplexScript(str) {
    return /[\u0900-\u097F]/.test(String(str || ''));
  }

  function renderTextToPng(text, opts) {
    const fontSize = (opts && opts.fontSize) || 12;
    const bold = !!(opts && opts.bold);
    const color = (opts && opts.color) || '#0F172A';
    const align = (opts && opts.align) || 'left';
    const maxWidthMm = (opts && opts.maxWidthMm) || 100;

    const scale = 4;
    const pxPerMm = 3.7795;
    const fontPx = Math.round(fontSize * 1.333 * scale);
    const maxW = Math.max(40, Math.round(maxWidthMm * pxPerMm * scale));

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontSpec = (bold ? '700 ' : '400 ') + fontPx + 'px "Noto Sans Devanagari", "Nirmala UI", "Mangal", "Segoe UI", sans-serif';
    ctx.font = fontSpec;

    const rawText = String(text || '');
    const words = rawText.split(/\s+/);
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (ctx.measureText(testLine).width <= maxW) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    if (!lines.length) lines.push('');

    let widest = 0;
    for (const ln of lines) {
      widest = Math.max(widest, ctx.measureText(ln).width);
    }

    const lineHeight = Math.round(fontPx * 1.45);
    const padX = Math.ceil(fontPx * 0.35);
    const padY = Math.ceil(fontPx * 0.28);
    canvas.width = Math.ceil(Math.min(maxW, widest) + padX * 2);
    canvas.height = Math.ceil(lines.length * lineHeight + padY * 2);

    ctx.font = fontSpec;
    ctx.fillStyle = color;
    ctx.textBaseline = 'top';

    lines.forEach((ln, idx) => {
      const w = ctx.measureText(ln).width;
      let x = padX;
      if (align === 'right') x = Math.max(padX, canvas.width - padX - w);
      else if (align === 'center') x = Math.max(padX, (canvas.width - w) / 2);
      ctx.fillText(ln, x, padY + idx * lineHeight);
    });

    return {
      dataUrl: canvas.toDataURL('image/png'),
      widthMm: canvas.width / (pxPerMm * scale),
      heightMm: canvas.height / (pxPerMm * scale),
      lineCount: lines.length
    };
  }

  function registerFonts(doc) {
    const fonts = global.APNADUKAN_FONTS;
    if (fonts && fonts.regular) {
      doc.addFileToVFS('Mukta-Regular.ttf', fonts.regular);
      doc.addFont('Mukta-Regular.ttf', 'Mukta', 'normal');
      if (fonts.bold) {
        doc.addFileToVFS('Mukta-Bold.ttf', fonts.bold);
        doc.addFont('Mukta-Bold.ttf', 'Mukta', 'bold');
      } else {
        doc.addFont('Mukta-Regular.ttf', 'Mukta', 'bold');
      }
      doc.setFont('Mukta', 'normal');
      return 'Mukta';
    }
    doc.setFont('helvetica', 'normal');
    return 'helvetica';
  }

  function drawSmartText(doc, text, x, y, opts, fontFamily) {
    const str = String(text || '');
    if (!str) return 0;
    const fontSize = (opts && opts.fontSize) || 10;
    const bold = !!(opts && opts.bold);
    const align = (opts && opts.align) || 'left';
    const maxWidth = (opts && opts.maxWidth) || 120;
    const colorRgb = (opts && opts.colorRgb) || TEXT_DARK;

    if (hasComplexScript(str)) {
      const colorHex = '#' + colorRgb.map((c) => c.toString(16).padStart(2, '0')).join('');
      const img = renderTextToPng(str, {
        fontSize,
        bold,
        color: colorHex,
        align,
        maxWidthMm: maxWidth
      });
      let drawX = x;
      if (align === 'right') drawX = x - img.widthMm;
      else if (align === 'center') drawX = x - img.widthMm / 2;
      doc.addImage(img.dataUrl, 'PNG', drawX, y - fontSize * 0.28, img.widthMm, img.heightMm);
      return img.heightMm;
    }

    doc.setFont(fontFamily, bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.setTextColor(colorRgb[0], colorRgb[1], colorRgb[2]);
    const split = doc.splitTextToSize(str, maxWidth);
    doc.text(split, x, y, { align });
    return split.length * (fontSize * 0.42);
  }

  function detectImageType(dataUrl) {
    if (typeof dataUrl !== 'string') return null;
    if (dataUrl.startsWith('data:image/png')) return 'PNG';
    if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
    if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
    return null;
  }

  function generateInvoicePDF(bill, settings) {
    if (!global.jspdf || !global.jspdf.jsPDF) {
      throw new Error('jsPDF library is not loaded.');
    }

    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const fontFamily = registerFonts(doc);
    const storage = global.ApnaDukanStorage;

    const pageW = doc.internal.pageSize.getWidth();
    const margin = 14;
    const contentW = pageW - margin * 2;

    // Top Navy Bar
    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.rect(0, 0, pageW, 6, 'F');

    let y = 14;
    let textStartX = margin;

    // Rule A: ONLY render Shop Logo if user uploaded one!
    const imgType = detectImageType(settings.logo);
    if (imgType) {
      try {
        const props = doc.getImageProperties(settings.logo);
        const maxH = 18;
        const maxW = 28;
        const ratio = Math.min(maxW / props.width, maxH / props.height);
        const drawW = props.width * ratio;
        const drawH = props.height * ratio;
        doc.addImage(settings.logo, imgType, margin, y - 2, drawW, drawH);
        textStartX = margin + drawW + 5;
      } catch (e) {
        console.warn('Could not embed shop logo in PDF:', e);
      }
    }

    // Shop Info (Left) & Invoice Badge (Right)
    const shopMaxW = 110 - (textStartX - margin);
    let shopY = y + 3;
    const nameH = drawSmartText(doc, settings.shopName || 'ApnaDukan', textStartX, shopY, {
      fontSize: 16,
      bold: true,
      maxWidth: shopMaxW,
      colorRgb: NAVY
    }, fontFamily);
    shopY += Math.max(6, nameH + 1.5);

    if (settings.address) {
      const addrH = drawSmartText(doc, settings.address, textStartX, shopY, {
        fontSize: 9.5,
        maxWidth: shopMaxW,
        colorRgb: TEXT_MUTED
      }, fontFamily);
      shopY += Math.max(4.5, addrH + 1);
    }

    if (settings.phone) {
      const phH = drawSmartText(doc, 'Ph: ' + settings.phone, textStartX, shopY, {
        fontSize: 9.5,
        maxWidth: shopMaxW,
        colorRgb: TEXT_MUTED
      }, fontFamily);
      shopY += Math.max(4.5, phH + 1);
    }

    // Right-hand Invoice Header Block
    doc.setFillColor(TEAL[0], TEAL[1], TEAL[2]);
    doc.roundedRect(pageW - margin - 46, y - 1, 46, 9, 2, 2, 'F');
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    doc.text('INVOICE / BILL', pageW - margin - 23, y + 5, { align: 'center' });

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.text(bill.billNo, pageW - margin, y + 14, { align: 'right' });

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text('Date: ' + bill.date, pageW - margin, y + 19, { align: 'right' });

    y = Math.max(shopY + 4, y + 25);

    // Divider line
    doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 5;

    // Customer & Payment Info Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.roundedRect(margin, y, contentW, 20, 2, 2, 'FD');

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text('BILL TO / CUSTOMER:', margin + 4, y + 5.5);

    drawSmartText(doc, bill.customerName || 'Walk-in Customer', margin + 4, y + 11.2, {
      fontSize: 10.5,
      bold: true,
      maxWidth: 95,
      colorRgb: TEXT_DARK
    }, fontFamily);

    if (bill.customerPhone) {
      doc.setFont(fontFamily, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
      doc.text('Mob: ' + bill.customerPhone, margin + 4, y + 17.2);
    }

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text('PAYMENT MODE:', pageW - margin - 4, y + 5.5, { align: 'right' });

    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(TEAL[0], TEAL[1], TEAL[2]);
    doc.text(String(bill.paymentMode || 'Cash'), pageW - margin - 4, y + 12.5, { align: 'right' });

    y += 25;

    // Items Table
    const rows = (bill.items || []).map((line, index) => {
      const unitTxt = line.unit ? ' ' + line.unit : '';
      return [
        String(index + 1),
        line.itemName,
        storage.formatQty(line.qty) + unitTxt,
        storage.formatINR(line.rate),
        storage.formatINR(line.amount)
      ];
    });

    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [['S.No', 'Item Description', 'Qty', 'Rate', 'Amount']],
      body: rows,
      theme: 'grid',
      styles: {
        font: fontFamily,
        fontSize: 9.5,
        cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
        textColor: TEXT_DARK,
        lineColor: BORDER,
        lineWidth: 0.25
      },
      headStyles: {
        fillColor: NAVY,
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'left'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 14 },
        1: { halign: 'left' },
        2: { halign: 'right', cellWidth: 28 },
        3: { halign: 'right', cellWidth: 28 },
        4: { halign: 'right', cellWidth: 32, fontStyle: 'bold' }
      },
      didParseCell: function (data) {
        if (data.section === 'body' && hasComplexScript(data.cell.raw)) {
          data.cell._complexText = String(data.cell.raw);
          data.cell.text = [''];
        }
      },
      didDrawCell: function (data) {
        if (data.section === 'body' && data.cell._complexText) {
          const pad = 2.5;
          const maxW = Math.max(15, data.cell.width - pad * 2);
          const img = renderTextToPng(data.cell._complexText, {
            fontSize: 9.2,
            bold: false,
            color: '#0F172A',
            align: data.column.index === 1 ? 'left' : 'right',
            maxWidthMm: maxW
          });
          const drawY = data.cell.y + Math.max(1.5, (data.cell.height - img.heightMm) / 2);
          const drawX = data.column.index === 1
            ? data.cell.x + pad
            : data.cell.x + data.cell.width - pad - img.widthMm;
          doc.addImage(img.dataUrl, 'PNG', drawX, drawY, img.widthMm, img.heightMm);
        }
      }
    });

    const finalY = doc.lastAutoTable.finalY + 8;

    // Totals Box (Right aligned)
    const boxW = 74;
    const boxX = pageW - margin - boxW;
    let sumY = finalY;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.roundedRect(boxX, sumY, boxW, 27, 2, 2, 'FD');

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text('Sub Total:', boxX + 4, sumY + 6.5);
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    doc.text(storage.formatINR(bill.subTotal), boxX + boxW - 4, sumY + 6.5, { align: 'right' });

    doc.setTextColor(TEXT_MUTED[0], TEXT_MUTED[1], TEXT_MUTED[2]);
    doc.text('Discount:', boxX + 4, sumY + 13);
    doc.setTextColor(TEXT_DARK[0], TEXT_DARK[1], TEXT_DARK[2]);
    doc.text('- ' + storage.formatINR(bill.discount || 0), boxX + boxW - 4, sumY + 13, { align: 'right' });

    doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
    doc.roundedRect(boxX, sumY + 17, boxW, 10, 1.5, 1.5, 'F');
    doc.setFont(fontFamily, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text('Grand Total:', boxX + 4, sumY + 23.5);
    doc.text(storage.formatINR(bill.grandTotal), boxX + boxW - 4, sumY + 23.5, { align: 'right' });

    // Footer Thank You Note
    const footerY = Math.min(272, sumY + 40);
    doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
    doc.line(margin, footerY - 4, pageW - margin, footerY - 4);

    if (settings.footerNote) {
      drawSmartText(doc, settings.footerNote, pageW / 2, footerY + 2, {
        fontSize: 10,
        bold: true,
        align: 'center',
        maxWidth: contentW,
        colorRgb: TEAL
      }, fontFamily);
    }

    doc.setFont(fontFamily, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Generated with ApnaDukan Offline Billing', pageW / 2, 287, { align: 'center' });

    const safeCustomer = String(bill.customerName || 'Customer')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'Customer';
    const fileName = `${bill.billNo}_${safeCustomer}.pdf`;
    doc.save(fileName);
    return fileName;
  }

  global.ApnaDukanPDF = {
    generateInvoicePDF
  };
})(window);
