# Blyze Labs Invoice Generator

A tiny, dependency-free invoice generator for Blyze Labs consulting. You fill in a form and the invoice preview updates as you type. **Download PDF** exports a clean A4 PDF with the file name `Invoice - PREFIX-0001.pdf`.

## Use it

Open `index.html` in a browser. There is no build step and no server. You can also host it on GitHub Pages.

When opened as a file or a regular website, **Download PDF** uses the print dialog: choose "Save as PDF" in the print dialog. Set margins to *None* and turn on *Background graphics* if your browser doesn't do that already.

Inside a claude.ai artifact, printing is blocked, so the app builds the PDF itself (html2canvas + jsPDF from cdnjs) and saves it through the artifact downloads API.

## Features

- Invoice numbers per client prefix (`APLOS-0011` → `APLOS-0012`), counted automatically
- Payment terms (on receipt / Net 15/30/45/60) that fill in the due date
- Multiple line items, with tax % per line, a discount and partial payments (shows a balance due)
- Client templates: several per client (line items, currency, terms, payment details); "New from template" gives the next number and today's date. Comes with an Aplos Software, LLC "Data Foundations" template
- Client selector in the top bar: filters templates and saved invoices, and "New invoice" uses that client
- History view: total invoiced, invoiced this year, outstanding and overdue, a per-client summary, and every invoice with status (Open, Overdue, Paid) and Mark paid
- Saved clients and saved invoices, stored in this browser's `localStorage`
- Your business details are remembered for every new invoice
- Export and import a JSON backup to move your data between devices
- Several currencies (USD, EUR, GBP, CAD, ARS)

## Files

- `index.html`: the form and the layout
- `styles.css`: the app and invoice design, plus print styles
- `app.js`: state, totals, storage and rendering
- `assets/logo.png`: the Blyze Labs logo

## Private settings (bank details)

Default payment details live in `config.local.js`. That file is git-ignored, so account numbers never reach this public repository. Copy `config.example.js` to `config.local.js` and fill it in. When the details change, bump `paymentVersion` so saved invoices and templates update once.
