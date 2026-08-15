// Admin › Subscriptions — interim placeholder. The recurring-delivery flow +
// subscriber list lands in a dedicated phase.
export async function render(panel) {
  panel.innerHTML = `
  <div class="panel">
    <h3 style="font-family:var(--font-display);font-size:20px;margin-bottom:10px">Subscriptions</h3>
    <p style="color:var(--text-secondary);line-height:var(--leading-relaxed);margin-bottom:18px">
      Recurring coffee delivery — subscribe flow, customer portal and a subscriber list —
      is being built in a dedicated update.
    </p>
    <a class="btn btn--secondary" href="https://dashboard.stripe.com/test/subscriptions" target="_blank" rel="noopener">Subscriptions in Stripe →</a>
  </div>`;
}
