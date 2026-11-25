'use client';

import type { ProductInfo } from '../lib/products';

// Free help lines and what actually raises the odds of staying quit.
// Numbers: CDC/NCI 1-800-QUIT-NOW; NCI SmokefreeTXT (QUIT to 47848); Truth Initiative
// "This is Quitting" (DITCHVAPE to 88709); NHS Smokefree helpline; 988 Lifeline.
// Medicines: Cochrane 2023 (Lindson et al., component network meta-analysis).

function Row({ href, title, sub, external }: { href: string; title: string; sub: string; external?: boolean }) {
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="flex items-center gap-3 bg-surface border border-line rounded-xl p-3.5 active:scale-[0.99] transition-transform">
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-ink">{title}</p>
        <p className="text-[12px] text-muted mt-0.5 leading-relaxed">{sub}</p>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-faint flex-shrink-0"><path d="M9 18l6-6-6-6" /></svg>
    </a>
  );
}

export default function SupportSheet({ open, onClose, product }: { open: boolean; onClose: () => void; product: ProductInfo }) {
  const vape = product.unit === 'pod';
  return (
    <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      aria-hidden={!open}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`absolute bottom-0 left-0 right-0 transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-canvas-2 border-t border-line rounded-t-3xl p-6 max-h-[88vh] overflow-y-auto max-w-md mx-auto"
          style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
          <div className="w-10 h-1 bg-line rounded-full mx-auto mb-5" />
          <h3 className="font-display text-base font-semibold text-ink text-center">Support</h3>
          <p className="text-[13px] text-muted text-center mt-1.5 mb-5">Free, confidential, and it works. People who get help are far more likely to stay quit.</p>

          <p className="text-[11px] uppercase tracking-[0.15em] text-muted mb-2">Talk or text (US)</p>
          <div className="space-y-2 mb-5">
            <Row href="tel:18007848669" title="Call 1-800-QUIT-NOW" sub="Free quit coach in your state. Many states also send free patches or gum." />
            {vape ? (
              <Row href="sms:88709?&body=DITCHVAPE" title="Text DITCHVAPE to 88709" sub="This is Quitting: free text program for quitting vaping." />
            ) : (
              <Row href="sms:47848?&body=QUIT" title="Text QUIT to 47848" sub="SmokefreeTXT: daily texts and on-demand help for cravings." />
            )}
            <Row href="https://smokefree.gov" external title="Smokefree.gov" sub="Plans, apps and guides from the US National Cancer Institute." />
          </div>

          <p className="text-[11px] uppercase tracking-[0.15em] text-muted mb-2">Outside the US</p>
          <div className="space-y-2 mb-5">
            <Row href="tel:03001231044" title="UK: NHS Smokefree 0300 123 1044" sub="Free helpline, plus local stop-smoking services." />
            <Row href="https://www.who.int/campaigns/world-no-tobacco-day/2021/quitting-toolkit" external title="Other countries" sub="WHO quitting toolkit with country quitlines." />
          </div>

          <p className="text-[11px] uppercase tracking-[0.15em] text-muted mb-2">Medicines roughly double your chances</p>
          <div className="bg-surface border border-line rounded-xl p-4 mb-5 space-y-2 text-[13px] text-muted leading-relaxed">
            <p><span className="text-ink font-medium">Nicotine replacement</span>: a patch for the steady base plus gum, lozenges or a mouth spray for sudden cravings works better than either alone. These are over the counter, and a pharmacist can help pick a dose.</p>
            <p><span className="text-ink font-medium">Prescription</span>: varenicline is the single most effective option. Bupropion also helps. Ask a doctor.</p>
            <p className="text-[11px] text-faint">Check with a doctor first if you&apos;re pregnant, have a heart condition, or take other medicines. Source: Cochrane review, 2023.</p>
          </div>

          <p className="text-[11px] uppercase tracking-[0.15em] text-muted mb-2">If things feel heavy</p>
          <div className="space-y-2 mb-6">
            <Row href="tel:988" title="Call or text 988" sub="Suicide & Crisis Lifeline (US), 24/7. If your mood drops hard after quitting, reach out." />
          </div>

          <button onClick={onClose}
            className="w-full py-3.5 rounded-xl bg-surface-2 border border-line text-muted text-sm hover:bg-surface transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
