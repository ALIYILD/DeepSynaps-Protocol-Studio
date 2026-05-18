/**
 * ConfirmModal — React component replacing window.confirm() calls.
 * Provides a styled, accessible confirmation dialog for protocol off-label acknowledgements
 * and other critical user actions.
 */
import React, { useState } from 'react';

export function ConfirmModal({ 
  isOpen = false, 
  title = 'Confirm', 
  message = '', 
  onConfirm = () => {}, 
  onCancel = () => {},
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDangerous = false,
}) {
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      await onConfirm();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    if (!isProcessing) {
      onCancel();
    }
  };

  // Allow ESC key to cancel
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !isProcessing) {
        handleCancel();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, isProcessing]);

  return (
    <>
      {/* Modal backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          backdropFilter: 'blur(4px)',
        }}
        onClick={handleCancel}
      >
        {/* Modal dialog */}
        <div
          style={{
            backgroundColor: 'var(--bg-card, white)',
            borderRadius: '8px',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.2)',
            border: '1px solid var(--border, #e5e7eb)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Title */}
          <h2
            style={{
              margin: '0 0 12px 0',
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--text-primary, black)',
            }}
          >
            {title}
          </h2>

          {/* Message */}
          <p
            style={{
              margin: '0 0 20px 0',
              fontSize: '14px',
              color: 'var(--text-secondary, #666)',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
            }}
          >
            {message}
          </p>

          {/* Buttons */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
            }}
          >
            <button
              onClick={handleCancel}
              disabled={isProcessing}
              style={{
                padding: '8px 16px',
                borderRadius: '4px',
                border: '1px solid var(--border, #d1d5db)',
                backgroundColor: 'var(--bg-secondary, #f3f4f6)',
                color: 'var(--text-primary, black)',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                opacity: isProcessing ? 0.6 : 1,
                fontSize: '14px',
                fontWeight: 500,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!isProcessing) {
                  e.target.style.backgroundColor = 'var(--bg-tertiary, #e5e7eb)';
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'var(--bg-secondary, #f3f4f6)';
              }}
            >
              {cancelText}
            </button>
            <button
              onClick={handleConfirm}
              disabled={isProcessing}
              style={{
                padding: '8px 16px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: isDangerous ? 'var(--red, #ef4444)' : 'var(--teal, #06b6d4)',
                color: 'white',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                opacity: isProcessing ? 0.6 : 1,
                fontSize: '14px',
                fontWeight: 500,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!isProcessing) {
                  const color = isDangerous ? 'var(--red-dark, #dc2626)' : 'var(--teal-dark, #0891b2)';
                  e.target.style.backgroundColor = color;
                }
              }}
              onMouseLeave={(e) => {
                const color = isDangerous ? 'var(--red, #ef4444)' : 'var(--teal, #06b6d4)';
                e.target.style.backgroundColor = color;
              }}
            >
              {isProcessing ? 'Processing...' : confirmText}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
