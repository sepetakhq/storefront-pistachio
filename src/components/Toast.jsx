import { useToastMessage } from '@sepetakhq/storefront-kit/ui/ToastProvider';

export default function Toast() {
  const message = useToastMessage();
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'var(--pc-ink)',
        color: 'var(--pc-white)',
        borderRadius: 8,
        padding: '12px 26px',
        fontWeight: 700,
        fontSize: 14,
        zIndex: 200,
        boxShadow: '0 10px 30px var(--pc-veil-dark)',
      }}
    >
      {message}
    </div>
  );
}
