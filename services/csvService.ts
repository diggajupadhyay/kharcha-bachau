import { Expense } from '../types';
import { format } from 'date-fns';

export const generateCSVExport = (expenses: Expense[]): void => {
    if (!expenses || expenses.length === 0) {
        throw new Error('No expenses to export');
    }

    // CSV Headers
    const headers = ['Date', 'Category', 'Amount (Rs.)', 'Note', 'Added By', 'Created At'];
    
    // Convert expenses to CSV rows
    const rows = expenses.map(expense => {
        const date = expense.date;
        const category = `${expense.categoryEmoji} ${expense.categoryName}`;
        const amount = expense.amount.toFixed(2);
        const note = (expense.note || '').replace(/"/g, '""'); // Escape quotes in CSV
        const addedBy = expense.createdBy?.name || 'Guest';
        const createdAt = format(new Date(expense.createdAt), 'yyyy-MM-dd HH:mm:ss');
        
        // Wrap fields in quotes to handle commas and special characters
        return [
            date,
            category,
            amount,
            `"${note}"`,
            addedBy,
            createdAt
        ].join(',');
    });

    // Combine headers and rows
    const csvContent = [
        headers.join(','),
        ...rows
    ].join('\n');

    // Add BOM for UTF-8 to ensure proper encoding in Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kharcha_bachau_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

