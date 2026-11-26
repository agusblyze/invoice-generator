/* Blyze Labs Invoice Generator — no build step, data lives in localStorage. */
(() => {
  "use strict";

  const KEYS = { invoices: "blyze.invoices", clients: "blyze.clients", from: "blyze.from", current: "blyze.current" };

  const DEFAULT_FROM = {
    company: "Blyze Labs LLC",
    contact: "Agustin",
    address: "251 Little Falls Drive\nWilmington, DE 19808\nUnited States of America",
    email: "agus@blyzelabs.co",
    website: "blyzelabs.co",
    taxId: "",
  };

  const SAMPLE_CLIENT = {
    prefix: "APLOS",
    company: "Aplos Software, LLC",
    contact: "Gabriela Henriques",
    address: "8839 N Cedar Ave B-4 #5007\nFresno, CA 93720\nUnited States of America",
    email: "finance@aplos.com",
    taxId: "",
  };

  // ---------- storage ----------
  const load = (k, fallback) => {
    try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fallback; } catch { return fallback; }
  };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  let invoices = load(KEYS.invoices, {});
  let clients = load(KEYS.clients, [SAMPLE_CLIENT]);
  let from = load(KEYS.from, DEFAULT_FROM);
  let inv;

  // ---------- helpers ----------
  const $ = (s, el = document) => el.querySelector(s);
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (iso, n) => {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + Number(n));
    return d.toISOString().slice(0, 10);
  };
  const fmtDate = (iso) => {
    if (!iso) return "—";
    return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  };
  const money = (n, ccy) => {
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD" }).format(n || 0); }
    catch { return `${ccy} ${(n || 0).toFixed(2)}`; }
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => (isFinite(parseFloat(v)) ? parseFloat(v) : 0);
  const invNo = (i) => `${i.prefix ? i.prefix + "-" : ""}${String(i.number || 1).padStart(4, "0")}`;
  const ccyName = { USD: "US dollars", EUR: "euros", GBP: "British pounds", CAD: "Canadian dollars", ARS: "Argentine pesos" };

  const toast = (msg) => {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  };

  const nextNumber = (prefix) => {
    const nums = Object.values(invoices).filter((i) => (i.prefix || "") === (prefix || "")).map((i) => num(i.number));
    return nums.length ? Math.max(...nums) + 1 : 1;
  };

  const blankInvoice = (client = clients[0] || SAMPLE_CLIENT) => {
    const issueDate = today();
    const prefix = client.prefix || "";
    return {
      id: uid(),
      prefix,
      number: nextNumber(prefix),
      currency: "USD",
      issueDate,
      terms: "30",
      dueDate: addDays(issueDate, 30),
      reference: "",
      to: { company: client.company, contact: client.contact, address: client.address, email: client.email, taxId: client.taxId || "" },
      from: { ...from },
      items: [{ name: "", desc: "", qty: 1, rate: 0, tax: 0 }],
      discount: 0,
      paid: 0,
      notes: "Thank you for the partnership. Please reach out with any questions about this invoice.",
      payment: "",
      termsText: "Payment due by the date above. Invoiced in USD.",
    };
  };

  const sampleInvoice = () => ({
    ...blankInvoice(SAMPLE_CLIENT),
    number: 11,
    issueDate: "2026-11-02",
    terms: "custom",
    dueDate: "2026-12-17",
    items: [{ name: "Aplos Data Foundations", desc: "Aplos Data Analytics Foundational Layer", qty: 1, rate: 8500, tax: 0 }],
  });

  // ---------- calculations ----------
  const totals = (i) => {
    const d = Math.min(Math.max(num(i.discount), 0), 100) / 100;
    let subtotal = 0, tax = 0;
    i.items.forEach((it) => {
      const line = num(it.qty) * num(it.rate);
      subtotal += line;
      tax += line * (1 - d) * (num(it.tax) / 100);
    });
    const discount = subtotal * d;
    const total = subtotal - discount + tax;
    const paid = num(i.paid);
    return { subtotal, discount, tax, total, paid, due: total - paid };
  };

  // ---------- form <-> state ----------
  const form = $("#editor");
  const getPath = (o, p) => p.split(".").reduce((a, k) => (a ? a[k] : undefined), o);
  const setPath = (o, p, v) => {
    const ks = p.split(".");
    const last = ks.pop();
    ks.reduce((a, k) => (a[k] ??= {}), o)[last] = v;
  };

  const fillForm = () => {
    form.querySelectorAll("[name]").forEach((el) => {
      const v = getPath(inv, el.name);
      el.value = v ?? "";
    });
    renderItems();
  };

  const renderItems = () => {
    const box = $("#items");
    box.innerHTML = inv.items.map((it, idx) => `
      <div class="item" data-idx="${idx}">
        <button type="button" class="remove" title="Remove" data-remove="${idx}">×</button>
        <label>Service<input data-f="name" value="${esc(it.name)}" placeholder="e.g. Data Foundations" /></label>
        <label>Description<textarea data-f="desc" rows="2" placeholder="What was delivered">${esc(it.desc)}</textarea></label>
        <div class="grid g4">
          <label>Qty / hrs<input data-f="qty" type="number" step="0.01" min="0" value="${esc(it.qty)}" /></label>
          <label>Unit price<input data-f="rate" type="number" step="0.01" min="0" value="${esc(it.rate)}" /></label>
          <label>Tax %<input data-f="tax" type="number" step="0.01" min="0" value="${esc(it.tax)}" /></label>
        </div>
      </div>`).join("");
  };

  form.addEventListener("input", (e) => {
    const el = e.target;
    const item = el.closest(".item");
    if (item && el.dataset.f) {
      const it = inv.items[item.dataset.idx];
      it[el.dataset.f] = el.value;
    } else if (el.name) {
      setPath(inv, el.name, el.value);
      if (el.name === "issueDate" || el.name === "terms") {
        if (inv.terms !== "custom" && inv.issueDate) {
          inv.dueDate = addDays(inv.issueDate, inv.terms);
          form.elements.dueDate.value = inv.dueDate;
        }
      }
      if (el.name === "dueDate") { inv.terms = "custom"; form.elements.terms.value = "custom"; }
      if (el.name === "prefix" && !invoices[inv.id]) {
        inv.number = nextNumber(inv.prefix);
        form.elements.number.value = inv.number;
      }
      if (el.name.startsWith("from.")) { from = { ...inv.from }; save(KEYS.from, from); }
      if (el.name === "currency") {
        inv.termsText = inv.termsText.replace(/Invoiced in [A-Z]{3}\b/, `Invoiced in ${inv.currency}`);
        form.elements.termsText.value = inv.termsText;
      }
    }
    autosave();
    render();
  });

  $("#items").addEventListener("click", (e) => {
    const i = e.target.dataset.remove;
    if (i === undefined) return;
    inv.items.splice(Number(i), 1);
    if (!inv.items.length) inv.items.push({ name: "", desc: "", qty: 1, rate: 0, tax: 0 });
    renderItems(); autosave(); render();
  });
  $("#btn-add-item").onclick = () => {
    inv.items.push({ name: "", desc: "", qty: 1, rate: 0, tax: 0 });
    renderItems(); render();
    $("#items .item:last-child input").focus();
  };

  // ---------- clients ----------
  const renderClients = () => {
    $("#client-picker").innerHTML =
      `<option value="">Saved clients…</option>` +
      clients.map((c, i) => `<option value="${i}">${esc(c.company)}</option>`).join("");
  };
  $("#client-picker").onchange = (e) => {
    const c = clients[e.target.value];
    e.target.value = "";
    if (!c) return;
    inv.to = { company: c.company, contact: c.contact, address: c.address, email: c.email, taxId: c.taxId || "" };
    if (!invoices[inv.id] && c.prefix) { inv.prefix = c.prefix; inv.number = nextNumber(c.prefix); }
    fillForm(); render();
  };
  $("#btn-save-client").onclick = () => {
    if (!inv.to.company) return toast("Add a company name first");
    const c = { ...inv.to, prefix: inv.prefix };
    const idx = clients.findIndex((x) => x.company.toLowerCase() === c.company.toLowerCase());
    if (idx >= 0) clients[idx] = c; else clients.push(c);
    save(KEYS.clients, clients); renderClients();
    toast(`Saved client “${c.company}”`);
  };

  // ---------- invoices history ----------
  const renderHistory = () => {
    const list = Object.values(invoices).sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || "") || b.number - a.number);
    $("#history").innerHTML =
      `<option value="">${list.length ? "Open saved invoice…" : "No saved invoices"}</option>` +
      list.map((i) => `<option value="${i.id}" ${i.id === inv.id ? "selected" : ""}>${esc(invNo(i))} · ${esc(i.to.company)} · ${money(totals(i).total, i.currency)}</option>`).join("");
  };
  $("#history").onchange = (e) => {
    if (!invoices[e.target.value]) return;
    inv = structuredClone(invoices[e.target.value]);
    localStorage.setItem(KEYS.current, inv.id);
    fillForm(); render(); renderHistory();
  };

  const persist = () => {
    invoices[inv.id] = structuredClone(inv);
    save(KEYS.invoices, invoices);
    localStorage.setItem(KEYS.current, inv.id);
    renderHistory();
  };
  let saveTimer;
  const autosave = () => {
    if (!invoices[inv.id]) return; // only autosave invoices that were explicitly saved once
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  };

  $("#btn-save").onclick = () => { persist(); toast(`Saved ${invNo(inv)}`); };
  $("#btn-new").onclick = () => {
    const client = clients.find((c) => c.company === inv.to.company) || clients[0];
    inv = blankInvoice(client);
    inv.currency = invoices[localStorage.getItem(KEYS.current)]?.currency || "USD";
    fillForm(); render(); renderHistory();
    toast("New invoice");
  };
  $("#btn-delete").onclick = () => {
    if (!invoices[inv.id]) return toast("This invoice isn't saved yet");
    if (!confirm(`Delete ${invNo(inv)}? This can't be undone.`)) return;
    delete invoices[inv.id]; save(KEYS.invoices, invoices);
    inv = blankInvoice(); fillForm(); render(); renderHistory();
    toast("Deleted");
  };

  $("#btn-pdf").onclick = () => {
    if (!invoices[inv.id]) persist();
    const prev = document.title;
    document.title = `Invoice - ${invNo(inv)}`;
    window.print();
    setTimeout(() => (document.title = prev), 500);
  };

  // ---------- backup ----------
  $("#btn-export").onclick = () => {
    const blob = new Blob([JSON.stringify({ invoices, clients, from }, null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `blyze-invoices-${today()}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  };
  $("#import-file").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      invoices = { ...invoices, ...(data.invoices || {}) };
      clients = data.clients || clients;
      from = data.from || from;
      save(KEYS.invoices, invoices); save(KEYS.clients, clients); save(KEYS.from, from);
      renderClients(); renderHistory(); toast("Backup imported");
    } catch { toast("Couldn't read that file"); }
    e.target.value = "";
  };

  // ---------- render the document ----------
  const render = () => {
    const t = totals(inv);
    const c = inv.currency;
    const f = inv.from, to = inv.to;
    const hasTax = inv.items.some((it) => num(it.tax) > 0);
    const line = (k, v) => `<div class="line"><span>${k}</span><span>${v}</span></div>`;
    const contactLines = (p) => [p.contact, p.address].filter(Boolean).map(esc).join("\n");

    $("#invoice").innerHTML = `
      <div class="inv-accent"></div>
      <div class="inv-body">
        <div class="inv-head">
          <div class="inv-logo">
            <img src="assets/logo.png" alt="Blyze Labs" />
            <div><div class="co">${esc(f.company)}</div>${f.website ? `<div class="web">${esc(f.website)}</div>` : ""}</div>
          </div>
          <div class="inv-title"><div class="label">Invoice</div><div class="num">${esc(invNo(inv))}</div></div>
        </div>

        <div class="inv-meta">
          <div><div class="k">Issued</div><div class="v">${fmtDate(inv.issueDate)}</div></div>
          <div><div class="k">Due</div><div class="v">${fmtDate(inv.dueDate)}</div></div>
          <div><div class="k">Terms</div><div class="v">${inv.terms === "custom" ? "Custom" : inv.terms === "0" ? "On receipt" : "Net " + inv.terms}</div></div>
          <div><div class="k">Amount due</div><div class="v">${money(t.due, c)}</div></div>
        </div>

        <div class="inv-parties">
          <div>
            <div class="k">From</div>
            <div class="name">${esc(f.company)}</div>
            <div class="muted">${contactLines(f)}</div>
            ${f.email ? `<div class="muted">${esc(f.email)}</div>` : ""}
            ${f.taxId ? `<div class="muted">Tax ID: ${esc(f.taxId)}</div>` : ""}
          </div>
          <div>
            <div class="k">Bill to</div>
            <div class="name">${esc(to.company) || "—"}</div>
            <div class="muted">${contactLines(to)}</div>
            ${to.email ? `<div class="muted">${esc(to.email)}</div>` : ""}
            ${to.taxId ? `<div class="muted">Tax ID: ${esc(to.taxId)}</div>` : ""}
          </div>
        </div>

        ${inv.reference ? `<div class="inv-ref">Project: <b>${esc(inv.reference)}</b></div>` : ""}

        <table class="inv-items">
          <thead><tr>
            <th style="width:52%">Description</th>
            <th class="c">Qty</th>
            <th class="r">Unit price</th>
            ${hasTax ? `<th class="r">Tax</th>` : ""}
            <th class="r">Amount</th>
          </tr></thead>
          <tbody>
            ${inv.items.map((it) => `
              <tr>
                <td><div class="t">${esc(it.name) || "&nbsp;"}</div>${it.desc ? `<div class="d">${esc(it.desc)}</div>` : ""}</td>
                <td class="c">${num(it.qty).toLocaleString("en-US")}</td>
                <td class="r">${money(num(it.rate), c)}</td>
                ${hasTax ? `<td class="r">${num(it.tax) ? num(it.tax) + "%" : "—"}</td>` : ""}
                <td class="r amt">${money(num(it.qty) * num(it.rate), c)}</td>
              </tr>`).join("")}
          </tbody>
        </table>

        <div class="inv-bottom">
          <div>
            ${inv.notes ? `<div class="inv-block"><div class="k">Notes</div><div class="v">${esc(inv.notes)}</div></div>` : ""}
            ${inv.payment ? `<div class="inv-block pay"><div class="k">Payment details</div><div class="v">${esc(inv.payment)}</div></div>` : ""}
            ${inv.termsText ? `<div class="inv-block"><div class="k">Terms</div><div class="v">${esc(inv.termsText)}</div></div>` : ""}
          </div>
          <div class="inv-totals">
            ${line("Subtotal", money(t.subtotal, c))}
            ${t.discount ? line(`Discount (${num(inv.discount)}%)`, "− " + money(t.discount, c)) : ""}
            ${line("Tax", money(t.tax, c))}
            ${t.paid ? line("Total", money(t.total, c)) + line("Paid", "− " + money(t.paid, c)) : ""}
            <div class="grand"><span>${t.paid ? "Balance due" : "Total due"}</span><span>${money(t.due, c)}</span></div>
            <div class="ccy">All amounts in ${esc(ccyName[c] || c)} (${esc(c)})</div>
          </div>
        </div>

        <div class="inv-foot">
          <div><div class="thanks">Thank you for your business.</div>${esc(f.company)}${f.email ? " · " + esc(f.email) : ""}</div>
          <div style="text-align:right">${esc(invNo(inv))}<br/>Page 1 of 1</div>
        </div>
      </div>`;
  };

  // ---------- boot ----------
  const currentId = localStorage.getItem(KEYS.current);
  if (invoices[currentId]) inv = structuredClone(invoices[currentId]);
  else if (!Object.keys(invoices).length) inv = sampleInvoice();
  else inv = blankInvoice();
  if (!localStorage.getItem(KEYS.clients)) save(KEYS.clients, clients);

  renderClients(); fillForm(); render(); renderHistory();
})();
