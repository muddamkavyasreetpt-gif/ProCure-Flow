import React from 'react';

export const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string }> = ({
  size = 'md',
  className = ''
}) => {
  const sizeMap = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-10 h-10 border-3'
  };

  return (
    <div
      className={`inline-block animate-spin rounded-full border-solid border-indigo-500 border-t-transparent ${sizeMap[size]} ${className}`}
      role="status"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
};
