const API = "/api";

let borrowers = [];
let loans = [];
let activeTab = "all";
let toastTimer;
let comboMatches = [];
let comboIndex = -1;

// ---------- Page elements ----------
const $ = (id) => document.getElementById(id);

const toast = $("toast");

const loanSearch = $("loan-search");
const dateField = $("date-field");
const dateFrom = $("date-from");
const dateTo = $("date-to");
const loansBody = $("loans-body");

const borrowerSearch = $("borrower-search");
const borrowersBody = $("borrowers-body");

const borrowerDialog = $("borrower-dialog");
const borrowerForm = $("borrower-form");
const borrowerTitle = $("borrower-title");
const borrowerError = $("borrower-error");
const borrowerId = $("borrower-id");
const borrowerName = $("borrower-name");
const borrowerPhone = $("borrower-phone");

const loanDialog = $("loan-dialog");
const loanForm = $("loan-form");
const loanError = $("loan-error");
const borrowerInput = $("borrower-input");
const borrowerList = $("borrower-list");
const borrowerNote = $("borrower-note");
const loanCollateral = $("loan-collateral");
const loanAmount = $("loan-amount");
const loanDate = $("loan-date");

const TABS = [
  { key: "all", label: "Loans taken", title: "Loans taken", note: "lent out" },
  { key: "pending", label: "Pending", title: "Pending loans", note: "to collect" },
  { key: "overdue", label: "Overdue", title: "Overdue loans", note: "owed late" },
  { key: "cleared", label: "Cleared", title: "Cleared loans", note: "collected" },
];

// ---------- Helpers ----------
function money(n) {
  return Number(n).toLocaleString("en-US");
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// Turns a date into text like "2026-11-10" (the calendar day on your computer)
function dayKey(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function todayString() {
  return dayKey(new Date());
}

// Makes text safe to put inside HTML
function esc(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Wraps the part of the text that matches what was typed in <mark>
function highlight(text, q) {
  if (!q) return esc(text);
  const i = text.toLowerCase().indexOf(q);
  if (i === -1) return esc(text);
  return (
    esc(text.slice(0, i)) +
    "<mark>" +
    esc(text.slice(i, i + q.length)) +
    "</mark>" +
    esc(text.slice(i + q.length))
  );
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");
}

function showMessage(text, type = "success") {
  toast.textContent = text;
  toast.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3500);
}

function showFormError(box, text) {
  box.textContent = text;
  box.classList.remove("hidden");
}

// One function for every call to the server
async function request(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Something went wrong");
  return data;
}

// ---------- Navigation ----------
function showPage(name) {
  document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
  $(`page-${name}`).classList.remove("hidden");
  document
    .querySelectorAll(".nav-btn")
    .forEach((b) => b.classList.toggle("active", b.dataset.page === name));
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => showPage(btn.dataset.page));
});

// ---------- Summary and status cards ----------
function renderSummary(s) {
  const stats = [
    ["Total lent", s.totalLent],
    ["Total to come back", s.totalToComeBack],
    ["Total profit", s.totalProfit],
    ["Late charges added", s.lateChargesAdded],
    ["Still to collect", s.stillToCollect],
    ["Profit earned (cleared)", s.profitEarnedCleared],
  ];
  $("summary").innerHTML = stats
    .map(
      ([label, value]) =>
        `<div class="stat"><span>${label}</span><strong>${money(value)}</strong></div>`
    )
    .join("");
}

function matchesTab(loan, tab) {
  if (tab === "pending") return !loan.cleared;
  if (tab === "overdue") return !loan.cleared && loan.weeksOverdue > 0;
  if (tab === "cleared") return loan.cleared;
  return true; // "all"
}

function statusOf(loan) {
  if (loan.cleared) return "cleared";
  return loan.weeksOverdue > 0 ? "overdue" : "ontime";
}

function badge(loan) {
  return `<span class="badge ${statusOf(loan)}">${esc(loan.overdueStage)}</span>`;
}

function renderStatusCards() {
  $("status-cards").innerHTML = TABS.map((t) => {
    const list = loans.filter((l) => matchesTab(l, t.key));
    const amount = list.reduce(
      (total, l) => total + (t.key === "all" ? l.amountTaken : l.totalToPayNow),
      0
    );
    return `
      <button type="button" class="status-card ${t.key} ${t.key === activeTab ? "active" : ""}" data-tab="${t.key}">
        <span class="status-label">${t.label}</span>
        <strong class="status-count">${list.length}</strong>
        <span class="status-amount">UGX ${money(amount)} ${t.note}</span>
      </button>`;
  }).join("");
}

$("status-cards").addEventListener("click", (e) => {
  const card = e.target.closest("[data-tab]");
  if (!card) return;
  activeTab = card.dataset.tab;
  renderLoans();
});

// ---------- Loans table: tab, search and date filter ----------
function matchesSearch(loan, q) {
  if (!q) return true;
  const name = loan.borrower ? loan.borrower.name : "";
  const phone = loan.borrower ? loan.borrower.phone : "";
  return `${name} ${phone} ${loan.collateral}`.toLowerCase().includes(q);
}

function matchesDates(loan) {
  const from = dateFrom.value;
  const to = dateTo.value;
  if (!from && !to) return true;

  const value = loan[dateField.value];
  if (!value) return false; // e.g. a pending loan has no cleared date

  const key = dayKey(value);
  if (from && key < from) return false;
  if (to && key > to) return false;
  return true;
}

function renderLoans() {
  renderStatusCards();

  const tab = TABS.find((t) => t.key === activeTab);
  $("loans-title").textContent = tab.title;

  const q = loanSearch.value.trim().toLowerCase();
  const list = loans.filter(
    (l) => matchesTab(l, activeTab) && matchesSearch(l, q) && matchesDates(l)
  );

  // Most urgent first for unpaid loans, newest first for cleared ones
  if (activeTab === "pending" || activeTab === "overdue") {
    list.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  } else if (activeTab === "cleared") {
    list.sort((a, b) => new Date(b.dateCleared) - new Date(a.dateCleared));
  }

  const owed = list
    .filter((l) => !l.cleared)
    .reduce((total, l) => total + l.totalToPayNow, 0);
  $("loan-count").textContent =
    `Showing ${list.length} ${list.length === 1 ? "loan" : "loans"}` +
    (owed ? ` · UGX ${money(owed)} still to collect from these` : "");

  loansBody.innerHTML = list.length
    ? list
        .map((l) => {
          const who = l.borrower ? esc(l.borrower.name) : "(removed)";
          const phone = l.borrower ? esc(l.borrower.phone) : "";
          return `
        <tr class="row-${statusOf(l)}">
          <td><strong>${who}</strong><span class="sub">${phone}</span></td>
          <td>${esc(l.collateral)}</td>
          <td>${formatDate(l.dateGiven)}</td>
          <td>${formatDate(l.dueDate)}</td>
          <td class="num">${money(l.amountTaken)}</td>
          <td class="num">${money(l.amountToBringBack)}</td>
          <td class="num">${money(l.profit)}</td>
          <td>${badge(l)}</td>
          <td class="num">${money(l.lateCharge)}</td>
          <td class="num">${money(l.totalToPayNow)}</td>
          <td>${l.dateCleared ? formatDate(l.dateCleared) : "-"}</td>
          <td class="actions">
            ${l.cleared ? "" : `<button class="small" data-clear="${l._id}">Clear</button>`}
            <button class="small danger" data-remove="${l._id}">Delete</button>
          </td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="12" class="empty">No loans match</td></tr>`;
}

[loanSearch, dateField, dateFrom, dateTo].forEach((el) => {
  el.addEventListener("input", renderLoans);
});

$("filters-clear").addEventListener("click", () => {
  loanSearch.value = "";
  dateField.value = "dateGiven";
  dateFrom.value = "";
  dateTo.value = "";
  renderLoans();
});

loansBody.addEventListener("click", async (e) => {
  const clearId = e.target.dataset.clear;
  const removeId = e.target.dataset.remove;

  try {
           if (clearId) {
      if (!confirm("Mark this loan as cleared?")) return;
      await request(`/loans/${clearId}/clear`, { method: "PATCH" });
      showMessage("Loan cleared");
      await refreshAll();
    }
    if (removeId) {
      if (!confirm("Delete this loan record?")) return;
      await request(`/loans/${removeId}`, { method: "DELETE" });
      showMessage("Loan deleted");
      await refreshAll();
    }
  } catch (err) {
    showMessage(err.message, "error");
  }
});

// ---------- Borrowers page ----------
function renderBorrowers() {
  const q = borrowerSearch.value.trim().toLowerCase();
  const list = borrowers.filter(
    (b) => b.name.toLowerCase().includes(q) || b.phone.includes(q)
  );

  borrowersBody.innerHTML = list.length
    ? list
        .map((b) => {
          const mine = loans.filter((l) => l.borrower && l.borrower._id === b._id);
          const owes = mine
            .filter((l) => !l.cleared)
            .reduce((total, l) => total + l.totalToPayNow, 0);
          return `
        <tr>
          <td>
            <div class="person">
              <div class="avatar">${esc(initials(b.name))}</div>
              <strong>${esc(b.name)}</strong>
            </div>
          </td>
          <td>${esc(b.phone)}</td>
          <td class="num">${mine.length}</td>
          <td class="num">${money(owes)}</td>
          <td class="actions">
            <button class="small ghost" data-edit="${b._id}">Edit</button>
            <button class="small danger" data-delete="${b._id}">Delete</button>
          </td>
        </tr>`;
        })
        .join("")
    : `<tr><td colspan="5" class="empty">No borrowers found</td></tr>`;
}

borrowerSearch.addEventListener("input", renderBorrowers);

function openBorrowerDialog(borrower) {
  borrowerForm.reset();
  borrowerError.classList.add("hidden");
  borrowerId.value = borrower ? borrower._id : "";
  borrowerName.value = borrower ? borrower.name : "";
  borrowerPhone.value = borrower ? borrower.phone : "";
  borrowerTitle.textContent = borrower ? "Edit borrower" : "New borrower";
  borrowerDialog.showModal();
  borrowerName.focus();
}

borrowerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = JSON.stringify({
    name: borrowerName.value,
    phone: borrowerPhone.value,
  });

  try {
    if (borrowerId.value) {
      await request(`/borrowers/${borrowerId.value}`, { method: "PUT", body });
      showMessage("Borrower updated");
    } else {
      await request("/borrowers", { method: "POST", body });
      showMessage("Borrower added");
    }
    borrowerDialog.close();
    await refreshAll();
  } catch (err) {
    showFormError(borrowerError, err.message);
  }
});

borrowersBody.addEventListener("click", async (e) => {
  const editId = e.target.dataset.edit;
  const deleteId = e.target.dataset.delete;

  if (editId) {
    openBorrowerDialog(borrowers.find((b) => b._id === editId));
  }

  if (deleteId) {
    if (!confirm("Delete this borrower?")) return;
    try {
      await request(`/borrowers/${deleteId}`, { method: "DELETE" });
      showMessage("Borrower deleted");
      await refreshAll();
    } catch (err) {
      showMessage(err.message, "error");
    }
  }
});

// ---------- New loan: type-to-search borrower picker ----------
function currentQuery() {
  return borrowerInput.dataset.id ? "" : borrowerInput.value.trim().toLowerCase();
}

// Lower score = better match
function matchScore(b, q) {
  const name = b.name.toLowerCase();
  if (name.startsWith(q)) return 0;
  if (name.split(/\s+/).some((word) => word.startsWith(q))) return 1;
  if (name.includes(q)) return 2;
  if (b.phone.includes(q)) return 3;
  return -1;
}

function renderCombo() {
  const q = currentQuery();

  borrowerList.innerHTML = comboMatches.length
    ? comboMatches
        .map(
          (b, i) => `
        <li class="${i === comboIndex ? "active" : ""}" data-id="${b._id}">
          <strong>${highlight(b.name, q)}</strong>
          <span>${highlight(b.phone, q)}</span>
        </li>`
        )
        .join("")
    : `<li class="none">No borrower found. Add them first with + New borrower.</li>`;

  borrowerList.classList.remove("hidden");

  const active = borrowerList.querySelector("li.active");
  if (active) active.scrollIntoView({ block: "nearest" });
}

function updateCombo() {
  const q = currentQuery();

  comboMatches = q
    ? borrowers
        .map((b) => ({ b, score: matchScore(b, q) }))
        .filter((x) => x.score >= 0)
        .sort((x, y) => x.score - y.score || x.b.name.localeCompare(y.b.name))
        .map((x) => x.b)
    : borrowers.slice();

  comboIndex = comboMatches.length ? 0 : -1;
  renderCombo();
}

function chooseBorrower(id) {
  const b = borrowers.find((x) => x._id === id);
  if (!b) return;
  borrowerInput.value = `${b.name} · ${b.phone}`;
  borrowerInput.dataset.id = b._id;
  borrowerInput.classList.add("chosen");
  borrowerNote.textContent = "Borrower selected";
  borrowerList.classList.add("hidden");
}

borrowerInput.addEventListener("input", () => {
  delete borrowerInput.dataset.id;
  borrowerInput.classList.remove("chosen");
  borrowerNote.textContent = "Keep typing, or pick someone from the list";
  updateCombo();
});

borrowerInput.addEventListener("focus", () => {
  borrowerInput.select();
  updateCombo();
});

borrowerInput.addEventListener("blur", () => {
  borrowerList.classList.add("hidden");
});

borrowerInput.addEventListener("keydown", (e) => {
  const listOpen = !borrowerList.classList.contains("hidden");

  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!listOpen) {
      updateCombo();
      return;
    }
    if (!comboMatches.length) return;
    const step = e.key === "ArrowDown" ? 1 : -1;
    comboIndex = (comboIndex + step + comboMatches.length) % comboMatches.length;
    renderCombo();
  }

  if (e.key === "Enter" && listOpen) {
    e.preventDefault();
    if (comboMatches[comboIndex]) chooseBorrower(comboMatches[comboIndex]._id);
  }
});

// mousedown (not click) so the choice happens before the input loses focus
borrowerList.addEventListener("mousedown", (e) => {
  e.preventDefault();
  const li = e.target.closest("li[data-id]");
  if (li) chooseBorrower(li.dataset.id);
});

function openLoanDialog() {
  if (!borrowers.length) {
    showMessage("Add a borrower first", "error");
    return;
  }
  loanForm.reset();
  delete borrowerInput.dataset.id;
  borrowerInput.classList.remove("chosen");
  borrowerNote.textContent = "Type a name or phone number to search";
  borrowerList.classList.add("hidden");
  loanError.classList.add("hidden");
  loanDate.value = todayString();
  loanDialog.showModal();
  borrowerInput.focus();
}

loanForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!borrowerInput.dataset.id) {
    showFormError(loanError, "Please pick a borrower from the list");
    return;
  }

  try {
    await request("/loans", {
      method: "POST",
      body: JSON.stringify({
        borrower: borrowerInput.dataset.id,
        collateral: loanCollateral.value,
        amountTaken: Number(loanAmount.value),
        dateGiven: loanDate.value,
      }),
    });
    loanDialog.close();
    showMessage("Loan added");
    await refreshAll();
  } catch (err) {
    showFormError(loanError, err.message);
  }
});

// ---------- Buttons and pop-ups ----------
$("new-borrower-btn").addEventListener("click", () => openBorrowerDialog(null));
$("new-loan-btn").addEventListener("click", openLoanDialog);

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => btn.closest("dialog").close());
});

// Clicking the dark area outside a pop-up closes it
document.querySelectorAll("dialog").forEach((dialog) => {
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
});

// ---------- Start ----------
async function refreshAll() {
  const [summary, borrowerList, loanList] = await Promise.all([
    request("/loans/summary"),
    request("/borrowers"),
    request("/loans"),
  ]);
  borrowers = borrowerList;
  loans = loanList;

  renderSummary(summary);
  renderBorrowers();
  renderLoans();
}

showPage("loans");
refreshAll().catch(() =>
  showMessage("Cannot reach the server. Is it running?", "error")
);