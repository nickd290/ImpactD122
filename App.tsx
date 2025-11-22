import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Entity, Job, JobStatus, EntityType, View, LineItem, JobSpecs, JobFinancials, Contact, ProductType } from './types';
import { SEED_CUSTOMERS, SEED_VENDORS, SEED_JOBS, MY_COMPANY } from './constants';
import { Icon } from './components/Icon';
import { parsePrintSpecs, generateEmailDraft, parsePurchaseOrder } from './services/geminiService';
import { generatePDF } from './services/pdfService';

// --- Components ---
const SidebarItem = ({ active, icon, label, onClick }: { active: boolean, icon: any, label: string, onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
      active 
        ? 'bg-orange-50 text-orange-600 border-r-4 border-orange-600' 
        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
    }`}
  >
    <Icon name={icon} size={20} />
    {label}
  </button>
);

const Card = ({ children, className = '', onClick }: { children?: React.ReactNode, className?: string, onClick?: () => void }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-200 ${className}`} onClick={onClick}>
    {children}
  </div>
);

const Badge = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    [JobStatus.DRAFT]: 'bg-slate-100 text-slate-600',
    [JobStatus.QUOTED]: 'bg-blue-100 text-blue-700',
    [JobStatus.APPROVED]: 'bg-emerald-100 text-emerald-700',
    [JobStatus.PO_ISSUED]: 'bg-purple-100 text-purple-700',
    [JobStatus.IN_PRODUCTION]: 'bg-amber-100 text-amber-700',
    [JobStatus.SHIPPED]: 'bg-indigo-100 text-indigo-700',
    [JobStatus.INVOICED]: 'bg-teal-100 text-teal-700',
    [JobStatus.PAID]: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`px-