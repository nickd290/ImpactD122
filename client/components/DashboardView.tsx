import React from 'react';
import { Plus, Upload, Sparkles, ArrowRight, Clock, CheckCircle2 } from 'lucide-react';
import { Button } from './ui';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui';
import { Badge } from './ui';

interface Job {
  id: string;
  number: string;
  title: string;
  status: string;
  customer?: { name: string };
  createdAt?: string;
}

interface DashboardViewProps {
  jobs: Job[];
  onCreateJob: () => void;
  onShowSpecParser: () => void;
  onShowPOUploader: () => void;
  onViewAllJobs: () => void;
}

export function DashboardView({
  jobs,
  onCreateJob,
  onShowSpecParser,
  onShowPOUploader,
  onViewAllJobs
}: DashboardViewProps) {
  // Get recent jobs (last 5)
  const recentJobs = jobs.slice(0, 5);

  // Get active jobs (not paid or cancelled)
  const activeJobs = jobs.filter(j => !['PAID', 'CANCELLED'].includes(j.status));

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Welcome back</h1>
        <p className="text-muted-foreground mt-1">
          Here's what's happening with your print brokerage today.
        </p>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Get started with the most common tasks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={onCreateJob}
              size="lg"
              className="h-auto py-6 flex-col gap-2"
            >
              <Plus className="w-6 h-6" />
              <div className="text-center">
                <div className="font-semibold">Create New Job</div>
                <div className="text-xs opacity-90">Start a new print job manually</div>
              </div>
            </Button>

            <Button
              onClick={onShowPOUploader}
              variant="secondary"
              size="lg"
              className="h-auto py-6 flex-col gap-2"
            >
              <Upload className="w-6 h-6" />
              <div className="text-center">
                <div className="font-semibold">Upload Purchase Order</div>
                <div className="text-xs opacity-90">AI will parse your PO automatically</div>
              </div>
            </Button>

            <Button
              onClick={onShowSpecParser}
              variant="secondary"
              size="lg"
              className="h-auto py-6 flex-col gap-2"
            >
              <Sparkles className="w-6 h-6" />
              <div className="text-center">
                <div className="font-semibold">Parse Specifications</div>
                <div className="text-xs opacity-90">Paste specs for AI parsing</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Jobs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Jobs</CardTitle>
                <CardDescription>Your latest print jobs</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onViewAllJobs}
                className="gap-1"
              >
                View all
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {recentJobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No jobs yet</p>
                <p className="text-sm mt-1">Create your first job to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentJobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors cursor-pointer"
                    onClick={onViewAllJobs}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{job.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-sm text-muted-foreground">{job.number}</span>
                        {job.customer && (
                          <>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-sm text-muted-foreground truncate">
                              {job.customer.name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
            <CardDescription>Quick stats at a glance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                    <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Active Jobs</p>
                    <p className="text-sm text-muted-foreground">Currently in progress</p>
                  </div>
                </div>
                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {activeJobs.length}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Total Jobs</p>
                    <p className="text-sm text-muted-foreground">All time</p>
                  </div>
                </div>
                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                  {jobs.length}
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={onViewAllJobs}
              >
                View All Jobs
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const getVariant = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'warning';
      case 'PAID':
        return 'success';
      case 'CANCELLED':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const getLabel = (status: string) => {
    return status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <Badge variant={getVariant(status) as any} className="shrink-0">
      {getLabel(status)}
    </Badge>
  );
}
