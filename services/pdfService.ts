import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Expense, MonthlyStats } from '../types';
import { format } from 'date-fns';

export const generatePDFReport = (expenses: Expense[], stats: MonthlyStats, dateRange: string) => {
    const doc = new jsPDF();

    // Brand Colors
    const primaryColor = '#10b981';
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(primaryColor);
    doc.text("Kharcha Bachau", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Expense Report | ${dateRange}`, 14, 28);
    doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`, 14, 33);

    // Summary Card
    doc.setDrawColor(220);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 40, 180, 20, 3, 3, 'FD');

    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text("TOTAL EXPENSE", 20, 48);

    doc.setFontSize(12);
    doc.setTextColor(50);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    doc.text(`Rs. ${totalExpenses.toLocaleString()}`, 20, 56);

    // Table
    const tableData = expenses.map(e => [
        e.date,
        e.categoryName,
        e.note || '-',
        (e.tags && e.tags.length > 0) ? e.tags.join(', ') : '-',
        `Rs. ${e.amount.toFixed(2)}`,
        e.createdBy?.name || 'Guest'
    ]);

    autoTable(doc, {
        startY: 70,
        head: [['Date', 'Category', 'Note', 'Tags', 'Amount', 'Added By']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: 'bold' },
        columnStyles: {
            4: { fontStyle: 'bold', halign: 'right' },
            3: { fontSize: 8 } // Smaller font for tags
        },
        styles: { fontSize: 8, cellPadding: 2 }
    });

    // Footer
    const pageCount = doc.internal.pages.length - 1;
    doc.setFontSize(8);
    doc.setTextColor(200);
    doc.text("Kharcha Bachau - #1 Expense Tracker for Nepal", 14, doc.internal.pageSize.height - 10);

    doc.save(`kharcha_bachau_report_${format(new Date(), 'yyyyMMdd')}.pdf`);
};