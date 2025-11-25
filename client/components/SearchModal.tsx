import React, { useState, useEffect, useCallback } from 'react';
import { Search, Briefcase, Users, Building2, ArrowRight, X } from 'lucide-react';
import { cn } from '../lib/utils';

interface SearchResult {
  id: string;
  type: 'job' | 'customer' | 'vendor';
  title: string;
  subtitle?: string;
  metadata?: string;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobs: any[];
  customers: any[];
  vendors: any[];
  onSelectJob: (job: any) => void;
  onSelectCustomer: (customer: any) => void;
  onSelectVendor: (vendor: any) => void;
}

export function SearchModal({
  isOpen,
  onClose,
  jobs,
  customers,
  vendors,
  onSelectJob,
  onSelectCustomer,
  onSelectVendor,
}: SearchModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Build search results
  const results: SearchResult[] = React.useMemo(() => {
    if (!searchTerm.trim()) return [];

    const term = searchTerm.toLowerCase();
    const allResults: SearchResult[] = [];

    // Search jobs
    jobs.forEach(job => {
      const matchTitle = job.title?.toLowerCase().includes(term);
      const matchNumber = job.number?.toLowerCase().includes(term);
      const matchCustomer = job.customer?.name?.toLowerCase().includes(term);
      const matchVendor = job.vendor?.name?.toLowerCase().includes(term);

      if (matchTitle || matchNumber || matchCustomer || matchVendor) {
        allResults.push({
          id: job.id,
          type: 'job',
          title: `${job.number} - ${job.title}`,
          subtitle: job.customer?.name,
          metadata: job.status,
        });
      }
    });

    // Search customers
    customers.forEach(customer => {
      const matchName = customer.name?.toLowerCase().includes(term);
      const matchEmail = customer.email?.toLowerCase().includes(term);
      const matchContact = customer.contactPerson?.toLowerCase().includes(term);

      if (matchName || matchEmail || matchContact) {
        allResults.push({
          id: customer.id,
          type: 'customer',
          title: customer.name,
          subtitle: customer.contactPerson,
          metadata: customer.email,
        });
      }
    });

    // Search vendors
    vendors.forEach(vendor => {
      const matchName = vendor.name?.toLowerCase().includes(term);
      const matchEmail = vendor.email?.toLowerCase().includes(term);
      const matchContact = vendor.contactPerson?.toLowerCase().includes(term);

      if (matchName || matchEmail || matchContact) {
        allResults.push({
          id: vendor.id,
          type: 'vendor',
          title: vendor.name,
          subtitle: vendor.contactPerson,
          metadata: vendor.email,
        });
      }
    });

    return allResults.slice(0, 10); // Limit to 10 results
  }, [searchTerm, jobs, customers, vendors]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && results.length > 0) {
        e.preventDefault();
        handleSelectResult(results[selectedIndex]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose]);

  const handleSelectResult = useCallback((result: SearchResult) => {
    if (result.type === 'job') {
      const job = jobs.find(j => j.id === result.id);
      if (job) onSelectJob(job);
    } else if (result.type === 'customer') {
      const customer = customers.find(c => c.id === result.id);
      if (customer) onSelectCustomer(customer);
    } else if (result.type === 'vendor') {
      const vendor = vendors.find(v => v.id === result.id);
      if (vendor) onSelectVendor(vendor);
    }
    onClose();
  }, [jobs, customers, vendors, onSelectJob, onSelectCustomer, onSelectVendor, onClose]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'job':
        return <Briefcase className="w-4 h-4" />;
      case 'customer':
        return <Users className="w-4 h-4" />;
      case 'vendor':
        return <Building2 className="w-4 h-4" />;
      default:
        return <Search className="w-4 h-4" />;
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] px-4">
        <div className="w-full max-w-2xl bg-card rounded-lg border border-border shadow-2xl animate-in zoom-in-95 slide-in-from-top-4 duration-200">
          {/* Search Input */}
          <div className="flex items-center border-b border-border px-4">
            <Search className="w-5 h-5 text-muted-foreground mr-3" />
            <input
              type="text"
              placeholder="Search jobs, customers, vendors..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSelectedIndex(0);
              }}
              className="flex-1 py-4 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none"
              autoFocus
            />
            <button
              onClick={onClose}
              className="p-1 hover:bg-accent rounded-md transition-colors"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto">
            {searchTerm && results.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">No results found</p>
              </div>
            ) : results.length > 0 ? (
              <div className="py-2">
                {results.map((result, index) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleSelectResult(result)}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3 transition-colors",
                      index === selectedIndex
                        ? "bg-accent"
                        : "hover:bg-accent/50"
                    )}
                  >
                    <div className="flex items-start gap-3 flex-1 text-left">
                      <div className={cn(
                        "mt-0.5 p-2 rounded-md",
                        result.type === 'job' ? "bg-primary/10 text-primary" :
                        result.type === 'customer' ? "bg-blue-500/10 text-blue-600" :
                        "bg-green-500/10 text-green-600"
                      )}>
                        {getIcon(result.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground uppercase">
                            {result.type}
                          </span>
                          {result.metadata && (
                            <span className="text-xs text-muted-foreground">
                              • {result.metadata}
                            </span>
                          )}
                        </div>
                        <p className="font-medium text-foreground truncate">
                          {result.title}
                        </p>
                        {result.subtitle && (
                          <p className="text-sm text-muted-foreground truncate">
                            {result.subtitle}
                          </p>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Type to search...</p>
                <p className="text-xs mt-1">Jobs • Customers • Vendors</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-muted/50 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border bg-background">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded border bg-background">↓</kbd>
              <span>Navigate</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border bg-background">↵</kbd>
              <span>Select</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded border bg-background">Esc</kbd>
              <span>Close</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
