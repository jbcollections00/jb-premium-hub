// Check if user has VIP-level access or higher
export const isVIP = (accountType) => {
  if (!accountType) return false;
  const role = accountType.toUpperCase();
  return role === 'VIP' || role === 'ADMIN';
};

// Check if user has strict Admin access
export const isAdmin = (accountType) => {
  if (!accountType) return false;
  return accountType.toUpperCase() === 'ADMIN';
};