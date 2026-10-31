import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { RoleGate } from './components/layout/RoleGate';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { NewRequest } from './pages/NewRequest';
import { Requests } from './pages/Requests';
import { RunTrace } from './pages/RunTrace';
import { Approvals } from './pages/Approvals';
import { Vendors } from './pages/Vendors';
import { Audit } from './pages/Audit';
import { NotFound } from './pages/NotFound';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />
  },
  {
    path: '/register',
    element: <Register />
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: '/',
            element: <Dashboard />
          },
          {
            path: '/dashboard',
            element: <Dashboard />
          },
          {
            path: '/requests/new',
            element: (
              <RoleGate allowedRoles={['employee', 'manager']}>
                <NewRequest />
              </RoleGate>
            )
          },
          {
            path: '/requests',
            element: <Requests />
          },
          {
            path: '/runs/:id',
            element: <RunTrace />
          },
          {
            path: '/approvals',
            element: (
              <RoleGate allowedRoles={['manager', 'finance']}>
                <Approvals />
              </RoleGate>
            )
          },
          {
            path: '/vendors',
            element: <Vendors />
          },
          {
            path: '/audit',
            element: (
              <RoleGate allowedRoles={['manager', 'finance']}>
                <Audit />
              </RoleGate>
            )
          }
        ]
      }
    ]
  },
  {
    path: '*',
    element: <NotFound />
  }
]);
