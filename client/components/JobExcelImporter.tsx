import React, { useState } from 'react';
import { Upload, X, FileSpreadsheet, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

interface JobExcelImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onParsed: (data: any[]) => void;
  customers: any[];
  vendors: any[];
}

export function JobExcelImporter({
  isOpen,
  onClose,
  onParsed,
  customers,
  vendors,
}: JobExcelImporterProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [workbookData, setWorkbookData] = useState<any>(null);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError('Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    setError(null);
    setIsProcessing(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);

      // Store workbook for later use
      setWorkbookData(workbook);
      setSheetNames(workbook.SheetNames);

      // Auto-select "Jobs" sheet if it exists, otherwise first sheet
      const jobsSheet = workbook.SheetNames.find(name => name.toLowerCase() === 'jobs');
      const defaultSheet = jobsSheet || workbook.SheetNames[0];
      setSelectedSheet(defaultSheet);

      // Process the default sheet
      processSheet(workbook, defaultSheet);
    } catch (err: any) {
      console.error('Error parsing Excel:', err);
      setError(`Error parsing Excel file: ${err.message}`);
      setIsProcessing(false);
    }
  };

  const processSheet = (workbook: any, sheetName: string) => {
    try {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        setError(`The sheet "${sheetName}" appears to be empty`);
        setIsProcessing(false);
        return;
      }

      // Parse the data into job format
      const parsedJobs = parseExcelData(jsonData);

      if (parsedJobs.length === 0) {
        setError(`No valid job data found in sheet "${sheetName}"`);
        setIsProcessing(false);
        return;
      }

      setIsProcessing(false);
      onParsed(parsedJobs);
      onClose();
    } catch (err: any) {
      console.error('Error processing sheet:', err);
      setError(`Error processing sheet: ${err.message}`);
      setIsProcessing(false);
    }
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (workbookData) {
      setIsProcessing(true);
      processSheet(workbookData, sheetName);
    }
  };

  const parseExcelData = (data: any[]): any[] => {
    return data.map((row, index) => {
      // Determine customer name from various possible fields
      const customerName = row['customerName'] || row['Customer Name'] || row['Customer'] || '';

      // Determine vendor name from various possible fields
      const vendorName = row['vendorName'] || row['Vendor Name'] || row['Vendor'] || '';

      // Extract title
      const title = row['title'] || row['Job Title'] || row['Title'] || row['jobNo'] || `Job ${index + 1}`;

      // Extract description/specs
      const description = row['description'] || row['Description'] || row['specs'] || '';

      // Extract status - map from old system if needed
      let status = row['status'] || row['Status'] || 'DRAFT';
      if (status === 'COMPLETED') status = 'DELIVERED';
      if (status === 'PENDING') status = 'DRAFT';

      // Extract dates
      const dueDate = row['deliveryDate'] || row['mailDate'] || row['Due Date'] || '';

      // Extract PO number
      const customerPONumber = row['customerPONumber'] || row['Customer PO'] || row['PO Number'] || '';

      // Calculate pricing from the printing-workflow format
      const quantity = parseFloat(row['quantity'] || row['Quantity'] || '1');
      const customerTotal = parseFloat(row['customerTotal'] || row['Customer Total'] || '0');
      const bradfordTotal = parseFloat(row['bradfordTotal'] || row['vendorAmount'] || row['Vendor Amount'] || '0');
      const jdTotal = parseFloat(row['jdTotal'] || '0');

      // Calculate unit costs and prices
      const unitCost = quantity > 0 ? bradfordTotal / quantity : 0;
      const unitPrice = quantity > 0 ? customerTotal / quantity : 0;
      const markupPercent = unitCost > 0 ? ((unitPrice - unitCost) / unitCost) * 100 : 20;

      // Extract specs from the row
      const specs: any = {};

      // Get common spec fields from Excel columns
      if (row['paperType']) specs.paperType = row['paperType'];
      if (row['sizeName']) {
        // If sizeName contains dimensions like "8.5x11", use it as finishedSize
        specs.finishedSize = row['sizeName'];
      }
      if (row['colors']) specs.colors = row['colors'];
      if (row['coating']) specs.coating = row['coating'];
      if (row['finishing']) specs.finishing = row['finishing'];
      if (row['flatSize']) specs.flatSize = row['flatSize'];
      if (row['productType']) specs.productType = row['productType'];
      if (row['pageCount']) specs.pageCount = parseInt(row['pageCount']);
      if (row['bindingStyle']) specs.bindingStyle = row['bindingStyle'];
      if (row['coverType']) specs.coverType = row['coverType'];

      // Default productType if not specified
      if (!specs.productType) {
        specs.productType = 'OTHER';
      }

      // Build job object
      const job: any = {
        rowNumber: index + 2,
        title: title,
        customerName: customerName,
        vendorName: vendorName,
        status: status,
        customerPONumber: customerPONumber,
        dueDate: dueDate,
        notes: description,
        specs: Object.keys(specs).length > 0 ? specs : undefined,
        lineItems: [],

        // Store original data for reference
        originalData: {
          jobNo: row['jobNo'] || '',
          sizeName: row['sizeName'] || '',
          paperType: row['paperType'] || '',
          quantity: quantity,
        }
      };

      // Create a single line item from the job data
      const lineItemDescription = [
        row['sizeName'] || '',
        row['paperType'] || '',
        description ? `- ${description.substring(0, 100)}` : ''
      ].filter(Boolean).join(' ');

      job.lineItems.push({
        description: lineItemDescription || 'Print Service',
        quantity: quantity,
        unitCost: unitCost,
        markupPercent: Math.round(markupPercent * 100) / 100,
        unitPrice: unitPrice,
      });

      return job;
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Import Jobs from Excel</h2>
              <p className="text-sm text-gray-600 mt-1">
                Upload an Excel file (.xlsx or .xls) with your job data
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-900">Error</p>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}

            {/* Sheet Selector - show if workbook has multiple sheets */}
            {sheetNames.length > 1 && (
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Select Sheet to Import:
                </label>
                <select
                  value={selectedSheet}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={isProcessing}
                >
                  {sheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-600 mt-2">
                  This file contains {sheetNames.length} sheets. Select the sheet with job data.
                </p>
              </div>
            )}

            {/* Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-300 bg-gray-50'
              }`}
            >
              <FileSpreadsheet className={`w-16 h-16 mx-auto mb-4 ${
                isDragging ? 'text-blue-500' : 'text-gray-400'
              }`} />

              {isProcessing ? (
                <div>
                  <p className="text-lg font-medium text-gray-900 mb-2">Processing...</p>
                  <p className="text-sm text-gray-600">Reading Excel file</p>
                </div>
              ) : (
                <>
                  <p className="text-lg font-medium text-gray-900 mb-2">
                    Drop Excel file here or click to browse
                  </p>
                  <p className="text-sm text-gray-600 mb-4">
                    Supports .xlsx and .xls files
                  </p>

                  <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">
                    <Upload className="w-4 h-4" />
                    Choose File
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={handleFileInput}
                      className="hidden"
                      disabled={isProcessing}
                    />
                  </label>
                </>
              )}
            </div>

            {/* Expected Format Info */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Supported Excel Formats:</h3>
              <div className="text-xs text-gray-600 space-y-2">
                <div>
                  <p className="font-semibold mb-1">Printing Workflow Export Format:</p>
                  <ul className="space-y-0.5 ml-3">
                    <li>• <strong>title</strong>, <strong>customerName</strong>, <strong>vendorName</strong></li>
                    <li>• <strong>status</strong>, <strong>customerPONumber</strong>, <strong>quantity</strong></li>
                    <li>• <strong>customerTotal</strong>, <strong>bradfordTotal</strong> (for pricing)</li>
                    <li>• <strong>sizeName</strong>, <strong>paperType</strong>, <strong>description</strong></li>
                  </ul>
                </div>
                <div className="mt-2">
                  <p className="font-semibold mb-1">Generic Format (also supported):</p>
                  <ul className="space-y-0.5 ml-3">
                    <li>• <strong>Job Title</strong>, <strong>Customer</strong>, <strong>Vendor</strong></li>
                    <li>• <strong>Status</strong>, <strong>Customer PO</strong>, <strong>Quantity</strong></li>
                    <li>• <strong>Cost</strong>, <strong>Price</strong>, <strong>Description</strong></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
