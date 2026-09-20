import React from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  icon?: React.ReactNode;
  placeholder?: string;
  error?: string;
  hint?: string;
}

export const Select: React.FC<SelectProps> = ({
  label,
  value,
  options,
  onChange,
  icon,
  placeholder = '请选择',
  error,
  hint,
}) => {
  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center gap-2">
          {icon && <span className="text-dark-400">{icon}</span>}
          <span className="label-text mb-0">{label}</span>
        </div>
      )}
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`select-field pr-10 ${
            error ? 'border-accent-yellow/60 focus:ring-accent-yellow/30 focus:border-accent-yellow' : ''
          }`}
          aria-invalid={!!error}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400 pointer-events-none" />
      </div>
      {error && (
        <p className="text-xs text-accent-yellow leading-relaxed">{error}</p>
      )}
      {hint && !error && (
        <p className="text-xs text-dark-500 leading-relaxed">{hint}</p>
      )}
    </div>
  );
};
