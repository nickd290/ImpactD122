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
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{entityTypeLabelPlural}</h1>
          <p className="text-sm text-muted-foreground">
            Manage your {entityTypeLabelPlural.toLowerCase()} and view their jobs
          </p>
        </div>
        <Button size="sm" onClick={() => onCreateEntity(type === 'CUSTOMER' ? 'customer' : 'vendor')}>
          <Plus className="w-4 h-4 mr-1" />
          Add {entityTypeLabel}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Contact</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Email</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Phone</th>
                <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Jobs</th>
                <th className="px-4 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {entities.map((entity: any, index: number) => {
                const jobCount = getJobCount(entity.id);
                return (
                  <tr
                    key={entity.id}
                    className={`group hover:bg-accent/50 cursor-pointer transition-colors ${index % 2 === 0 ? 'bg-card' : 'bg-muted/10'}`}
                  >
                    <td onClick={() => handleRowClick(entity)} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{entity.name}</span>
                        {entity.isPartner && (
                          <span className="px-1.5 py-0.5 text-[10px] bg-primary text-primary-foreground rounded font-medium">Partner</span>
                        )}
                      </div>
                    </td>
                    <td onClick={() => handleRowClick(entity)} className="px-4 py-3 text-sm text-muted-foreground">
                      {entity.contactPerson || '—'}
                    </td>
                    <td onClick={() => handleRowClick(entity)} className="px-4 py-3 text-sm text-muted-foreground">
                      {entity.email || '—'}
                    </td>
                    <td onClick={() => handleRowClick(entity)} className="px-4 py-3 text-sm text-muted-foreground">
                      {entity.phone || '—'}
                    </td>
                    <td onClick={() => handleRowClick(entity)} className="px-4 py-3 text-center">
                      <span className={`text-sm font-medium ${jobCount > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {jobCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button onClick={(e) => { e.stopPropagation(); onEditEntity(entity); }} variant="ghost" size="icon" className="h-7 w-7">
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button onClick={(e) => { e.stopPropagation(); onDeleteEntity(entity); }} variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
