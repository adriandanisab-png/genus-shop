#!/usr/bin/env bash
# Create the 5 Genus Coffee Stripe Payment Links (one per bag) in one go.
#
# Usage:
#   export STRIPE_SECRET_KEY=sk_test_xxx      # TEST mode first (test cards only)
#   bash create-payment-links.sh
#
#   …later, for real sales, rerun with your LIVE key:
#   export STRIPE_SECRET_KEY=sk_live_xxx
#   bash create-payment-links.sh
#
# It prints a  "<product-id>  =>  <payment link URL>"  mapping. Paste those URLs
# into the matching `stripeLink` in public/js/data.js (or send them to Claude).
# The key stays in your shell — this script only sends it to api.stripe.com.
set -euo pipefail

: "${STRIPE_SECRET_KEY:?Set STRIPE_SECRET_KEY first, e.g. export STRIPE_SECRET_KEY=sk_test_...}"

SITE="https://shop-genus-coffee.web.app"   # used for the post-payment redirect
CURRENCY="ron"

# id|Stripe product name|price in whole lei  — keep in sync with public/js/data.js
PRODUCTS=(
  "el-triunfo|Genus Coffee — El Triunfo (Colombia Huila) 250g|79"
  "el-cerro|Genus Coffee — El Cerro (Costa Rica West Valley) 250g|85"
  "guji-uraga|Genus Coffee — Guji Uraga (Ethiopia Guji) 250g|89"
  "masai-aa-top|Genus Coffee — Masai AA Top (Kenya Mount Kenya) 250g|95"
  "simbi-kinazi|Genus Coffee — Simbi Kinazi (Rwanda Huye) 250g|85"
)

# Pull one field out of a Stripe JSON response, or fail loudly on an API error.
extract() { python3 -c "import sys,json; d=json.load(sys.stdin); e=d.get('error'); sys.exit('Stripe error: '+e['message']) if e else print(d['$1'])"; }

mode="LIVE"; case "$STRIPE_SECRET_KEY" in sk_test_*|rk_test_*) mode="TEST";; esac
echo "Creating ${#PRODUCTS[@]} payment links in ${mode} mode (currency: ${CURRENCY})…"
echo
echo "product id      =>  payment link"
echo "--------------------------------"

for row in "${PRODUCTS[@]}"; do
  IFS='|' read -r id name price <<< "$row"
  amount=$(( price * 100 ))   # RON → bani

  price_id=$(curl -s https://api.stripe.com/v1/prices \
    -u "$STRIPE_SECRET_KEY:" \
    -d currency="$CURRENCY" \
    -d unit_amount="$amount" \
    --data-urlencode "product_data[name]=$name" | extract id)

  url=$(curl -s https://api.stripe.com/v1/payment_links \
    -u "$STRIPE_SECRET_KEY:" \
    -d "line_items[0][price]=$price_id" \
    -d "line_items[0][quantity]=1" \
    -d "line_items[0][adjustable_quantity][enabled]=true" \
    -d "shipping_address_collection[allowed_countries][0]=RO" \
    -d "after_completion[type]=redirect" \
    --data-urlencode "after_completion[redirect][url]=$SITE/success.html?id=$id" | extract url)

  printf '%-14s  =>  %s\n' "$id" "$url"
done

echo
echo "Done. Paste each URL into public/js/data.js (stripeLink), then redeploy hosting."
