/* Blyze Labs Invoice Generator — no build step, data lives in localStorage. */
(() => {
  "use strict";

  const KEYS = { invoices: "blyze.invoices", clients: "blyze.clients", from: "blyze.from", current: "blyze.current", payment: "blyze.payment", templates: "blyze.templates", client: "blyze.client" };

  const DEFAULT_FROM = {
    company: "Blyze Labs LLC",
    contact: "Agustin",
    street: "251 Little Falls Drive", street2: "", city: "Wilmington", state: "DE", zip: "19808", country: "USA",
    email: "agus@blyzelabs.co",
    website: "blyzelabs.co",
    taxId: "",
  };

  const SAMPLE_CLIENT = {
    prefix: "APLOS",
    company: "Aplos Software, LLC",
    contact: "Gabriela Henriques",
    street: "8839 N Cedar Ave B-4 #5007", street2: "", city: "Fresno", state: "CA", zip: "93720", country: "USA",
    email: "finance@aplos.com",
    taxId: "",
  };

  const ONESKIN_CLIENT = {
    prefix: "OS",
    pad: 3,
    company: "OneSkin Inc.",
    contact: "Deepti Janveja",
    street: "953 Indiana St.", street2: "", city: "San Francisco", state: "CA", zip: "94107", country: "USA",
    email: "deepti@oneskin.co",
    taxId: "",
  };

  // ---------- storage ----------
  const load = (k, fallback) => {
    try { const v = JSON.parse(getRaw(k)); return v ?? fallback; } catch { return fallback; }
  };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const getRaw = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const setRaw = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  // ---------- addresses ----------
  // Parties store a structured address: street, street2, city, state, zip, country.
  const PARTY_FIELDS = ["company", "contact", "street", "street2", "city", "state", "zip", "country", "email", "taxId"];
  const pickParty = (p = {}) => Object.fromEntries(PARTY_FIELDS.map((k) => [k, p[k] || ""]));

  // Older versions kept the address as free text; split it into fields.
  const OLD_FROM_ADDR = "251 Little Falls Drive\nWilmington, DE 19808\nUnited States of America";
  const parseAddress = (text) => {
    if (text === OLD_FROM_ADDR) text = "251 Little Falls Drive\nWilmington, DE 19808, USA";
    const lines = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean);
    const re = /^(.+?),\s*([A-Za-z]{2})\.?\s+([A-Za-z0-9-]{3,10})(?:,\s*(.+))?$/;
    const i = lines.findIndex((l) => re.test(l));
    if (i < 0) return { street: lines[0] || "", street2: lines.slice(1).join(", "), city: "", state: "", zip: "", country: "" };
    const m = lines[i].match(re);
    return {
      street: i > 0 ? lines[0] : "",
      street2: lines.slice(1, i).join(", "),
      city: m[1], state: m[2].toUpperCase(), zip: m[3],
      country: m[4] || lines.slice(i + 1).join(", "),
    };
  };
  const normalizeParty = (p) => {
    if (!p || typeof p.address !== "string") return p;
    if (!p.street && !p.city) Object.assign(p, parseAddress(p.address));
    delete p.address;
    return p;
  };
  const addressLines = (p) => {
    const cityLine = [p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    // Country sits next to the ZIP ("Wilmington, DE 19808, USA") when it fits,
    // otherwise on its own line so long names don't wrap mid-word.
    const together = cityLine && p.country && cityLine.length + p.country.length <= 36;
    const tail = together ? [`${cityLine}, ${p.country}`] : [cityLine, p.country];
    return [p.street, p.street2, ...tail].filter(Boolean);
  };

  let invoices = load(KEYS.invoices, {});
  let clients = load(KEYS.clients, [SAMPLE_CLIENT, ONESKIN_CLIENT]);
  if (!clients.some((c) => c.company === ONESKIN_CLIENT.company)) clients.push(ONESKIN_CLIENT);
  let from = load(KEYS.from, DEFAULT_FROM);
  // one-time conversion of free-text addresses
  normalizeParty(from);
  clients.forEach(normalizeParty);
  Object.values(invoices).forEach((i) => { normalizeParty(i.to); normalizeParty(i.from); });
  save(KEYS.from, from); save(KEYS.clients, clients);
  if (Object.keys(invoices).length) save(KEYS.invoices, invoices);
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
  // Digits per prefix come from the client/template (OneSkin uses OS-007, Aplos APLOS-0011).
  const padFor = (prefix) => {
    const src = [...templates, ...clients].find((x) => (x.prefix || "") === (prefix || "") && x.pad);
    return src ? src.pad : 4;
  };
  const invNo = (i) => `${i.prefix ? i.prefix + "-" : ""}${String(i.number || 1).padStart(padFor(i.prefix), "0")}`;
  const ccyName = { USD: "US dollars", EUR: "euros", GBP: "British pounds", CAD: "Canadian dollars", ARS: "Argentine pesos" };

  const toast = (msg) => {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 1800);
  };

  // Next number = highest saved invoice for this prefix + 1, but never below the
  // template's starting number (so numbering continues from invoices made elsewhere).
  const byRecent = (a, b) => (b.issueDate || "").localeCompare(a.issueDate || "") || num(b.number) - num(a.number);

  const nextNumber = (prefix) => {
    const nums = Object.values(invoices).filter((i) => (i.prefix || "") === (prefix || "")).map((i) => num(i.number));
    const floors = templates.filter((t) => (t.prefix || "") === (prefix || "")).map((t) => num(t.startNumber) || 1);
    return Math.max(nums.length ? Math.max(...nums) + 1 : 1, ...floors);
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
      to: pickParty(client),
      from: { ...from },
      items: [{ name: "", desc: "", qty: 1, rate: 0, tax: 0 }],
      discount: 0,
      paid: 0,
      payment: getRaw(KEYS.payment) || "",
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
      if (el.name === "payment") setRaw(KEYS.payment, inv.payment);
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
    inv.to = pickParty(c);
    if (!invoices[inv.id] && c.prefix) { inv.prefix = c.prefix; inv.number = nextNumber(c.prefix); }
    fillForm(); render();
  };
  $("#btn-save-client").onclick = () => {
    if (!inv.to.company) return toast("Add a company name first");
    const c = { ...inv.to, prefix: inv.prefix };
    const idx = clients.findIndex((x) => x.company.toLowerCase() === c.company.toLowerCase());
    if (idx >= 0) clients[idx] = c; else clients.push(c);
    save(KEYS.clients, clients); renderClients(); renderTopClient();
    toast(`Saved client “${c.company}”`);
  };

  // ---------- client templates ----------
  const SAMPLE_TEMPLATE = {
    id: "tpl-aplos-foundations",
    name: "Data Foundations",
    prefix: "APLOS",
    startNumber: 12,
    to: pickParty(SAMPLE_CLIENT),
    currency: "USD",
    terms: "custom",
    dueDays: 45,
    reference: "",
    items: [{ name: "Aplos Data Foundations", desc: "Aplos Data Analytics Foundational Layer", qty: 1, rate: 8500, tax: 0 }],
    discount: 0,
    payment: "",
    termsText: "Payment due by the date above. Invoiced in USD.",
  };
  const ONESKIN_TEMPLATE = {
    id: "tpl-oneskin-monthly",
    name: "Monthly – Analytics + dbt Cloud",
    prefix: "OS",
    pad: 3,
    startNumber: 8,
    to: pickParty(ONESKIN_CLIENT),
    currency: "USD",
    terms: "custom",
    dueDays: 32,
    reference: "",
    items: [
      { name: "Fractional Analytics Engineering", desc: "Ongoing data analytics, reporting, and consulting services.", qty: 1, rate: 6400, tax: 0 },
      { name: "dbt Cloud", desc: "dbt Cloud monthly subscription", qty: 1, rate: 100, tax: 0 },
    ],
    discount: 0,
    payment: "",
    termsText: "Payment due by the date above. Invoiced in USD.",
  };
  const BUILT_IN_TEMPLATES = [SAMPLE_TEMPLATE, ONESKIN_TEMPLATE];

  // Add built-in templates once each (a deleted one is not brought back), and
  // give the existing Aplos template its starting number.
  let templates = load(KEYS.templates, []);
  if (!Array.isArray(templates)) templates = [];
  templates.forEach((t) => normalizeParty(t.to));
  const seeded = load("blyze.seeded", []);
  BUILT_IN_TEMPLATES.forEach((t) => {
    if (seeded.includes(t.id)) return;
    const have = templates.find((x) => x.id === t.id);
    if (have) { have.startNumber ??= t.startNumber; if (t.pad) have.pad ??= t.pad; }
    else templates.push(structuredClone(t));
    seeded.push(t.id);
  });
  // Recreate OneSkin invoice OS-007 (issued 2026-10-26) once, and open it.
  if (!seeded.includes("inv-os-007")) {
    seeded.push("inv-os-007");
    const exists = Object.values(invoices).some((i) => i.prefix === "OS" && num(i.number) === 7);
    if (!exists) {
      invoices["inv-os-007"] = {
        id: "inv-os-007", prefix: "OS", number: 7, currency: "USD",
        issueDate: "2026-10-26", terms: "custom", dueDate: "2026-11-27", reference: "",
        to: { ...ONESKIN_TEMPLATE.to }, from: { ...from },
        items: structuredClone(ONESKIN_TEMPLATE.items),
        discount: 0, paid: 0,
        payment: getRaw(KEYS.payment) || "",
        termsText: ONESKIN_TEMPLATE.termsText,
      };
      save(KEYS.invoices, invoices);
      setRaw(KEYS.current, "inv-os-007");
    }
  }
  // One-time switch of clients' country to "USA" (clients, templates, invoices).
  if (!seeded.includes("country-usa")) {
    seeded.push("country-usa");
    const US = /^(united states( of america)?|u\.?s\.?a?\.?)$/i;
    const toUSA = (p) => { if (p && US.test((p.country || "").trim())) p.country = "USA"; };
    clients.forEach(toUSA);
    templates.forEach((t) => toUSA(t.to));
    Object.values(invoices).forEach((i) => { toUSA(i.to); toUSA(i.from); });
    toUSA(from);
    save(KEYS.clients, clients); save(KEYS.invoices, invoices); save(KEYS.from, from);
  }
  save("blyze.seeded", seeded); save(KEYS.templates, templates);

  const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);

  const renderTemplates = (selectId) => {
    const sel = $("#tpl-picker");
    const keep = selectId ?? sel.value;
    const groups = {};
    templates.filter((t) => !topClient || t.to.company === topClient).forEach((t) => (groups[t.to.company || "No client"] ??= []).push(t));
    const current = inv?.to?.company;
    const order = Object.keys(groups).sort((a, b) => (b === current) - (a === current) || a.localeCompare(b));
    sel.innerHTML = Object.keys(groups).length
      ? order.map((g) => `<optgroup label="${esc(g)}">${groups[g].map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join("")}</optgroup>`).join("")
      : `<option value="">No templates yet</option>`;
    if (templates.some((t) => t.id === keep && (!topClient || t.to.company === topClient))) sel.value = keep;
    else { const first = templates.find((t) => t.to.company === current); if (first) sel.value = first.id; }
  };

  // The parts of the open invoice that a template keeps.
  const snapshot = () => ({
      prefix: inv.prefix,
      pad: padFor(inv.prefix),
      to: { ...inv.to },
      currency: inv.currency,
      terms: inv.terms,
      dueDays: inv.issueDate && inv.dueDate ? daysBetween(inv.issueDate, inv.dueDate) : 30,
      reference: inv.reference,
      items: structuredClone(inv.items),
      discount: inv.discount,
      payment: inv.payment,
      termsText: inv.termsText,
  });

  $("#btn-tpl-update").onclick = () => {
    const b = $("#btn-tpl-update");
    const t = templates.find((x) => x.id === $("#tpl-picker").value);
    if (!t) return toast("Pick a template to update");
    if (!inv.to.company) return toast("Add a client company first");
    if (inv.to.company !== t.to.company && !b.dataset.armed) {
      b.dataset.armed = "1";
      b.textContent = `Click again to move “${t.name}” to ${inv.to.company}`;
      setTimeout(() => { delete b.dataset.armed; b.textContent = "Update selected template"; }, 4000);
      return;
    }
    delete b.dataset.armed; b.textContent = "Update selected template";
    const name = $("#tpl-name").value.trim() || t.name;
    Object.assign(t, snapshot(), { name });
    save(KEYS.templates, templates);
    $("#tpl-name").value = "";
    renderTemplates(t.id);
    toast(`Updated template “${name}”`);
  };

  $("#btn-tpl-save").onclick = () => {
    if (!inv.to.company) return toast("Add a client company first");
    const name = $("#tpl-name").value.trim() || inv.items[0]?.name || "Standard invoice";
    const t = { name, ...snapshot() };
    const existing = templates.find((x) => x.to.company === t.to.company && x.name.toLowerCase() === name.toLowerCase());
    if (existing) Object.assign(existing, t); else templates.push({ id: uid(), ...t });
    save(KEYS.templates, templates);
    $("#tpl-name").value = "";
    renderTemplates((existing || templates[templates.length - 1]).id);
    toast(`${existing ? "Updated" : "Saved"} template “${name}” for ${t.to.company}`);
  };

  $("#btn-tpl-use").onclick = () => {
    const t = templates.find((x) => x.id === $("#tpl-picker").value);
    if (!t) return toast("Pick a template first");
    const issueDate = today();
    inv = {
      ...blankInvoice(t.to),
      prefix: t.prefix || "",
      number: nextNumber(t.prefix || ""),
      currency: t.currency || "USD",
      issueDate,
      terms: t.terms,
      dueDate: addDays(issueDate, t.terms === "custom" ? t.dueDays ?? 30 : t.terms),
      reference: t.reference || "",
      to: { ...t.to },
      items: structuredClone(t.items),
      discount: t.discount || 0,
      paid: 0,
      termsText: t.termsText || "",
    };
    if ((t.payment || "").trim()) inv.payment = t.payment;
    fillForm(); render(); renderHistory(); renderTemplates(t.id);
    toast(`New ${invNo(inv)} from “${t.name}”`);
  };

  $("#btn-tpl-del").onclick = () => {
    const b = $("#btn-tpl-del");
    const t = templates.find((x) => x.id === $("#tpl-picker").value);
    if (!t) return;
    if (!b.dataset.armed) {
      b.dataset.armed = "1"; b.textContent = `Click again to delete “${t.name}”`;
      setTimeout(() => { delete b.dataset.armed; b.textContent = "Delete selected template"; }, 4000);
      return;
    }
    delete b.dataset.armed; b.textContent = "Delete selected template";
    templates = templates.filter((x) => x !== t);
    save(KEYS.templates, templates); renderTemplates(); toast("Template deleted");
  };

  // ---------- top client selector ----------
  let topClient = getRaw(KEYS.client) || "";
  const forClient = (i) => !topClient || i.to?.company === topClient;
  const allCompanies = () => {
    const names = new Set(clients.map((c) => c.company).filter(Boolean));
    Object.values(invoices).forEach((i) => i.to?.company && names.add(i.to.company));
    return [...names].sort((a, b) => a.localeCompare(b));
  };
  const renderTopClient = () => {
    const names = allCompanies();
    if (topClient && !names.includes(topClient)) topClient = "";
    $("#top-client").innerHTML = `<option value="">All clients</option>` + names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
    $("#top-client").value = topClient;
  };
  $("#top-client").onchange = (e) => {
    topClient = e.target.value;
    setRaw(KEYS.client, topClient);
    if (topClient && inv.to.company !== topClient) {
      const draft = !invoices[inv.id] && totals(inv).total > 0;
      if (draft) toast(`Your unsaved ${invNo(inv)} draft is still open`);
      else {
        const latest = Object.values(invoices).filter(forClient).sort(byRecent)[0];
        if (latest) inv = structuredClone(latest);
        else inv = blankInvoice(clients.find((c) => c.company === topClient) || { company: topClient });
        if (latest) setRaw(KEYS.current, inv.id);
        fillForm(); render();
      }
    }
    renderHistory(); renderTemplates(); renderHistoryView();
  };

  // ---------- views ----------
  const showView = (v) => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === v));
    $(".layout").hidden = v !== "editor";
    $("#history-view").hidden = v !== "history";
    document.querySelectorAll("#history, #btn-save, #btn-pdf").forEach((el) => (el.style.display = v === "editor" ? "" : "none"));
    if (v === "history") renderHistoryView();
  };
  document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => showView(t.dataset.view)));

  // ---------- history view ----------
  const statusOf = (i) => {
    const t = totals(i);
    if (t.total > 0 && t.due <= 0.005) return "paid";
    if (i.dueDate && i.dueDate < today()) return "overdue";
    return "open";
  };
  // Sums kept per currency so USD and EUR are never added together.
  const sumMoney = (list, pick) => {
    const by = {};
    list.forEach((i) => (by[i.currency || "USD"] = (by[i.currency || "USD"] || 0) + pick(i)));
    const keys = Object.keys(by);
    if (!keys.length) return money(0, "USD");
    return keys.map((c) => money(by[c], c)).join(" + ");
  };

  const renderHistoryView = () => {
    const list = Object.values(invoices).filter(forClient).sort(byRecent);
    const outstanding = list.filter((i) => statusOf(i) !== "paid");
    const overdue = list.filter((i) => statusOf(i) === "overdue");
    const year = today().slice(0, 4);
    const thisYear = list.filter((i) => (i.issueDate || "").startsWith(year));

    $("#hv-title").textContent = topClient || "All clients";
    $("#hv-sub").textContent = list.length
      ? `${list.length} invoice${list.length === 1 ? "" : "s"} · first issued ${fmtDate(list[list.length - 1].issueDate)} · latest ${fmtDate(list[0].issueDate)}`
      : "No saved invoices yet. Save or download an invoice and it appears here.";

    $("#hv-tiles").innerHTML = [
      ["Total invoiced", sumMoney(list, (i) => totals(i).total), "main"],
      [`Invoiced in ${year}`, sumMoney(thisYear, (i) => totals(i).total), ""],
      [`Outstanding (${outstanding.length})`, sumMoney(outstanding, (i) => totals(i).due), ""],
      [`Overdue (${overdue.length})`, sumMoney(overdue, (i) => totals(i).due), ""],
    ].map(([k, v, cls]) => `<div class="tile ${cls}"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`).join("");

    // per-client summary (only when looking at all clients)
    const box = $("#hv-clients");
    if (topClient) { box.hidden = true; }
    else {
      box.hidden = false;
      const groups = {};
      list.forEach((i) => (groups[i.to.company || "No client"] ??= []).push(i));
      const rows = Object.entries(groups).sort((a, b) => {
        const ta = a[1].reduce((s, i) => s + totals(i).total, 0), tb = b[1].reduce((s, i) => s + totals(i).total, 0);
        return tb - ta;
      });
      box.innerHTML = `<h2>By client</h2><div class="scroll"><table class="hv-table">
        <thead><tr><th>Client</th><th class="r">Invoices</th><th class="r">Total invoiced</th><th class="r">Outstanding</th><th>Last invoice</th></tr></thead>
        <tbody>${rows.length ? rows.map(([name, l]) => `
          <tr class="click" data-client="${esc(name)}">
            <td class="num">${esc(name)}</td>
            <td class="r">${l.length}</td>
            <td class="r">${esc(sumMoney(l, (i) => totals(i).total))}</td>
            <td class="r">${esc(sumMoney(l.filter((i) => statusOf(i) !== "paid"), (i) => totals(i).due))}</td>
            <td>${esc(invNo(l[0]))} · ${fmtDate(l[0].issueDate)}</td>
          </tr>`).join("") : `<tr><td colspan="5" class="empty">No invoices yet</td></tr>`}</tbody>
        ${rows.length > 1 ? `<tfoot><tr><td>All clients</td><td class="r">${list.length}</td><td class="r">${esc(sumMoney(list, (i) => totals(i).total))}</td><td class="r">${esc(sumMoney(outstanding, (i) => totals(i).due))}</td><td></td></tr></tfoot>` : ""}
      </table></div>`;
    }

    $("#hv-invoices").innerHTML = `
      <thead><tr><th>Invoice</th>${topClient ? "" : "<th>Client</th>"}<th>Issued</th><th>Due</th><th class="r">Total</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.length ? list.map((i) => {
        const st = statusOf(i);
        return `<tr>
          <td class="num">${esc(invNo(i))}</td>
          ${topClient ? "" : `<td>${esc(i.to.company)}</td>`}
          <td>${fmtDate(i.issueDate)}</td>
          <td>${fmtDate(i.dueDate)}</td>
          <td class="r">${esc(money(totals(i).total, i.currency))}</td>
          <td><span class="badge ${st}">${st[0].toUpperCase() + st.slice(1)}</span></td>
          <td class="acts">
            <button type="button" class="btn small" data-open="${esc(i.id)}">Open</button>
            <button type="button" class="btn small" data-paid="${esc(i.id)}">${st === "paid" ? "Mark unpaid" : "Mark paid"}</button>
          </td>
        </tr>`;
      }).join("") : `<tr><td colspan="7" class="empty">No invoices yet</td></tr>`}</tbody>`;
  };

  $("#history-view").addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-client]");
    const open = e.target.dataset.open, paid = e.target.dataset.paid;
    if (open && invoices[open]) {
      inv = structuredClone(invoices[open]);
      setRaw(KEYS.current, inv.id);
      fillForm(); render(); renderHistory(); showView("editor");
    } else if (paid && invoices[paid]) {
      const i = invoices[paid];
      i.paid = statusOf(i) === "paid" ? 0 : totals(i).total;
      save(KEYS.invoices, invoices);
      if (inv.id === paid) { inv.paid = i.paid; fillForm(); render(); }
      renderHistory(); renderHistoryView();
      toast(`${invNo(i)} marked ${i.paid ? "paid" : "unpaid"}`);
    } else if (row) {
      topClient = row.dataset.client; setRaw(KEYS.client, topClient);
      $("#top-client").value = topClient;
      $("#top-client").dispatchEvent(new Event("change"));
    }
  });

  // ---------- invoices history ----------
  const renderHistory = () => {
    const list = Object.values(invoices).filter(forClient).sort(byRecent);
    $("#history").innerHTML =
      `<option value="">${list.length ? "Open saved invoice…" : "No saved invoices"}</option>` +
      list.map((i) => `<option value="${i.id}" ${i.id === inv.id ? "selected" : ""}>${esc(invNo(i))} · ${esc(i.to.company)} · ${money(totals(i).total, i.currency)}</option>`).join("");
  };
  $("#history").onchange = (e) => {
    if (!invoices[e.target.value]) return;
    inv = structuredClone(invoices[e.target.value]);
    setRaw(KEYS.current, inv.id);
    fillForm(); render(); renderHistory();
  };

  const persist = () => {
    invoices[inv.id] = structuredClone(inv);
    save(KEYS.invoices, invoices);
    renderHistoryView();
    setRaw(KEYS.current, inv.id);
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
    const client = clients.find((c) => c.company === (topClient || inv.to.company)) || clients[0];
    inv = blankInvoice(client);
    inv.currency = invoices[getRaw(KEYS.current)]?.currency || "USD";
    fillForm(); render(); renderHistory();
    toast("New invoice");
  };
  $("#btn-delete").onclick = () => {
    if (!invoices[inv.id]) return toast("This invoice isn't saved yet");
    const b = $("#btn-delete");
    if (!b.dataset.armed) {
      b.dataset.armed = "1"; b.textContent = `Click again to delete ${invNo(inv)}`;
      setTimeout(() => { delete b.dataset.armed; b.textContent = "Delete this invoice"; }, 4000);
      return;
    }
    delete b.dataset.armed; b.textContent = "Delete this invoice";
    delete invoices[inv.id]; save(KEYS.invoices, invoices);
    inv = blankInvoice(); fillForm(); render(); renderHistory();
    toast("Deleted");
  };

  // Inside a claude.ai artifact, printing and plain downloads are blocked, so
  // we render the PDF ourselves and hand it to the platform's downloads API.
  // Opened as a normal file/site, we use the browser's print-to-PDF (vector, crisp).
  let downloads = null;
  if (window.claude?.use) window.claude.use("downloads").then((d) => (downloads = d)).catch(() => {});

  const loadScript = (src) => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const el = Object.assign(document.createElement("script"), { src, onload: res, onerror: rej });
    document.head.appendChild(el);
  });
  const offerFile = async (filename, data) => {
    try { await downloads.save({ filename, data }); toast(`Saved ${filename}`); }
    catch (e) { toast(e?.code === "declined" ? "Download cancelled" : "Couldn't save the file here"); }
  };

  const buildPdf = async () => {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    const el = $("#invoice");
    const canvas = await window.html2canvas(el, { scale: 3, backgroundColor: "#ffffff", useCORS: true });
    const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, 297);
    return pdf.output("blob");
  };

  $("#btn-pdf").onclick = async () => {
    if (!invoices[inv.id]) persist();
    const name = `Invoice - ${invNo(inv)}`;
    if (!downloads) {
      const prev = document.title;
      document.title = name;
      window.print();
      setTimeout(() => (document.title = prev), 500);
      return;
    }
    const b = $("#btn-pdf"); b.disabled = true; b.textContent = "Preparing…";
    try { await offerFile(`${name}.pdf`, await buildPdf()); }
    catch { toast("Couldn't build the PDF"); }
    finally { b.disabled = false; b.textContent = "Download PDF"; }
  };

  // ---------- backup ----------
  $("#btn-export").onclick = () => {
    const json = JSON.stringify({ invoices, clients, from, templates }, null, 2);
    if (downloads) return offerFile(`blyze-invoices-${today()}.json`, json);
    const blob = new Blob([json], { type: "application/json" });
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
      if (Array.isArray(data.templates)) { templates = data.templates; save(KEYS.templates, templates); renderTemplates(); }
      save(KEYS.invoices, invoices); save(KEYS.clients, clients); save(KEYS.from, from);
      renderClients(); renderTopClient(); renderHistory(); renderHistoryView(); toast("Backup imported");
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
    const contactLines = (p) => [p.contact, ...addressLines(p)].filter(Boolean).map(esc).join("\n");

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
            <div class="inv-block"><div class="k">Currency</div><div class="v cur"><b>${esc(c)}</b> — ${esc(ccyName[c] || c)}</div></div>
            ${inv.termsText ? `<div class="inv-block"><div class="k">Terms</div><div class="v">${esc(inv.termsText)}</div></div>` : ""}
            <div class="inv-block pay"><div class="k">Payment details</div><div class="v">${esc(inv.payment) || "&nbsp;"}</div></div>
          </div>
          <div class="inv-totals">
            ${line("Subtotal", money(t.subtotal, c))}
            ${t.discount ? line(`Discount (${num(inv.discount)}%)`, "− " + money(t.discount, c)) : ""}
            ${line("Tax", money(t.tax, c))}
            ${t.paid ? line("Total", money(t.total, c)) + line("Paid", "− " + money(t.paid, c)) : ""}
            <div class="grand"><span>${t.paid ? "Balance due" : "Total due"}</span><span>${money(t.due, c)}</span></div>
          </div>
        </div>

        <div class="inv-foot">
          <div>${esc(f.company)}${f.email ? " · " + esc(f.email) : ""}</div>
          <div style="text-align:right">${esc(invNo(inv))}</div>
        </div>
      </div>`;
  };

  // ---------- boot ----------
  // Recover payment details from the most recent saved invoice that has them
  // (older versions didn't remember them between invoices).
  const lastPay = Object.values(invoices).filter((i) => (i.payment || "").trim()).sort(byRecent)[0];
  if (!getRaw(KEYS.payment) && lastPay) setRaw(KEYS.payment, lastPay.payment);

  const currentId = getRaw(KEYS.current);
  if (invoices[currentId]) inv = structuredClone(invoices[currentId]);
  else if (!Object.keys(invoices).length) inv = sampleInvoice();
  else inv = blankInvoice();
  if (!(inv.payment || "").trim() && getRaw(KEYS.payment)) inv.payment = getRaw(KEYS.payment);
  if (!getRaw(KEYS.clients)) save(KEYS.clients, clients);

  renderClients(); renderTopClient(); fillForm(); render(); renderHistory(); renderTemplates(); renderHistoryView();
})();
