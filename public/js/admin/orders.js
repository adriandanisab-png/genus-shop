// Admin › Orders — interim: link to Stripe. A built-in list (via the Worker)
// lands in a later phase.
export async function render(panel) {
  panel.innerHTML = `
  <div class="panel">
    <h3 style="font-family:var(--font-display);font-size:20px;margin-bottom:10px">Orders</h3>
    <p style="color:var(--text-secondary);line-height:var(--leading-relaxed);margin-bottom:18px">
      Paid orders — customer, items, shipping, receipts and refunds — live in your Stripe Dashboard.
      A built-in list here is coming next.
    </p>
    <a class="btn btn--primary" href="https://dashboard.stripe.com/test/payments" target="_blank" rel="noopener">Open Stripe payments →</a>
  </div>`;
}
