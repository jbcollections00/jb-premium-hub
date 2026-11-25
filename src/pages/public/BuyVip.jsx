import { Navigate, useLocation } from 'react-router-dom';

// Legacy manual-payment route retired.
// Keep old bookmarks and PayMongo TEST callbacks working without presenting
// manual bank-transfer details, receipt upload, or ticket submission.
// A redirect never confirms payment or grants membership.
export default function BuyVip() {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const checkout = search.get('checkout');
  const params = new URLSearchParams();

  if (checkout === 'test-return' || checkout === 'test-cancel' ||
      checkout === 'returned' || checkout === 'cancelled') {
    params.set('checkout', checkout);
    const orderId = search.get('order');
    if (orderId && /^[0-9a-f-]{36}$/i.test(orderId)) {
      params.set('order', orderId);
    }
  }

  const query = params.toString();
  return <Navigate to={`/subscribe${query ? `?${query}` : ''}`} replace />;
}
