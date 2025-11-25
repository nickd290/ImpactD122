import React from 'react';
import * as Lucide from 'lucide-react';

interface IconProps {
  name: keyof typeof Lucide;
  size?: number;
  className?: string;
}

export const Icon: React.FC<IconProps> = ({ name, size = 20, className = '' }) => {
  const LucideIcon = Lucide[name] as React.ElementType;
  if (!LucideIcon) return null;
  return <LucideIcon size={size} className={className} />;
};
