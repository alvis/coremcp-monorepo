import React from 'react';
import clsx from 'clsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircleHalfStroke,
  faMoonStars,
  faSunBright,
} from '@fortawesome/pro-duotone-svg-icons';

function getIcon(value) {
  if (value === 'dark') {
    return faMoonStars;
  }

  if (value === 'light') {
    return faSunBright;
  }

  return faCircleHalfStroke;
}

function getLabel(value) {
  if (value === 'dark') {
    return 'dark mode';
  }

  if (value === 'light') {
    return 'light mode';
  }

  return 'system mode';
}

export default function ColorModeToggle({
  className,
  buttonClassName,
  value,
  onChange,
}) {
  const nextValue = value === 'dark' ? 'light' : 'dark';
  const label = `Switch between dark and light mode (currently ${getLabel(value)})`;

  return (
    <div className={clsx('themeToggleShell', className)}>
      <button
        type="button"
        className={clsx('clean-btn', 'vitestModeToggle', buttonClassName)}
        onClick={() => onChange(nextValue)}
        title={getLabel(value)}
        aria-label={label}
      >
        <FontAwesomeIcon icon={getIcon(value)} />
      </button>
    </div>
  );
}
