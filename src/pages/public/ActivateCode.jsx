import { Navigate } from "react-router-dom";

// Legacy code activation is disabled. Membership comes only from verified LIVE PayMongo entitlements.
export default function ActivateCode() {
  return <Navigate to="/subscribe" replace />;
}
