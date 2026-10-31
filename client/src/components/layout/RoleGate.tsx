import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface RoleGateProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

export const RoleGate: React.FC<RoleGateProps> = ({ allowedRoles, children }) => {
  const { user } = useAuth();

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
