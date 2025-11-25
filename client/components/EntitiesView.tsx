import React, { useState } from 'react';
import { Plus, Edit, Trash2, Users, Building2 } from 'lucide-react';
import { EntityJobsDrawer } from './EntityJobsDrawer';

interface EntitiesViewProps {
  entities: any[];
  type: 'CUSTOMER' | 'VENDOR';
  jobs: any[];
  onCreateEntity: (type: 'customer' | 'vendor') => void;
  onEditEntity: (entity: any) => void;
  onDeleteEntity: (entity: any) => void;
  onRefresh: () => void;
  onJobClick?: (job: any) => void;
}

export function EntitiesView({
  entities,
  type,
  jobs,
  onCreateEntity,
  onEditEntity,
  onDeleteEntity,
  onJobClick,
  onRefresh,
}: EntitiesViewProps) {
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const entityTypeLabel = type === 'CUSTOMER' ? 'Customer' : 'Vendor';
  const entityTypeLabelPlural = type === 'CUSTOMER' ? 'Customers' : 'Vendors';
  const iconColor = type === 'CUSTOMER' ? 'blue' : 'orange';

  // Calculate job count per entity
  const getJobCount = (entityId: string) => {
    if (type === 'CUSTOMER') {
      return jobs.filter((j: any) => j.customerId === entityId).length;
    } else {
      return jobs.filter((j: any) => j.vendorId === entityId).length;
    }
  };

  // Get jobs for entity
  const getEntityJobs = (entityId: string) => {
    if (type === 'CUSTOMER') {
      return jobs.filter((j: any) => j.customerId === entityId);
    } else {
      return jobs.filter((j: any) => j.vendorId === entityId);
    }
  };

  const handleRowClick = (entity: any) => {
    setSelectedEntity(entity);
    setIsDrawerOpen(true);
  };

  const handleJobClick = (job: any) => {
    setIsDrawerOpen(false);
    if (onJobClick) {
      onJobClick(job);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-gray-900">{entityTypeLabelPlural}</h2>
        <button
          onClick={() => onCreateEntity(type === 'CUSTOMER' ? 'customer' : 'vendor')}
          className={`flex items-center space-x-2 ${type === 'CUSTOMER' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'} text-white px-4 py-2 rounded-lg transition-colors`}
        >
          <Plus className="w-5 h-5" />
          <span>Add {entityTypeLabel}</span>
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact Person
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  # Jobs
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {entities.map((entity: any) => (
                <tr key={entity.id} className="hover:bg-gray-50 cursor-pointer transition-colors">
                  <td
                    onClick={() => handleRowClick(entity)}
                    className="px-6 py-4 whitespace-nowrap"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{entity.name}</span>
                      {entity.isPartner && (
                        <span className="px-2 py-0.5 text-xs bg-impact-orange text-white rounded">
                          Partner
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    onClick={() => handleRowClick(entity)}
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                  >
                    {entity.contactPerson}
                  </td>
                  <td
                    onClick={() => handleRowClick(entity)}
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-600"
                  >
                    {entity.email}
                  </td>
                  <td
                    onClick={() => handleRowClick(entity)}
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-600"
                  >
                    {entity.phone}
                  </td>
                  <td
                    onClick={() => handleRowClick(entity)}
                    className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                  >
                    {getJobCount(entity.id)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditEntity(entity);
                        }}
                        className={`p-1.5 ${type === 'CUSTOMER' ? 'text-blue-600 hover:bg-blue-50' : 'text-orange-600 hover:bg-orange-50'} rounded transition-colors`}
                        title={`Edit ${entityTypeLabel}`}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteEntity(entity);
                        }}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title={`Delete ${entityTypeLabel}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {entities.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              <div className="w-12 h-12 mx-auto mb-3 text-gray-300">
                {type === 'CUSTOMER' ? (
                  <Users className="w-full h-full" />
                ) : (
                  <Building2 className="w-full h-full" />
                )}
              </div>
              <p>No {entityTypeLabelPlural.toLowerCase()} found</p>
              <button
                onClick={() => onCreateEntity(type === 'CUSTOMER' ? 'customer' : 'vendor')}
                className={`mt-4 flex items-center gap-2 mx-auto px-4 py-2 ${type === 'CUSTOMER' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'} text-white rounded-lg transition-colors`}
              >
                <Plus className="w-4 h-4" />
                <span>Add Your First {entityTypeLabel}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Entity Jobs Drawer */}
      {selectedEntity && (
        <EntityJobsDrawer
          isOpen={isDrawerOpen}
          onClose={() => {
            setIsDrawerOpen(false);
            setSelectedEntity(null);
          }}
          entity={selectedEntity}
          jobs={getEntityJobs(selectedEntity.id)}
          type={type}
          onJobClick={handleJobClick}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
