import React, { useState, useEffect } from 'react';
import { User, Settings, DollarSign, Paperclip } from 'lucide-react';
import { JobFormData, Specs, LineItem, JobFormTab, Customer, Vendor } from './types';
import { BasicsTab } from './tabs/BasicsTab';
import { SpecsTab } from './tabs/SpecsTab';
import { PricingTab } from './tabs/PricingTab';
import { FilesTab } from './tabs/FilesTab';

interface TabbedJobFormProps {
  customers: Customer[];
  vendors: Vendor[];
  initialData?: any;
  onFormDataChange: (data: {
    formData: JobFormData;
    specs: Specs;
    lineItems: LineItem[];
    sellPrice: string;
    bradfordCut: number;
  }) => void;
  uploadedFiles: any[];
  pendingFiles: File[];
  setPendingFiles: React.Dispatch<React.SetStateAction<File[]>>;
  isUploading: boolean;
  uploadError: string;
  onFileSelect: (files: FileList) => void;
  onDeleteFile: (fileId: string) => void;
}

const tabs: { id: JobFormTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'basics', label: 'Basics', icon: User },
  { id: 'specs', label: 'Specs', icon: Settings },
  { id: 'pricing', label: 'Pricing', icon: DollarSign },
  { id: 'files', label: 'Files', icon: Paperclip },
];

const getInitialFormData = (data: any): JobFormData => ({
  title: data?.title || '',
  customerId: data?.customerId || '',
  vendorId: data?.vendorId || '',
  status: data?.status || 'ACTIVE',
  notes: data?.notes || '',
  customerPONumber: data?.customerPONumber || '',
  bradfordRefNumber: data?.bradfordRefNumber || '',
  dueDate: data?.dueDate || '',
  jdSuppliesPaper: data?.jdSuppliesPaper || false,
  paperInventoryId: data?.paperInventoryId || '',
});

const getInitialSpecs = (data: any): Specs => ({
  productType: data?.specs?.productType || 'OTHER',
  paperType: data?.specs?.paperType || '',
  paperWeight: data?.specs?.paperWeight || '',
  colors: data?.specs?.colors || '',
  coating: data?.specs?.coating || '',
  finishing: data?.specs?.finishing || '',
  flatSize: data?.specs?.flatSize || '',
  finishedSize: data?.specs?.finishedSize || '',
  pageCount: data?.specs?.pageCount || '',
  bindingStyle: data?.specs?.bindingStyle || '',
  coverType: data?.specs?.coverType || 'SELF',
  coverPaperType: data?.specs?.coverPaperType || '',
  paperLbs: data?.bradfordPaperLbs || data?.specs?.paperLbs || '',
  folds: data?.specs?.folds || '',
  perforations: data?.specs?.perforations || '',
  dieCut: data?.specs?.dieCut || '',
  bleed: data?.specs?.bleed || '',
  proofType: data?.specs?.proofType || '',
  shipToName: data?.specs?.shipToName || '',
  shipToAddress: data?.specs?.shipToAddress || '',
  shipVia: data?.specs?.shipVia || '',
  specialInstructions: data?.specs?.specialInstructions || '',
  artworkInstructions: data?.specs?.artworkInstructions || '',
  packingInstructions: data?.specs?.packingInstructions || '',
  labelingInstructions: data?.specs?.labelingInstructions || '',
  additionalNotes: data?.specs?.additionalNotes || '',
  artworkUrl: data?.specs?.artworkUrl || '',
  artworkToFollow: data?.specs?.artworkToFollow || false,
  versions: data?.specs?.versions || [],
  languageBreakdown: data?.specs?.languageBreakdown || [],
  totalVersionQuantity: data?.specs?.totalVersionQuantity || 0,
  timeline: data?.specs?.timeline || {},
  mailing: data?.specs?.mailing || {},
  responsibilities: data?.specs?.responsibilities || { vendorTasks: [], customerTasks: [] },
  specialHandling: data?.specs?.specialHandling || {},
  paymentTerms: data?.specs?.paymentTerms || '',
  fob: data?.specs?.fob || '',
  accountNumber: data?.specs?.accountNumber || '',
});

const getInitialLineItems = (data: any): LineItem[] =>
  data?.lineItems?.length > 0 ? data.lineItems : [
    { description: '', quantity: 1, unitCost: 0, markupPercent: 20, unitPrice: 0 }
  ];

export function TabbedJobForm({
  customers,
  vendors,
  initialData,
  onFormDataChange,
  uploadedFiles,
  pendingFiles,
  setPendingFiles,
  isUploading,
  uploadError,
  onFileSelect,
  onDeleteFile,
}: TabbedJobFormProps) {
  const [activeTab, setActiveTab] = useState<JobFormTab>('basics');
  const [formData, setFormData] = useState<JobFormData>(() => getInitialFormData(initialData));
  const [specs, setSpecs] = useState<Specs>(() => getInitialSpecs(initialData));
  const [lineItems, setLineItems] = useState<LineItem[]>(() => getInitialLineItems(initialData));

  const [useCustomSize, setUseCustomSize] = useState(false);
  const [customSizeValue, setCustomSizeValue] = useState('');
  const [sellPrice, setSellPrice] = useState<string>(initialData?.sellPrice ? String(initialData.sellPrice) : '');
  const [sellPriceError, setSellPriceError] = useState<string>('');
  const [overrideSellPrice, setOverrideSellPrice] = useState(!!initialData?.sellPrice);
  const [bradfordCut, setBradfordCut] = useState(initialData?.bradfordCut || 0);
  const [useBradford35Percent, setUseBradford35Percent] = useState(false);
  const [paperInventory, setPaperInventory] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Check if selected vendor is Bradford partner
  const selectedVendor = vendors.find(v => v.id === formData.vendorId);
  const isBradfordVendor = selectedVendor?.isPartner || false;

  // Fetch paper inventory
  useEffect(() => {
    fetch('/api/paper-inventory')
      .then(res => res.json())
      .then(data => setPaperInventory(data || []))
      .catch(() => setPaperInventory([]));
  }, []);

  // Reset form when initialData changes
  useEffect(() => {
    setFormData(getInitialFormData(initialData));
    setSpecs(getInitialSpecs(initialData));
    setLineItems(getInitialLineItems(initialData));
    setSellPrice(initialData?.sellPrice ? String(initialData.sellPrice) : '');
    setOverrideSellPrice(!!initialData?.sellPrice);
    setBradfordCut(initialData?.bradfordCut || 0);
    setUseCustomSize(false);
    setCustomSizeValue('');
  }, [initialData]);

  // Notify parent of form data changes
  useEffect(() => {
    onFormDataChange({
      formData,
      specs,
      lineItems,
      sellPrice,
      bradfordCut,
    });
  }, [formData, specs, lineItems, sellPrice, bradfordCut]);

  // Auto-calculate sell price from line items
  useEffect(() => {
    if (!overrideSellPrice) {
      const total = lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      setSellPrice(total.toFixed(2));
    }
  }, [lineItems, overrideSellPrice]);

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'basics' && (
          <BasicsTab
            formData={formData}
            setFormData={setFormData}
            customers={customers}
            vendors={vendors}
            sellPrice={sellPrice}
            setSellPrice={setSellPrice}
            overrideSellPrice={overrideSellPrice}
            setOverrideSellPrice={setOverrideSellPrice}
            sellPriceError={sellPriceError}
          />
        )}

        {activeTab === 'specs' && (
          <SpecsTab
            specs={specs}
            setSpecs={setSpecs}
            useCustomSize={useCustomSize}
            setUseCustomSize={setUseCustomSize}
            customSizeValue={customSizeValue}
            setCustomSizeValue={setCustomSizeValue}
          />
        )}

        {activeTab === 'pricing' && (
          <PricingTab
            formData={formData}
            setFormData={setFormData}
            lineItems={lineItems}
            setLineItems={setLineItems}
            paperInventory={paperInventory}
            isBradfordVendor={isBradfordVendor}
            bradfordCut={bradfordCut}
            setBradfordCut={setBradfordCut}
            useBradford35Percent={useBradford35Percent}
            setUseBradford35Percent={setUseBradford35Percent}
          />
        )}

        {activeTab === 'files' && (
          <FilesTab
            formData={formData}
            setFormData={setFormData}
            specs={specs}
            setSpecs={setSpecs}
            uploadedFiles={uploadedFiles}
            pendingFiles={pendingFiles}
            setPendingFiles={setPendingFiles}
            isUploading={isUploading}
            uploadError={uploadError}
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            onFileSelect={onFileSelect}
            onDeleteFile={onDeleteFile}
          />
        )}
      </div>
    </div>
  );
}
