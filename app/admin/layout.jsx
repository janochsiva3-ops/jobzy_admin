import React from 'react';
import AdminWorkspaceHeader from '@/components/AdminWorkspaceHeader';

export const metadata = {
  title: 'Jobzy Administrator Workspace',
  description: 'Private internal administration console for Jobzy Sri Lanka.'
};

export default function AdminLayout({ children }) {
  return (
    <div
      className="admin-workspace-root"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#F8FAFC'
      }}
    >
      <AdminWorkspaceHeader />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}

