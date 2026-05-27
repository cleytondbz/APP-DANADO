import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './helpers';
import { MONTH_NAMES, type Category } from './types';

export interface ReportData {
  year: number;
  month: number;
  monthTotal: number;
  prevMonthTotal: number;
  monthComparison: number;
  categories: Category[];
  catTotals: Record<string, number>;
  dailyData: { day: number; total: number }[];
  stores: { name: string; total: number }[];
}

export function exportReportPDF(data: ReportData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 15;

  // Header
  doc.setFontSize(20);
  doc.text('Relatório Financeiro', pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;

  doc.setFontSize(12);
  doc.text(`${MONTH_NAMES[data.month - 1]} de ${data.year}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 12;

  // Total do Mês
  doc.setFontSize(14);
  doc.setTextColor(40, 100, 200);
  doc.text('Total do Mês', 15, yPos);
  yPos += 8;

  doc.setFontSize(24);
  doc.setTextColor(0, 0, 0);
  doc.text(formatCurrency(data.monthTotal), 15, yPos);
  yPos += 10;

  // Comparação com mês anterior
  if (data.prevMonthTotal !== 0) {
    doc.setFontSize(11);
    const comparisonColor = data.monthComparison >= 0 ? [34, 197, 94] : [220, 38, 38];
    doc.setTextColor(...(comparisonColor as [number, number, number]));
    doc.text(
      `vs. mês anterior: ${data.monthComparison >= 0 ? '+' : ''}${data.monthComparison.toFixed(1)}%`,
      15,
      yPos
    );
    yPos += 8;
  }

  doc.setTextColor(0, 0, 0);
  yPos += 4;

  // Resumo por Categoria
  doc.setFontSize(14);
  doc.text('Resumo por Categoria', 15, yPos);
  yPos += 8;

  doc.setFontSize(10);
  const categoryRows = data.categories.map(cat => [
    cat.name,
    formatCurrency(data.catTotals[cat.id] || 0),
    cat.operation === 'add' ? '+ Soma' : cat.operation === 'subtract' ? '- Subtrai' : 'Nulo',
  ]);

  autoTable(doc, {
    head: [['Categoria', 'Valor', 'Operação']],
    body: categoryRows,
    startY: yPos,
    margin: { left: 15, right: 15 },
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [40, 100, 200], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // Check if we need a new page
  if (yPos > pageHeight - 30) {
    doc.addPage();
    yPos = 15;
  }

  // Evolução Diária (tabela resumida)
  doc.setFontSize(14);
  doc.text('Evolução Diária (Primeiros 15 dias)', 15, yPos);
  yPos += 8;

  const dailyRows = data.dailyData.slice(0, 15).map(d => [
    d.day.toString(),
    formatCurrency(d.total),
  ]);

  autoTable(doc, {
    head: [['Dia', 'Total']],
    body: dailyRows,
    startY: yPos,
    margin: { left: 15, right: 15 },
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [40, 100, 200], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // Lojas (se houver)
  if (data.stores.length > 0) {
    if (yPos > pageHeight - 30) {
      doc.addPage();
      yPos = 15;
    }

    doc.setFontSize(14);
    doc.text('Resumo por Loja', 15, yPos);
    yPos += 8;

    const storeRows = data.stores.map(s => [s.name, formatCurrency(s.total)]);

    autoTable(doc, {
      head: [['Loja', 'Total']],
      body: storeRows,
      startY: yPos,
      margin: { left: 15, right: 15 },
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [40, 100, 200], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });
  }

  // Footer
  const totalPages = (doc as any).internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  // Download - usando método correto
  const fileName = `relatorio-${MONTH_NAMES[data.month - 1].toLowerCase()}-${data.year}.pdf`;
  
  try {
    // Método 1: Tentar usar output + download
    const pdfBlob = doc.output('blob');
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    // Fallback para método antigo
    (doc as any).save(fileName);
  }
}
