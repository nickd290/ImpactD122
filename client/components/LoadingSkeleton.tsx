import React from 'react';

// Skeleton base component
const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
);

// Sidebar skeleton
export const SidebarSkeleton = () => (
  <div className="w-64 bg-white border-r border-gray-200 h-screen p-4">
    {/* Logo area */}
    <div className="mb-8">
      <Skeleton className="h-10 w-40" />
    </div>

    {/* Search bar */}
    <Skeleton className="h-10 w-full mb-6" />

    {/* Navigation items */}
    <div className="space-y-2">
      {[...Array(8)].map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>

    {/* Quick actions at bottom */}
    <div className="absolute bottom-4 left-4 right-4">
      <Skeleton className="h-10 w-full mb-2" />
      <Skeleton className="h-10 w-full" />
    </div>
  </div>
);

// Table skeleton for jobs list
export const TableSkeleton = ({ rows = 10 }: { rows?: number }) => (
  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
    {/* Table header */}
    <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
      <div className="flex gap-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>

    {/* Table rows */}
    {[...Array(rows)].map((_, i) => (
      <div key={i} className="border-b border-gray-100 px-6 py-4">
        <div className="flex gap-4 items-center">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </div>
    ))}
  </div>
);

// Stats cards skeleton for dashboard
export const StatsCardsSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
        <Skeleton className="h-4 w-20 mb-2" />
        <Skeleton className="h-8 w-24 mb-1" />
        <Skeleton className="h-3 w-16" />
      </div>
    ))}
  </div>
);

// Page header skeleton
export const PageHeaderSkeleton = () => (
  <div className="flex items-center justify-between mb-6">
    <div>
      <Skeleton className="h-8 w-32 mb-2" />
      <Skeleton className="h-4 w-48" />
    </div>
    <div className="flex gap-2">
      <Skeleton className="h-10 w-24" />
      <Skeleton className="h-10 w-32" />
    </div>
  </div>
);

// Full page loading skeleton
export const AppLoadingSkeleton = () => (
  <div className="min-h-screen bg-gray-50 flex">
    {/* Sidebar skeleton */}
    <SidebarSkeleton />

    {/* Main content skeleton */}
    <div className="flex-1 p-8">
      <PageHeaderSkeleton />
      <StatsCardsSkeleton />
      <TableSkeleton rows={8} />
    </div>
  </div>
);

export default AppLoadingSkeleton;
