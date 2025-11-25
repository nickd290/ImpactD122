import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  color: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'yellow';
  subtitle?: string;
}

export function StatCard({ title, value, color, subtitle }: StatCardProps) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-red-50 text-impact-red',
    red: 'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    yellow: 'bg-yellow-50 text-yellow-600',
  };

  return (
    <div className={`rounded-lg shadow p-6 ${colors[color]}`}>
      <h3 className="text-sm font-medium opacity-80">{title}</h3>
      <p className="text-3xl font-bold mt-2">{value}</p>
      {subtitle && <p className="text-sm mt-1 opacity-70">{subtitle}</p>}
    </div>
  );
}
