// Copy to config.local.js (git-ignored) and fill in your real details.
// They become the default payment details on every invoice.
window.BLYZE_CONFIG = {
  paymentVersion: "v1", // change this when the details change, so saved data updates once
  payment: [
    "Beneficiary: Your Company LLC",
    "Account number: 000000000000",
    "Account type: Checking",
    "Bank: Your Bank",
    "ABA routing: 000000000",
    "SWIFT / BIC: XXXXXXXX",
  ].join("\n"),
};
