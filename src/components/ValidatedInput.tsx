import { useState } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';

interface ValidatedInputProps {
  label: string;
  type?: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  validate?: (val: string) => string | null;
  disabled?: boolean;
}

export default function ValidatedInput({
  label, type = 'text', value, onChange, placeholder,
  required, minLength, validate, disabled,
}: ValidatedInputProps) {
  const [touched, setTouched] = useState(false);

  const getError = (): string | null => {
    if (!touched) return null;
    if (required && !value.trim()) return `${label} is required`;
    if (minLength && value.length < minLength) return `Min ${minLength} characters`;
    if (type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Invalid email';
    if (validate) return validate(value);
    return null;
  };

  const error = getError();
  const isValid = touched && !error && value.trim().length > 0;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full px-4 py-3 pr-10 rounded-xl border outline-none transition-all text-gray-900 ${
            error
              ? 'border-danger focus:ring-2 focus:ring-danger/30 focus:border-danger'
              : isValid
                ? 'border-success focus:ring-2 focus:ring-success/30 focus:border-success'
                : 'border-gray-300 focus:ring-2 focus:ring-brand/30 focus:border-brand'
          }`}
        />
        {isValid && (
          <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-success" />
        )}
        {error && (
          <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-danger" />
        )}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
