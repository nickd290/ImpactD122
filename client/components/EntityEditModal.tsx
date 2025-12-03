import React, { useState, useEffect } from 'react';
import { X, Building2, Users, Plus, Trash2, Star } from 'lucide-react';
import { Entity, EntityType, Contact } from '../types';

interface EntityEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (id: string, data: UpdateEntityData) => void;
  entity: Entity | null;
  isSaving?: boolean;
}

export interface UpdateEntityData {
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  isPartner?: boolean;
  contacts?: { name: string; email: string; title?: string; isPrimary?: boolean }[];
}

export default function EntityEditModal({
  isOpen,
  onClose,
  onSubmit,
  entity,
  isSaving = false
}: EntityEditModalProps) {
  const [formData, setFormData] = useState<UpdateEntityData>({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    notes: '',
    isPartner: false
  });

  const [contacts, setContacts] = useState<{ name: string; email: string; title?: string; isPrimary?: boolean }[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof UpdateEntityData, string>>>({});

  useEffect(() => {
    if (entity && isOpen) {
      setFormData({
        name: entity.name,
        contactPerson: entity.contactPerson,
        email: entity.email,
        phone: entity.phone,
        address: entity.address || '',
        notes: entity.notes || '',
        isPartner: entity.isPartner || false
      });
      // Initialize contacts for vendors
      if (entity.type === EntityType.VENDOR && entity.contacts) {
        setContacts(entity.contacts.map(c => ({
          name: c.name,
          email: c.email,
          title: c.title || '',
          isPrimary: c.isPrimary || false
        })));
      } else {
        setContacts([]);
      }
      setErrors({});
    }
  }, [entity, isOpen]);

  if (!isOpen || !entity) return null;

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof UpdateEntityData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Company name is required';
    }

    if (!formData.contactPerson.trim()) {
      newErrors.contactPerson = 'Contact person is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      const submitData = { ...formData };
      // Include contacts for vendors
      if (entity.type === EntityType.VENDOR) {
        submitData.contacts = contacts;
      }
      onSubmit(entity.id, submitData);
    }
  };

  const addContact = () => {
    setContacts([...contacts, { name: '', email: '', title: '', isPrimary: false }]);
  };

  const removeContact = (index: number) => {
    setContacts(contacts.filter((_, i) => i !== index));
  };

  const updateContact = (index: number, field: string, value: string | boolean) => {
    const newContacts = [...contacts];
    newContacts[index] = { ...newContacts[index], [field]: value };
    // If setting isPrimary to true, set all others to false
    if (field === 'isPrimary' && value === true) {
      newContacts.forEach((c, i) => {
        if (i !== index) c.isPrimary = false;
      });
    }
    setContacts(newContacts);
  };

  const handleClose = () => {
    setErrors({});
    onClose();
  };

  const Icon = entity.type === EntityType.CUSTOMER ? Users : Building2;
  const title = entity.type === EntityType.CUSTOMER ? 'Edit Customer' : 'Edit Vendor';
  const entityTypeLabel = entity.type === EntityType.CUSTOMER ? 'customer' : 'vendor';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${entity.type === EntityType.CUSTOMER ? 'bg-blue-100' : 'bg-red-100'}`}>
              <Icon className={`w-6 h-6 ${entity.type === EntityType.CUSTOMER ? 'text-blue-600' : 'text-impact-red'}`} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{title}</h2>
              <p className="text-sm text-gray-500 mt-0.5">ID: {entity.id}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={isSaving}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-5">
            {/* Company Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., Acme Corporation"
                disabled={isSaving}
              />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
            </div>

            {/* Contact Person */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Person <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.contactPerson}
                onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.contactPerson ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., John Smith"
                disabled={isSaving}
              />
              {errors.contactPerson && <p className="mt-1 text-sm text-red-600">{errors.contactPerson}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.email ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., john@acme.com"
                disabled={isSaving}
              />
              {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.phone ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., (555) 123-4567"
                disabled={isSaving}
              />
              {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone}</p>}
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., 123 Main St, City, State ZIP"
                disabled={isSaving}
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Additional notes..."
                rows={3}
                disabled={isSaving}
              />
            </div>

            {/* Partner Toggle (Vendors Only) */}
            {entity.type === EntityType.VENDOR && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isPartner || false}
                    onChange={(e) => setFormData({ ...formData, isPartner: e.target.checked })}
                    className="w-4 h-4 text-impact-red border-gray-300 rounded focus:ring-impact-red"
                    disabled={isSaving}
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900">Partner Vendor</span>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Mark as a trusted partner (e.g., Bradford Commercial Printing)
                    </p>
                  </div>
                </label>
              </div>
            )}

            {/* Vendor Contacts Section */}
            {entity.type === EntityType.VENDOR && (
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900">Contacts / CSRs</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Add multiple contacts for this vendor</p>
                  </div>
                  <button
                    type="button"
                    onClick={addContact}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-impact-red text-white rounded-lg hover:bg-impact-orange transition-colors"
                    disabled={isSaving}
                  >
                    <Plus className="w-4 h-4" />
                    Add Contact
                  </button>
                </div>

                {contacts.length === 0 ? (
                  <p className="text-sm text-gray-500 italic text-center py-4">
                    No contacts added yet. Click "Add Contact" to add CSRs for this vendor.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {contacts.map((contact, index) => (
                      <div key={index} className="bg-gray-50 rounded-lg p-4 relative">
                        <button
                          type="button"
                          onClick={() => removeContact(index)}
                          className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-600 transition-colors"
                          disabled={isSaving}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                            <input
                              type="text"
                              value={contact.name}
                              onChange={(e) => updateContact(index, 'name', e.target.value)}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-impact-red focus:border-transparent"
                              placeholder="Contact name"
                              disabled={isSaving}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                            <input
                              type="email"
                              value={contact.email}
                              onChange={(e) => updateContact(index, 'email', e.target.value)}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-impact-red focus:border-transparent"
                              placeholder="email@example.com"
                              disabled={isSaving}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Title/Role</label>
                            <input
                              type="text"
                              value={contact.title || ''}
                              onChange={(e) => updateContact(index, 'title', e.target.value)}
                              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-impact-red focus:border-transparent"
                              placeholder="e.g., CSR, Account Manager"
                              disabled={isSaving}
                            />
                          </div>
                          <div className="flex items-end">
                            <label className="flex items-center gap-2 cursor-pointer pb-1.5">
                              <input
                                type="checkbox"
                                checked={contact.isPrimary || false}
                                onChange={(e) => updateContact(index, 'isPrimary', e.target.checked)}
                                className="w-4 h-4 text-impact-red border-gray-300 rounded focus:ring-impact-red"
                                disabled={isSaving}
                              />
                              <Star className={`w-4 h-4 ${contact.isPrimary ? 'text-yellow-500 fill-yellow-500' : 'text-gray-400'}`} />
                              <span className="text-xs font-medium text-gray-600">Primary Contact</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`px-4 py-2 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                entity.type === EntityType.CUSTOMER
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-impact-red hover:bg-impact-orange'
              }`}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                `Save Changes`
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
