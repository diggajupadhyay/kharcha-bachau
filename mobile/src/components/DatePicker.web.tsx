import { useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '../lib/theme-context';
import { type, space, radius } from '../lib/tokens';

/**
 * The browser's date control.
 *
 * `<input type="date">` is the platform's own date picker — it gets the user's
 * locale, keyboard and calendar for free, and needs no third-party bundle. It is
 * always visible rather than hidden behind a toggle, because a date field that
 * appears when tapped is a desktop-only idea that hurts here.
 */
interface DatePickerProps {
  value: Date;
  onChange: (event: unknown, date?: Date) => void;
}

const toInputValue = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const DatePicker: React.FC<DatePickerProps> = ({ value, onChange }) => {
  const { theme } = useTheme();
  const [draft, setDraft] = useState(toInputValue(value));

  // Keep the field in step when the sheet changes the date another way.
  const shown = toInputValue(value);
  if (shown !== draft && shown !== undefined) setDraft(shown);

  const commit = (next: string) => {
    setDraft(next);
    if (!next) return;
    // Parse as local midnight; `new Date('yyyy-mm-dd')` is UTC and can land on the
    // previous day for anyone west of Greenwich.
    const [y, m, d] = next.split('-').map(Number);
    if (!y || !m || !d) return;
    onChange(null, new Date(y, m - 1, d));
  };

  return (
    <View style={{ paddingTop: space.sm }}>
      <input
        type="date"
        value={draft}
        max={toInputValue(new Date())}
        min="2000-01-01"
        onChange={(e) => commit(e.target.value)}
        aria-label="Expense date"
        style={{
          ...type.body,
          fontSize: 15,
          color: theme.text,
          backgroundColor: theme.surfaceRaised ?? theme.surface,
          border: `1px solid ${theme.border}`,
          borderRadius: radius.md,
          padding: space.sm,
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    </View>
  );
};

export default DatePicker;