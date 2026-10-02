import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';

/**
 * The date control the Add Expense sheet renders.
 *
 * `@react-native-community/datetimepicker` ships no web build, so the sheet used to
 * import a component that cannot exist in a browser. This module is what the native
 * build resolves; DatePicker.web.ts provides a plain date input with the same prop
 * shape, so each build carries only its own implementation and the sheet stays
 * platform-agnostic.
 *
 * `onChange` keeps the native two-argument signature so the existing handler — which
 * validates the year and closes itself on Android — works unchanged here.
 */
interface DatePickerProps {
  value: Date;
  onChange: (event: unknown, date?: Date) => void;
}

const DatePicker: React.FC<DatePickerProps> = ({ value, onChange }) => (
  <DateTimePicker
    value={value}
    mode="date"
    display={Platform.OS === 'android' ? 'default' : 'compact'}
    maximumDate={new Date()}
    minimumDate={new Date(2000, 0, 1)}
    onChange={onChange}
  />
);

export default DatePicker;