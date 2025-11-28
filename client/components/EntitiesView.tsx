import React, { useState } from 'react';
import { Plus, Edit, Trash2, Users, Building2 } from 'lucide-react';
import { Button } from './ui';
import { Card } from './ui';
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{entityTypeLabelPlural}</h1>
          <p className="text-muted-foreground mt-1">
            Manage your {entityTypeLabelPlural.toLowerCase()} and view their jobs
          </p>
        </div>
        <Button
          onClick={() => onCreateEntity(type === 'CUSTOMER' ? 'customer' : 'vendor')}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add {entityTypeLabel}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Contact Person
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Phone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  # Jobs
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {entities.map((entity: any) => (
                <tr key={entity.id} className="hover:bg-accent/50 cursor-pointer transition-colors">
                  <td
                    onClick={() => handleRowClick(entity)}
                    className="px-6 py-4 whitespace-nowrap"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{entity.name}</span>
                      {entity.isPartner && (
                        <span className="px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded">
                          Partner
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    onClick={() => handleRowClick(entity)}
                    className="px-6 py-4 whitespace-nowrap text-sm text-foreground"
                  >
                    {entity.contactPerson}
                  </td>
                  <td
                    onClick={() => handleRowClick(entity)}
                    className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground"
                  >
                    {entity.email}
                  </td>
                  <td
                    onClick={() => handleRowClick(entity)}
                    className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground"
                  >
                    {entity.phone}
                  </td>
                  <td
                    onClick={() => handleRowClick(entity)}
                    className="px-6 py-4 whitespace-nowrap text-sm text-foreground"
                  >
                    {getJobCount(entity.id)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditEntity(entity);
                        }}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={`Edit ${entityTypeLabel}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteEntity(entity);
                        }}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        title={`Delete ${entityTypeLabel}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {entities.length === 0 && (
            <div className="p-12 text-center">
              <div className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50">
                {type === 'CUSTOMER' ? (
                  <Users className="w-full h-full" />
                ) : (
                  <Building2 className="w-full h-full" />
                )}
              </div>
              <h3 className="text-lg font-medium text-foreground mb-1">
                No {entityTypeLabelPlural.toLowerCase()} yet
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Get started by adding your first {entityTypeLabel.toLowerCase()}
              </p>
              <Button
                onClick={() => onCreateEntity(type === 'CUSTOMER' ? 'customer' : 'vendor')}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Your First {entityTypeLabel}
              </Button>
            </div>
          )}
        </div>
      </Card>

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
