// Admin › Discounts — interim: promo codes are accepted at checkout; create them
// in Stripe for now. In-admin creation lands in a later phase.
export async function render(panel) {
  panel.innerHTML = `
  <div class="panel">
    <h3 style="font-family:var(--font-display);font-size:20px;margin-bottom:10px">Discount codes</h3>
    <p style="color:var(--text-secondary);line-height:var(--leading-relaxed);margin-bottom:18px">
      Customers can enter a promo code on the Stripe checkout page. Create codes in Stripe —
      percent or fixed amount off, expiry, usage limits. Creating them right here is coming next.
    </p>
    <a class="btn btn--primary" href="https://dashboard.stripe.com/test/coupons" target="_blank" rel="noopener">Manage codes in Stripe →</a>
  </div>`;
}
