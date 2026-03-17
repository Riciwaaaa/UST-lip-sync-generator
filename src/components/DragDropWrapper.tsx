import React, { useState, DragEvent, ReactNode } from 'react';

interface DragDropWrapperProps {
  onDropFile: (file: File) => void;
  accept?: string;
  children: (isDragging: boolean) => ReactNode;
  className?: string | ((isDragging: boolean) => string);
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const DragDropWrapper: React.FC<DragDropWrapperProps> = ({
  onDropFile,
  accept,
  children,
  className,
  onClick,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Check if we're actually leaving the element, not just entering a child
    if (e.currentTarget.contains(e.relatedTarget as Node)) {
      return;
    }
    
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      
      // Basic mime type check if accept is provided
      if (accept) {
        const acceptedTypes = accept.split(',').map(t => t.trim());
        const fileType = file.type;
        const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
        
        const isAccepted = acceptedTypes.some(type => {
          if (type.startsWith('.')) {
            return type.toLowerCase() === fileExtension;
          } else if (type.endsWith('/*')) {
            const baseType = type.split('/')[0];
            return fileType.startsWith(baseType + '/');
          } else {
            return type === fileType;
          }
        });
        
        if (!isAccepted) {
          return; // Ignore file if it doesn't match accept
        }
      }
      
      onDropFile(file);
    }
  };

  const resolvedClassName = typeof className === 'function' ? className(isDragging) : `${className || ''} ${isDragging ? 'border-emerald-500 bg-emerald-500/10 scale-[1.02]' : ''}`;

  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onClick}
      className={resolvedClassName}
    >
      {children(isDragging)}
    </div>
  );
};
