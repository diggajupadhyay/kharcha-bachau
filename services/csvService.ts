import { Expense } from '../types';
import { format } from 'date-fns';

export const generateCSVExport = (expenses: Expense[]): void => {
    if (!expenses || expenses.length === 0) {
        throw new Error('No expenses to export');
    }

    // CSV Headers
    const headers = ['Date', 'Category', 'Amount (Rs.)', 'Note', 'Added By', 'Created At'];
    
    // Spreadsheets execute a leading =, +, - or @ as a formula, so a note written by
    // one member of a shared wallet could run when another member opens the export.
    // Prefixing with a tab makes the cell inert while still reading correctly.
    const neutralise = (value: string): string =>
        /^[=+\-@\t\r]/.test(value) ? `\t${value}` : value;

    // Every field is quoted, not just the note: a category or display name containing
    // a comma used to shift all following columns.
    const cell = (value: unknown): string => {
        const str = value === null || value === undefined ? '' : String(value);
        return `"${neutralise(str).replace(/"/g, '""')}"`;
    };

    const rows = expenses.map(expense => {
        const createdAt = Number.isFinite(expense.createdAt)
            ? format(new Date(expense.createdAt), 'yyyy-MM-dd HH:mm:ss')
            : '';
        // `.toFixed` on a non-number throws, and one corrupt row used to abort the
        // whole export with a bare "Failed to export CSV".
        const amount = Number.isFinite(expense.amount) ? expense.amount.toFixed(2) : '';
        return [
            cell(expense.date),
            cell(`${expense.categoryEmoji ?? ''} ${expense.categoryName ?? ''}`.trim()),
            cell(amount),
            cell(expense.note || ''),
            cell(expense.createdBy?.name || 'Guest'),
            cell(createdAt)
        ].join(',');
    });

    // Combine headers and rows
    const csvContent = [
        headers.map(h => `"${h}"`).join(','),
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

