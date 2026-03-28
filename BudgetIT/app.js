// ============== STATE MANAGEMENT ==============
const CHALLENGE_LENGTH = 31;
const ACTIVE_PROFILE_STORAGE_KEY = "budgetit_active_profile";
const PROFILE_STORAGE_PREFIX = "budgetit_data_";
const LEGACY_STORAGE_KEY = "budgetit_data";
const API_BASE = (() => {
  if (window.BUDGETIT_API_BASE) return String(window.BUDGETIT_API_BASE).replace(/\/$/, "");
  const host = window.location.hostname;
  const isLocalHost = host === "localhost" || host === "127.0.0.1";
  return isLocalHost ? "http://localhost:3001/api" : "/api";
})();

let apiOnline = false;
let uiIdSeed = 1000000;

function nextUiId() {
  uiIdSeed += 1;
  return uiIdSeed;
}

function apiUrl(path) {
  const clean = String(path || "").replace(/^\//, "");
  return `${API_BASE}/${clean}`;
}

async function apiRequest(path, options = {}) {
  const init = {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  };

  if (init.body && typeof init.body !== "string") {
    init.body = JSON.stringify(init.body);
  }

  const response = await fetch(apiUrl(path), init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = data && data.error ? data.error : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

function parseJsonNotes(value, fallback = {}) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (_err) {
    return fallback;
  }
}

function mapRemoteTransaction(item, type) {
  const notes = parseJsonNotes(item.notes, {});
  return {
    id: nextUiId(),
    remoteId: item.id,
    type,
    amount: Number(item.amount || 0),
    category: notes.category || (type === "income" ? "Income" : "Other"),
    description: notes.description || item.title || (type === "income" ? "Income" : "Expense"),
    date: item.date || new Date().toISOString().slice(0, 10),
  };
}

function mapRemoteGoal(item) {
  const notes = parseJsonNotes(item.notes, {});
  return {
    id: nextUiId(),
    remoteId: item.id,
    name: item.title || "Savings Goal",
    icon: notes.icon || "savings",
    color: notes.color || "#00D2FF",
    target: Number(item.amount || 0),
    saved: Number(notes.saved || 0),
  };
}

function toRemoteTxPayload(tx) {
  return {
    title: tx.description || (tx.type === "income" ? "Income" : "Expense"),
    amount: Number(tx.amount || 0),
    date: tx.date,
    notes: JSON.stringify({
      category: tx.category,
      description: tx.description,
      type: tx.type,
    }),
  };
}

function toRemoteGoalPayload(goal) {
  return {
    title: goal.name,
    amount: Number(goal.target || 0),
    notes: JSON.stringify({
      icon: goal.icon,
      color: goal.color,
      saved: Number(goal.saved || 0),
    }),
  };
}

async function syncStateFromApi() {
  try {
    const [income, expenses, goals] = await Promise.all([
      apiRequest("income"),
      apiRequest("expenses"),
      apiRequest("savings-goals"),
    ]);

    const mappedIncome = income.map((item) => mapRemoteTransaction(item, "income"));
    const mappedExpenses = expenses.map((item) => mapRemoteTransaction(item, "expense"));
    const mappedGoals = goals.map(mapRemoteGoal);

    state.transactions = [...mappedIncome, ...mappedExpenses].sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });

    if (mappedGoals.length > 0) {
      state.savingsGoals = mappedGoals;
    }

    apiOnline = true;
    saveState();
    return true;
  } catch (_err) {
    apiOnline = false;
    return false;
  }
}

async function createRemoteTransaction(tx) {
  const endpoint = tx.type === "income" ? "income" : "expenses";
  const created = await apiRequest(endpoint, { method: "POST", body: toRemoteTxPayload(tx) });
  tx.remoteId = created.id;
  saveState();
}

async function deleteRemoteTransaction(tx) {
  if (!tx.remoteId) return;
  const endpoint = tx.type === "income" ? "income" : "expenses";
  await apiRequest(`${endpoint}/${encodeURIComponent(tx.remoteId)}`, { method: "DELETE" });
}

async function createRemoteGoal(goal) {
  const created = await apiRequest("savings-goals", { method: "POST", body: toRemoteGoalPayload(goal) });
  goal.remoteId = created.id;
  saveState();
}

async function updateRemoteGoal(goal) {
  if (!goal.remoteId) return;
  await apiRequest(`savings-goals/${encodeURIComponent(goal.remoteId)}`, {
    method: "PUT",
    body: toRemoteGoalPayload(goal),
  });
}

const DEFAULT_STATE = {
  profile: { name: "Eunice", type: "student", role: "Student", initialized: false },
  settings: { theme: "dark", budgetRule: "50-30-20", currency: "PHP" },
  monthlyIncome: 15000,
  transactions: [
    { id: 1, type: "expense", amount: 189, category: "Food", description: "Lunch — Jollibee", date: "2026-03-25" },
    { id: 2, type: "expense", amount: 13, category: "Transport", description: "Jeepney Fare", date: "2026-03-25" },
    { id: 3, type: "expense", amount: 245, category: "School", description: "School Supplies", date: "2026-03-24" },
    { id: 4, type: "income", amount: 500, category: "Income", description: "Allowance", date: "2026-03-24" },
    { id: 5, type: "expense", amount: 55, category: "Food", description: "Coffee — 7-Eleven", date: "2026-03-23" },
  ],
  savingsGoals: [
    { id: 1, name: "iPhone 16", icon: "smartphone", color: "#00D2FF", target: 55990, saved: 8200 },
    { id: 2, name: "Emergency Fund", icon: "medical_services", color: "#00E676", target: 10000, saved: 3500 },
    { id: 3, name: "Baguio Trip", icon: "flight_takeoff", color: "#FFB800", target: 5000, saved: 1200 },
  ],
  challenge: {
    minAmount: 0, maxAmount: 1000, todayAmount: 47,
    days: [], currentStreak: 12, bestStreak: 12
  }
};

const PROFILE_PRESETS = {
  student: {
    label: "Student",
    monthlyIncome: 15000,
    budgetRule: "50-30-20",
    challengeMin: 0,
    challengeMax: 300,
    goals: [
      { id: 1, name: "Tuition Buffer", icon: "school", color: "#00D2FF", target: 12000, saved: 3200 },
      { id: 2, name: "Emergency Fund", icon: "medical_services", color: "#00E676", target: 10000, saved: 3500 },
      { id: 3, name: "Laptop Upgrade", icon: "laptop_mac", color: "#FFB800", target: 30000, saved: 6200 }
    ]
  },
  standard: {
    label: "Standard",
    monthlyIncome: 45000,
    budgetRule: "60-20-20",
    challengeMin: 50,
    challengeMax: 5000,
    goals: [
      { id: 1, name: "Emergency Fund", icon: "health_and_safety", color: "#00E676", target: 100000, saved: 12000 },
      { id: 2, name: "Home Essentials", icon: "home", color: "#00D2FF", target: 30000, saved: 4500 },
      { id: 3, name: "Travel Fund", icon: "flight_takeoff", color: "#FFB800", target: 45000, saved: 7500 }
    ]
  }
};

function normalizeProfileType(value) {
  const v = String(value || "").toLowerCase();
  if (v === "standard") return "standard";
  if (v === "student") return "student";
  return "";
}

function getProfileType() {
  return normalizeProfileType(state?.profile?.type) || "student";
}

function getProfileLabel() {
  const preset = PROFILE_PRESETS[getProfileType()];
  return preset ? preset.label : "Student";
}

function getExpenseCategories() {
  const profileType = getProfileType();
  if (profileType === "standard") {
    return ["Food", "Transport", "Utilities", "Bills", "Health", "Family", "Shopping", "Entertainment", "Other"];
  }
  return ["Food", "Transport", "School", "Entertainment", "Shopping", "Health", "Bills", "Other"];
}

function applyProfilePreset(profileType, options = {}) {
  const preset = PROFILE_PRESETS[profileType] || PROFILE_PRESETS.student;
  const force = !!options.force;

  if (!state.profile) state.profile = { name: "Eunice" };
  state.profile.type = profileType;
  state.profile.role = preset.label;

  if (force || !state.profile.initialized) {
    state.monthlyIncome = preset.monthlyIncome;
    state.settings.budgetRule = preset.budgetRule;
    state.savingsGoals = JSON.parse(JSON.stringify(preset.goals));
    state.challenge.minAmount = preset.challengeMin;
    state.challenge.maxAmount = preset.challengeMax;
    if (!state.challenge.todayAmount || force) {
      state.challenge.todayAmount = Math.floor((preset.challengeMin + preset.challengeMax) / 2);
    }
  }

  state.profile.initialized = true;
}

let state = {};
let activeProfileType = "student";

function storageKeyForProfile(profileType) {
  return `${PROFILE_STORAGE_PREFIX}${profileType}`;
}

function recalcChallengeStreak() {
  let streak = 0;
  let lastActed = state.challenge.days.reduce((lastIdx, d, i) => d !== null ? i : lastIdx, -1);
  if (lastActed !== -1) {
    for (let i = lastActed; i >= 0; i--) {
      if (state.challenge.days[i] && state.challenge.days[i].status === "saved") {
        streak++;
      } else {
        break;
      }
    }
  }
  state.challenge.currentStreak = streak;
  if (streak > (state.challenge.bestStreak || 0)) state.challenge.bestStreak = streak;
}

function loadStateForProfile(profileType) {
  activeProfileType = normalizeProfileType(profileType) || "student";
  localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, activeProfileType);

  let raw = localStorage.getItem(storageKeyForProfile(activeProfileType));
  if (!raw) {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      raw = legacy;
      localStorage.setItem(storageKeyForProfile(activeProfileType), legacy);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
  }
  state = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(DEFAULT_STATE));
  let changed = false;

  if (!state.profile) {
    state.profile = JSON.parse(JSON.stringify(DEFAULT_STATE.profile));
    changed = true;
  }

  if (!state.challenge) {
    state.challenge = JSON.parse(JSON.stringify(DEFAULT_STATE.challenge));
    changed = true;
  }

  if (!state.settings) {
    state.settings = JSON.parse(JSON.stringify(DEFAULT_STATE.settings));
    changed = true;
  } else {
    if (!state.settings.theme) {
      state.settings.theme = DEFAULT_STATE.settings.theme;
      changed = true;
    }
    if (!state.settings.budgetRule) {
      state.settings.budgetRule = DEFAULT_STATE.settings.budgetRule;
      changed = true;
    }
  }

  if (state.challenge.days) {
    state.challenge.days = state.challenge.days.filter(d => d !== null && typeof d === "object");
  } else {
    state.challenge.days = [];
    changed = true;
  }

  const existingType = normalizeProfileType(state.profile.type || state.profile.role);
  if (!existingType) {
    applyProfilePreset(activeProfileType, { force: !raw });
    changed = true;
  } else {
    state.profile.type = existingType;
    state.profile.role = PROFILE_PRESETS[existingType].label;
  }

  if (!state.profile.initialized) {
    applyProfilePreset(activeProfileType, { force: !raw });
    changed = true;
  }

  recalcChallengeStreak();
  if (changed) saveState();
}

function loadState() {
  const params = new URLSearchParams(window.location.search);
  const requestedType = normalizeProfileType(params.get("profile"));
  const storedActive = normalizeProfileType(localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY));
  const initialType = requestedType || storedActive || "student";
  loadStateForProfile(initialType);
}
function saveState() {
  localStorage.setItem(storageKeyForProfile(activeProfileType), JSON.stringify(state));
  localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, activeProfileType);
}
function nextId(arr) { return arr.length ? Math.max(...arr.map(a => a.id)) + 1 : 1; }

// ============== HELPERS ==============
function fmt(n) { return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtShort(n) { return "₱" + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 0 }); }
function pct(a, b) { return b === 0 ? 0 : Math.round((a / b) * 100); }
function dateStr(d) {
  const opts = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  return new Date(d).toLocaleDateString("en-US", opts);
}
function shortDate(d) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const CAT_ICONS = { Food: "restaurant", Transport: "directions_bus", School: "school", Entertainment: "sports_esports", Shopping: "shopping_cart", Health: "favorite", Bills: "receipt_long", Other: "more_horiz", Income: "payments", Utilities: "bolt", Family: "groups" };
const CAT_COLORS = { Food: "#FF5252", Transport: "#00D2FF", School: "#6C5CE7", Entertainment: "#FF6B9D", Shopping: "#FFB800", Health: "#00E676", Bills: "#C77DFF", Other: "#64DFDF", Income: "#00E676", Utilities: "#FFD166", Family: "#54A0FF" };

function totalIncome() { return state.transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0); }
function totalExpenses() { return state.transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0); }
function totalBalance() { return state.monthlyIncome - totalExpenses(); }
function totalSaved() { return state.savingsGoals.reduce((s, g) => s + g.saved, 0); }
function savingsRate() { const inc = state.monthlyIncome; return inc === 0 ? 0 : pct(totalSaved(), inc); }

// ============== ROUTING ==============
let currentPage = "dashboard";
function navigate(page) {
  // Income gate for Saving Challenge — requires monthly income
  if (page === "challenge") {
    if (!state.monthlyIncome || state.monthlyIncome <= 0) {
      showIncomeGateModal();
      return;
    }
  }
  currentPage = page;
  document.querySelectorAll(".page-section").forEach(s => s.classList.add("hidden"));
  const el = document.getElementById("page-" + page);
  if (el) el.classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(n => {
    n.classList.toggle("active", n.dataset.page === page);
  });
  renderPage(page);
}
function initRouter() {
  document.querySelectorAll(".nav-item").forEach(a => {
    a.addEventListener("mousedown", e => {
      e.currentTarget.classList.remove("nav-clicking");
      e.currentTarget.classList.add("nav-down");
    });
    a.addEventListener("mouseup", e => {
      e.currentTarget.classList.remove("nav-down");
      e.currentTarget.classList.add("nav-clicking");
    });
    a.addEventListener("mouseleave", e => {
      if(e.currentTarget.classList.contains("nav-down")) {
        e.currentTarget.classList.remove("nav-down");
        e.currentTarget.classList.add("nav-clicking");
      }
    });
    a.addEventListener("click", e => { 
      e.preventDefault(); 
      e.currentTarget.classList.remove("animate-nav-click");
      void e.currentTarget.offsetWidth;
      e.currentTarget.classList.add("animate-nav-click");
      navigate(a.dataset.page); 
    });
  });
  const hash = location.hash.replace("#", "") || "dashboard";
  navigate(hash);
}

// ============== RENDER PAGES ==============
function renderPage(page) {
  const renderers = { dashboard: renderDashboard, tracker: renderTracker, budget: renderBudget, goals: renderGoals, challenge: renderChallenge, analytics: renderAnalytics, settings: renderSettings, recommend: renderRecommend };
  if (renderers[page]) {
    renderers[page]();
    requestAnimationFrame(() => animatePageContent(page));
  }
}

function animatePageContent(page) {
  const section = document.getElementById("page-" + page);
  if (!section) return;

  const animatedNodes = section.querySelectorAll(".card, .stat-card, .tx-row, .recommend-card, .cal-cell, .seg-control");

  section.classList.remove("page-fade-in");
  animatedNodes.forEach(node => {
    node.classList.remove("page-anim-item");
    node.style.removeProperty("--enter-delay");
  });

  void section.offsetWidth;
  section.classList.add("page-fade-in");

  animatedNodes.forEach((node, idx) => {
    node.style.setProperty("--enter-delay", `${Math.min(idx, 20) * 36}ms`);
    node.classList.add("page-anim-item");
  });
}

const DASHBOARD_RECOMMENDATIONS = {
  student: [
    { category: "Food", icon: "lunch_dining", name: "Packed lunch", price: 60, tip: "Save vs buying outside" },
    { category: "Transport", icon: "directions_bus", name: "Jeepney commute", price: 13, tip: "Keep daily commute low" },
    { category: "School", icon: "menu_book", name: "Print essentials", price: 30, tip: "Prioritize required outputs" },
    { category: "Entertainment", icon: "sports_esports", name: "Free campus activity", price: 0, tip: "Zero-cost break time" },
    { category: "Shopping", icon: "shopping_bag", name: "School supply bundle", price: 85, tip: "Buy in one trip" }
  ],
  standard: [
    { category: "Food", icon: "local_dining", name: "Meal prep ingredients", price: 250, tip: "Lower weekly food costs" },
    { category: "Utilities", icon: "bolt", name: "Prepaid load top-up", price: 100, tip: "Stick to monthly limit" },
    { category: "Family", icon: "family_restroom", name: "Family essentials", price: 300, tip: "Cover immediate needs" },
    { category: "Transport", icon: "commute", name: "Public transport pass", price: 120, tip: "Predictable commute spend" },
    { category: "Health", icon: "medication", name: "Basic health refill", price: 180, tip: "Avoid emergency buys" }
  ]
};

function getDashboardRecommendations() {
  const profileType = getProfileType();
  const rules = state.settings.budgetRule.split("-").map(Number);
  const income = state.monthlyIncome || 0;
  const needsBudget = income * rules[0] / 100;
  const wantsBudget = income * rules[1] / 100;

  const categoryBudgets = profileType === "standard"
    ? {
        Food: needsBudget * 0.30,
        Transport: needsBudget * 0.20,
        Utilities: needsBudget * 0.20,
        Family: needsBudget * 0.15,
        Health: needsBudget * 0.15,
        Entertainment: wantsBudget * 0.35,
        Shopping: wantsBudget * 0.25
      }
    : {
        Food: needsBudget * 0.40,
        Transport: needsBudget * 0.25,
        School: needsBudget * 0.20,
        Health: needsBudget * 0.15,
        Entertainment: wantsBudget * 0.35,
        Shopping: wantsBudget * 0.30
      };

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
  const spentByCategory = {};
  state.transactions
    .filter(t => t.type === "expense" && t.date >= monthStart)
    .forEach(t => {
      spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amount;
    });

  const candidates = DASHBOARD_RECOMMENDATIONS[profileType] || DASHBOARD_RECOMMENDATIONS.student;
  const scored = candidates.map(item => {
    const budget = categoryBudgets[item.category] || wantsBudget * 0.1;
    const spent = spentByCategory[item.category] || 0;
    const remaining = Math.max(0, budget - spent);
    const affordable = item.price <= remaining;
    return { ...item, remaining, affordable, budget, spent };
  });

  const picks = scored
    .filter(i => i.affordable)
    .sort((a, b) => (a.remaining - a.price) - (b.remaining - b.price))
    .slice(0, 3);

  const fallback = scored
    .sort((a, b) => a.price - b.price)
    .slice(0, 3);

  return {
    title: profileType === "student" ? "Student Smart Picks" : "Standard Smart Picks",
    items: picks.length ? picks : fallback
  };
}

// ============== DASHBOARD ==============
let dashboardSpendingView = "week";
let dashboardSpendingChart = null;

function renderDashboard() {
  const el = document.getElementById("page-dashboard");
  const bal = totalBalance();
  const inc = state.monthlyIncome;
  const spent = totalExpenses();
  const sr = savingsRate();
  const rules = state.settings.budgetRule.split("-").map(Number);
  const needs = inc * rules[0] / 100, wants = inc * rules[1] / 100, savings = inc * rules[2] / 100;
  const profileType = getProfileType();
  const needsCategories = profileType === "standard"
    ? ["Food", "Transport", "Bills", "Health", "Utilities", "Family"]
    : ["Food", "Transport", "Bills", "Health", "School"];
  const needsSpent = state.transactions.filter(t => t.type === "expense" && needsCategories.includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const wantsSpent = state.transactions.filter(t => t.type === "expense" && ["Entertainment", "Shopping"].includes(t.category)).reduce((s, t) => s + t.amount, 0);
  const dashboardRecs = getDashboardRecommendations();

  const ch = state.challenge;
  el.innerHTML = `
  <!-- Summary Cards -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
    <div class="card"><div class="flex justify-between items-start mb-4"><div class="w-10 h-10 bg-accent-primary/10 rounded-full flex items-center justify-center text-accent-primary"><span class="material-symbols-outlined filled">account_balance_wallet</span></div><div class="pill bg-success/10 text-success">↑ 8.2%</div></div><p class="text-[13px] font-medium text-text-muted tracking-wider uppercase mb-1">Total Balance</p><p class="font-mono text-2xl text-text-primary">${fmt(bal)}</p></div>
    <div class="card"><div class="flex justify-between items-start mb-4"><div class="w-10 h-10 bg-success/10 rounded-full flex items-center justify-center text-success"><span class="material-symbols-outlined filled">arrow_circle_up</span></div></div><p class="text-[13px] font-medium text-text-muted tracking-wider uppercase mb-1">Monthly Income</p><p class="font-mono text-2xl text-text-primary">${fmt(inc)}</p><p class="text-[12px] text-text-muted mt-2 italic">Last updated today</p></div>
    <div class="card"><div class="flex justify-between items-start mb-4"><div class="w-10 h-10 bg-error/10 rounded-full flex items-center justify-center text-error"><span class="material-symbols-outlined filled">arrow_circle_down</span></div><div class="pill bg-success/10 text-success">↓ 12.5%</div></div><p class="text-[13px] font-medium text-text-muted tracking-wider uppercase mb-1">Total Spent</p><p class="font-mono text-2xl text-text-primary">${fmt(spent)}</p></div>
    <div class="card"><div class="flex justify-between items-start mb-4"><div class="w-10 h-10 bg-gold/10 rounded-full flex items-center justify-center text-gold"><span class="material-symbols-outlined filled">savings</span></div></div><p class="text-[13px] font-medium text-text-muted tracking-wider uppercase mb-1">Savings Rate</p><p class="font-mono text-2xl text-text-primary">${sr}%</p><div class="mt-4 progress-track h-1.5"><div class="progress-fill progress-violet" style="width:${sr}%"></div></div></div>
  </div>
  <!-- Row 2: Chart + Challenge -->
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-12 lg:col-span-7 card">
      <div class="flex justify-between items-center mb-6">
        <h3 id="dashboard-spending-title" class="font-headline font-semibold text-lg">${dashboardSpendingView === "month" ? "Spending This Month" : "Spending This Week"}</h3>
        <div class="seg-control">
          <button type="button" class="seg-btn ${dashboardSpendingView === "week" ? "active" : ""}" onclick="setDashboardSpendingView('week', this)">Week</button>
          <button type="button" class="seg-btn ${dashboardSpendingView === "month" ? "active" : ""}" onclick="setDashboardSpendingView('month', this)">Month</button>
        </div>
      </div>
      <canvas id="weeklyChart" height="200"></canvas>
    </div>
    <div class="col-span-12 lg:col-span-5 relative overflow-hidden bg-gradient-to-br from-surface-container-low to-accent-primary/10 border border-border-default rounded-2xl p-8">
      <div class="absolute bottom-[-50px] right-[-50px] w-64 h-64 bg-accent-primary blur-[100px] opacity-10 pointer-events-none"></div>
      <div class="pill bg-gold/15 border border-gold/30 text-gold text-[11px] tracking-widest uppercase mb-6">DAY ${ch.currentStreak} STREAK 🔥</div>
      <h3 class="font-headline font-semibold text-2xl mb-2">Today's Saving Challenge</h3>
      <p class="font-clash font-bold text-5xl text-accent-secondary mb-3 text-glow-cyan">Save ${fmt(ch.todayAmount)}</p>
      <p class="text-[15px] text-text-secondary mb-8">A small step towards your dreams!</p>
      <div class="flex flex-wrap gap-3 mb-8">
        <button onclick="acceptChallenge()" class="btn-primary">Challenge Accepted!</button>
        <button onclick="skipChallenge()" class="btn-ghost">Skip Today</button>
      </div>
      <div class="space-y-2"><div class="flex justify-between text-[12px]"><span class="text-text-muted">Progress</span><span class="text-gold font-bold">${ch.currentStreak}/30 days</span></div><div class="progress-track h-2"><div class="progress-fill progress-gold" style="width:${pct(ch.currentStreak,30)}%"></div></div></div>
    </div>
  </div>
  <!-- Row 3: Goals + Transactions -->
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-12 lg:col-span-5 card">
      <div class="flex justify-between items-center mb-6"><h3 class="font-headline font-semibold text-lg">Savings Goals</h3><a href="#goals" onclick="navigate('goals')" class="text-sm font-medium text-accent-primary hover:underline">See All</a></div>
      <div class="space-y-5">${state.savingsGoals.map(g => `
        <div class="flex items-center gap-4 group"><div class="w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform" style="background:${g.color}20;color:${g.color}"><span class="material-symbols-outlined filled text-[20px]">${g.icon}</span></div><div class="flex-1"><p class="text-sm font-bold">${g.name}</p><p class="font-mono text-[12px] text-text-muted">${fmtShort(g.saved)} / ${fmtShort(g.target)}</p></div>
        <div class="relative w-12 h-12 flex items-center justify-center"><svg class="w-full h-full -rotate-90" viewBox="0 0 36 36"><path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#242438" stroke-width="2.5" stroke-dasharray="100, 100"/><path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="${g.color}" stroke-width="2.5" stroke-dasharray="${pct(g.saved,g.target)}, 100" stroke-linecap="round"/></svg><span class="absolute font-mono text-[10px] font-semibold">${pct(g.saved,g.target)}%</span></div></div>
      `).join("")}</div>
    </div>
    <div class="col-span-12 lg:col-span-7 card">
      <div class="flex justify-between items-center mb-6"><h3 class="font-headline font-semibold text-lg">Recent Transactions</h3><a href="#tracker" onclick="navigate('tracker')" class="text-sm font-medium text-accent-primary hover:underline">View All</a></div>
      <div class="divide-y divide-surface-container-low">${state.transactions.slice(0, 5).map(t => `
        <div class="tx-row"><div class="flex items-center gap-4"><div class="w-9 h-9 rounded-full flex items-center justify-center text-[18px]" style="background:${CAT_COLORS[t.category]}15;color:${CAT_COLORS[t.category]}"><span class="material-symbols-outlined">${CAT_ICONS[t.category]||"more_horiz"}</span></div><div><p class="text-sm font-semibold">${t.description}</p><p class="text-[11px] text-text-muted">${shortDate(t.date)}</p></div></div><span class="font-mono text-sm font-semibold ${t.type==="expense"?"text-error":"text-success"}">${t.type==="expense"?"−":"+"} ${fmt(t.amount)}</span></div>
      `).join("")}</div>
    </div>
  </div>
  <!-- Row 4: Budget Overview -->
  <div class="card">
    <div class="mb-6"><h3 class="font-headline font-semibold text-lg">${rules.join("/")} Budget Overview</h3><p class="text-sm text-text-muted">Based on ${fmt(inc)} monthly income</p></div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      ${[{name:"Needs",pct:rules[0],alloc:needs,spent:needsSpent,color:"#00D2FF"},{name:"Wants",pct:rules[1],alloc:wants,spent:wantsSpent,color:"#6C5CE7"},{name:"Savings",pct:rules[2],alloc:savings,spent:totalSaved(),color:"#00E676"}].map(b => `
      <div class="bg-surface-container-low border border-white/[0.02] rounded-xl p-5 hover:border-[${b.color}]/20 transition-all">
        <div class="flex items-center gap-3 mb-4"><div class="w-2 h-6 rounded-full" style="background:${b.color}"></div><h4 class="font-bold">${b.name} (${b.pct}%)</h4></div>
        <div class="grid grid-cols-2 gap-2 mb-4"><div><p class="text-[10px] text-text-muted uppercase tracking-widest">Allocated</p><p class="font-mono text-sm">${fmt(b.alloc)}</p></div><div class="text-right"><p class="text-[10px] text-text-muted uppercase tracking-widest">Remaining</p><p class="font-mono text-sm" style="color:${b.color}">${fmt(Math.max(0,b.alloc - b.spent))}</p></div></div>
        <div class="progress-track h-2 mb-2"><div class="progress-fill" style="width:${pct(b.spent,b.alloc)}%;background:${b.color}"></div></div>
        <p class="font-mono text-[11px] text-text-muted">${fmtShort(b.spent)} ${b.name==="Savings"?"saved":"spent"} of ${fmtShort(b.alloc)}</p>
      </div>`).join("")}
    </div>
  </div>
  <!-- Row 5: Recommendation Widget -->
  <div class="card bg-gradient-to-br from-surface-container-low to-accent-secondary/5 border-border-default">
    <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h3 class="font-headline font-semibold text-lg flex items-center gap-2"><span class="material-symbols-outlined text-accent-secondary filled">tips_and_updates</span>${dashboardRecs.title}</h3>
        <p class="text-sm text-text-muted">Quick recommendations from your current budget and profile.</p>
      </div>
      <button onclick="navigate('recommend')" class="btn-primary h-10 px-4">View Full Recommendations</button>
    </div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      ${dashboardRecs.items.map(item => `
      <div class="bg-surface-container-low border border-border-default rounded-xl p-4">
        <div class="flex items-center justify-between mb-3">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center" style="background:${CAT_COLORS[item.category] || '#6C5CE7'}22;color:${CAT_COLORS[item.category] || '#6C5CE7'}">
            <span class="material-symbols-outlined text-[18px]">${item.icon}</span>
          </div>
          <span class="font-mono text-xs px-2 py-1 rounded-lg bg-accent-primary/10 text-accent-primary">${item.price === 0 ? 'FREE' : fmtShort(item.price)}</span>
        </div>
        <p class="text-sm font-semibold text-text-primary">${item.name}</p>
        <p class="text-xs text-text-muted mt-1">${item.tip}</p>
        <div class="mt-3">
          <span class="inline-flex items-center gap-1 text-[11px] text-text-muted cursor-help" title="Category budget: ${fmt(item.budget)} | Spent: ${fmt(item.spent)} | Remaining: ${fmt(item.remaining)}">
            <span class="material-symbols-outlined text-[14px]">info</span>
            Why this?
          </span>
        </div>
      </div>
      `).join("")}
    </div>
  </div>`;
  renderWeeklyChart();
}

function setDashboardSpendingView(view, btn) {
  dashboardSpendingView = view === "month" ? "month" : "week";
  const seg = btn?.parentElement;
  if (seg) {
    seg.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  }
  const title = document.getElementById("dashboard-spending-title");
  if (title) title.textContent = dashboardSpendingView === "month" ? "Spending This Month" : "Spending This Week";
  renderWeeklyChart();
}

function getDashboardSpendingSeries() {
  const expenses = state.transactions.filter(t => t.type === "expense");
  const totalsByDate = new Map();
  expenses.forEach(t => {
    totalsByDate.set(t.date, (totalsByDate.get(t.date) || 0) + t.amount);
  });

  if (dashboardSpendingView === "month") {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weekCount = Math.ceil(daysInMonth / 7);
    const labels = [];
    const data = Array.from({ length: weekCount }, () => 0);

    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const weekIndex = Math.floor((day - 1) / 7);
      data[weekIndex] += totalsByDate.get(dateKey) || 0;
    }

    for (let week = 0; week < weekCount; week++) {
      const startDay = week * 7 + 1;
      const endDay = Math.min(daysInMonth, (week + 1) * 7);
      labels.push(`Wk ${week + 1} (${startDay}-${endDay})`);
      data[week] = Number(data[week].toFixed(2));
    }

    return { labels, data };
  }

  const labels = [];
  const data = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().split("T")[0];
    labels.push(d.toLocaleDateString("en-US", { weekday: "short" }));
    data.push(Number((totalsByDate.get(dateKey) || 0).toFixed(2)));
  }

  return { labels, data };
}

function renderWeeklyChart() {
  const ctx = document.getElementById("weeklyChart");
  if (!ctx) return;
  const { labels, data } = getDashboardSpendingSeries();

  if (dashboardSpendingChart) {
    dashboardSpendingChart.destroy();
  }

  dashboardSpendingChart = new Chart(ctx, {
    type: "bar", data: { labels, datasets: [{ data, backgroundColor: "rgba(0,210,255,0.6)", borderRadius: 6, borderSkipped: false }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { grid: { color: "#1A1A2E" }, ticks: { color: "#6B6B85", font: { family: "JetBrains Mono", size: 10 } } }, x: { grid: { display: false }, ticks: { color: "#6B6B85", font: { family: "DM Sans", size: 12 } } } } }
  });
}

// ============== DAILY TRACKER ==============
function renderTracker() {
  const el = document.getElementById("page-tracker");
  const categories = getExpenseCategories();
  el.innerHTML = `
  <section class="card bg-gradient-to-br from-surface to-accent-primary/[0.03]">
    <h2 class="font-headline font-semibold text-[22px] mb-5">Add Transaction</h2>
    <form id="tx-form" class="flex flex-wrap items-end gap-4">
      <div class="flex flex-col gap-2"><label class="input-label">Type</label><div class="seg-control h-[44px]"><button type="button" class="seg-btn" data-type="income" onclick="setTxType('income',this)">INCOME</button><button type="button" class="seg-btn active" data-type="expense" onclick="setTxType('expense',this)">EXPENSE</button></div></div>
      <div class="flex flex-col gap-2 min-w-[140px]"><label class="input-label">Amount (₱)</label><input id="tx-amount" class="input-field font-mono" placeholder="0.00" type="number" step="0.01" required style="background-color:#12121A;color:#F0F0F5"/></div>
      <div class="flex flex-col gap-2 min-w-[160px]"><label class="input-label">Category</label><select id="tx-cat" class="input-field" style="background-color:#12121A;color:#F0F0F5">${categories.map(c => `<option>${c}</option>`).join("")}</select></div>
      <div class="flex flex-col gap-2 flex-grow min-w-[200px]"><label class="input-label">Description</label><input id="tx-desc" class="input-field" placeholder="What was this for?" style="background-color:#12121A;color:#F0F0F5"/></div>
      <div class="flex flex-col gap-2"><label class="input-label">Date</label><input id="tx-date" class="input-field" type="date" value="${new Date().toISOString().split("T")[0]}" style="background-color:#12121A;color:#F0F0F5"/></div>
      <button type="submit" class="btn-primary"><span class="material-symbols-outlined text-[18px]">add_circle</span>Add Entry</button>
    </form>
  </section>
  <div class="card p-0 overflow-hidden">
    <div class="h-[44px] bg-surface-container-low px-6 flex items-center">
      <div class="grid grid-cols-12 w-full gap-4">
        <div class="col-span-2 stat-label">Date</div><div class="col-span-2 stat-label">Category</div><div class="col-span-4 stat-label">Description</div><div class="col-span-2 stat-label">Amount</div><div class="col-span-2 text-right stat-label">Actions</div>
      </div>
    </div>
    <div id="tx-list" class="divide-y divide-surface-container-low"></div>
  </div>`;
  document.getElementById("tx-form").onsubmit = addTransaction;
  renderTxList();
}
let txType = "expense";
function setTxType(t, btn) {
  txType = t;
  btn.parentElement.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}
function addTransaction(e) {
  e.preventDefault();
  const amt = parseFloat(document.getElementById("tx-amount").value);
  if (!amt || amt <= 0) return;
  const tx = {
    id: nextId(state.transactions), type: txType, amount: amt,
    category: txType === "income" ? "Income" : document.getElementById("tx-cat").value,
    description: document.getElementById("tx-desc").value || (txType === "income" ? "Income" : "Expense"),
    date: document.getElementById("tx-date").value
  };
  state.transactions.unshift(tx);
  saveState(); renderTxList();
  document.getElementById("tx-form").reset();

  createRemoteTransaction(tx)
    .then(() => {
      apiOnline = true;
    })
    .catch(() => {
      apiOnline = false;
      showToast("Saved locally. API sync unavailable right now.");
    });
}
function deleteTx(id) {
  const tx = state.transactions.find(t => t.id === id);
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveState();
  renderTxList();

  if (!tx) return;
  deleteRemoteTransaction(tx)
    .then(() => {
      apiOnline = true;
    })
    .catch(() => {
      apiOnline = false;
    });
}
function renderTxList() {
  const el = document.getElementById("tx-list"); if (!el) return;
  el.innerHTML = state.transactions.map(t => `
    <div class="group h-[56px] px-6 flex items-center hover:bg-surface-container-low transition-colors">
      <div class="grid grid-cols-12 w-full items-center gap-4">
        <div class="col-span-2 text-[14px] text-text-secondary">${shortDate(t.date)}</div>
        <div class="col-span-2 flex items-center gap-2"><span class="material-symbols-outlined text-[16px]" style="color:${CAT_COLORS[t.category]||"#6B6B85"}">${CAT_ICONS[t.category]||"more_horiz"}</span><span class="text-[14px] font-medium">${t.category}</span></div>
        <div class="col-span-4 text-[14px] text-text-secondary">${t.description}</div>
        <div class="col-span-2 font-mono text-[15px] font-medium ${t.type==="expense"?"text-error":"text-success"}">${t.type==="expense"?"−":"+"} ${fmt(t.amount)}</div>
        <div class="col-span-2 flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onclick="deleteTx(${t.id})" class="text-text-muted hover:text-error transition-colors"><span class="material-symbols-outlined text-[18px]">delete</span></button>
        </div>
      </div>
    </div>`).join("");
}

// ============== BUDGET PLANNER ==============
function renderBudget() {
  const el = document.getElementById("page-budget");
  const inc = state.monthlyIncome;
  const rules = state.settings.budgetRule.split("-").map(Number);
  const profileType = getProfileType();
  const needsItems = profileType === "standard"
    ? ["Rent", "Food", "Transport", "Utilities"]
    : ["School", "Food", "Transport", "Utilities"];
  const wantsItems = profileType === "standard"
    ? ["Dining Out", "Shopping", "Leisure", "Subscriptions"]
    : ["Entertainment", "Shopping", "Dining Out", "Subscriptions"];
  const savingsItems = profileType === "standard"
    ? ["Emergency Fund", "Retirement", "Travel", "Home"]
    : ["Emergency Fund", "Goals", "Challenge", "Education"];
  const cats = [
    { name: "Needs", pct: rules[0], icon: "home", color: "#00D2FF", items: needsItems },
    { name: "Wants", pct: rules[1], icon: "shopping_bag", color: "#6C5CE7", items: wantsItems },
    { name: "Savings", pct: rules[2], icon: "savings", color: "#00E676", items: savingsItems }
  ];
  el.innerHTML = `
  <div class="card"><h2 class="font-headline font-semibold text-[22px] mb-2">Your Monthly Budget</h2>
    <div class="flex items-center gap-4 mt-4"><span class="text-text-secondary">Monthly Income:</span>
    <input id="income-input" class="input-field font-mono text-xl w-48" value="${inc}" type="number" onchange="updateIncome(this.value)" style="background-color:#12121A;color:#F0F0F5"/></div>
    <p class="text-text-secondary text-sm mt-2">Using the ${rules.join("/")} rule — your budget is automatically calculated</p>
  </div>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">${cats.map(c => {
    const alloc = inc * c.pct / 100;
    return `<div class="card card-xl relative overflow-hidden"><div class="absolute top-0 left-0 right-0 h-1 rounded-t-[20px]" style="background:${c.color}"></div>
    <div class="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style="background:${c.color}15;color:${c.color}"><span class="material-symbols-outlined filled text-[28px]">${c.icon}</span></div>
    <h3 class="font-headline font-bold text-xl">${c.name}</h3><p class="text-sm text-text-muted">${c.pct}% of income</p>
    <p class="font-clash font-bold text-4xl mt-3" style="color:${c.color}">${fmt(alloc)}</p>
    <div class="mt-5 space-y-3">${c.items.map(item => `<div class="flex justify-between"><span class="text-sm text-text-secondary">${item}</span><span class="font-mono text-sm text-text-muted">${fmtShort(Math.round(alloc / c.items.length))}</span></div>`).join("")}</div></div>`;
  }).join("")}</div>
  <div class="card"><div class="flex items-center gap-6"><div><canvas id="budgetDonut" width="200" height="200"></canvas></div>
    <div class="space-y-4">${cats.map(c => `<div class="flex items-center gap-3"><div class="w-3 h-3 rounded-full" style="background:${c.color}"></div><span class="text-sm">${c.name} (${c.pct}%)</span><span class="font-mono text-sm text-text-muted">${fmt(inc*c.pct/100)}</span></div>`).join("")}</div></div></div>`;
  renderBudgetDonut(rules);
}
function updateIncome(v) { state.monthlyIncome = parseFloat(v) || 0; saveState(); renderBudget(); }
function renderBudgetDonut(rules) {
  const ctx = document.getElementById("budgetDonut"); if (!ctx) return;
  new Chart(ctx, { type: "doughnut", data: { labels: ["Needs","Wants","Savings"], datasets: [{ data: rules, backgroundColor: ["#00D2FF","#6C5CE7","#00E676"], borderWidth: 0 }] }, options: { cutout: "70%", plugins: { legend: { display: false } } } });
}

// ============== SAVINGS GOALS ==============
function renderGoals() {
  const el = document.getElementById("page-goals");
  const goals = state.savingsGoals;
  const ts = goals.reduce((s,g) => s + g.target, 0);
  const ss = goals.reduce((s,g) => s + g.saved, 0);
  el.innerHTML = `
  <div class="flex justify-between items-end"><div><h1 class="text-[28px] font-bold font-headline">Your Savings Goals</h1><p class="text-text-secondary mt-1">You are ${pct(ss,ts)}% closer to your financial dreams.</p></div>
  <button onclick="animateBtnAndGoal(this)" class="btn-primary"><span class="material-symbols-outlined text-[18px]">target</span>Add New Goal</button></div>
  <div class="grid grid-cols-4 gap-4">${[["Active Goals",goals.length],["Total Target",fmtShort(ts)],["Total Saved",fmtShort(ss)],["Avg Progress",pct(ss,ts)+"%"]].map(([l,v]) => `<div class="stat-card flex flex-col gap-1"><span class="stat-label">${l}</span><span class="stat-value">${v}</span></div>`).join("")}</div>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    ${goals.map(g => `<div class="card card-xl p-7 hover:-translate-y-1">
      <div class="flex items-center gap-4 mb-4"><div class="w-12 h-12 rounded-[14px] flex items-center justify-center" style="background:${g.color}15;color:${g.color}"><span class="material-symbols-outlined text-[32px]">${g.icon}</span></div><div class="flex-1"><h3 class="text-xl font-semibold font-headline">${g.name}</h3><p class="text-sm text-text-muted">${fmt(g.target)} Target</p></div></div>
      <div class="space-y-3 mt-5"><div class="progress-track h-[10px]"><div class="progress-fill" style="width:${pct(g.saved,g.target)}%;background:${g.color}"></div></div>
      <div class="flex justify-between font-mono text-sm"><span>${fmt(g.saved)} saved</span><span style="color:${g.color}">${pct(g.saved,g.target)}%</span></div>
      <p class="text-sm text-text-muted">${fmtShort(g.target - g.saved)} to go</p></div>
      <div class="mt-6 flex gap-3"><button onclick="showAddFundsModal(${g.id})" class="flex-1 btn-primary h-[36px] text-sm justify-center">Add Funds</button></div>
    </div>`).join("")}
    <div onclick="animateCardAndGoal(this)" class="border border-dashed border-border-default rounded-[20px] p-7 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-surface-container-high transition-colors">
      <div class="w-12 h-12 rounded-full bg-surface-container-low flex items-center justify-center text-text-muted"><span class="material-symbols-outlined text-[32px]">add</span></div>
      <p class="text-text-muted font-medium">Create a new goal</p>
    </div>
  </div>`;
}

// ============== SAVING CHALLENGE ==============
let challengeMonth = new Date().getMonth();
let challengeYear = new Date().getFullYear();
function challengeNavMonth(dir) {
  challengeMonth += dir;
  if (challengeMonth > 11) { challengeMonth = 0; challengeYear++; }
  if (challengeMonth < 0) { challengeMonth = 11; challengeYear--; }
  renderChallenge();
}

function renderChallenge() {
  const el = document.getElementById("page-challenge");
  const ch = state.challenge;
  const challengeRangeMax = getProfileType() === "standard" ? 5000 : 1000;
  if (ch.maxAmount > challengeRangeMax) ch.maxAmount = challengeRangeMax;
  if (ch.minAmount > challengeRangeMax) ch.minAmount = challengeRangeMax;
  if (ch.todayAmount > challengeRangeMax) ch.todayAmount = challengeRangeMax;
  const savedTotal = ch.days.filter(d => d.status === "saved").reduce((s,d) => s + d.amount, 0);

  // Build navigable calendar
  const year = challengeYear, month = challengeMonth;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  // Fetch the specific month's punch card progress
  const viewMonthKey = `${year}-${String(month+1).padStart(2,"0")}`;
  const chDays = ch.months ? (ch.months[viewMonthKey] || []) : (ch.days || []);

  // Calculate stats sequentially for this month
  let monthSaved = 0, monthSkipped = 0, monthPending = 0, monthTotalAmt = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const chDay = chDays[d - 1]; // Match sequence step by index
    if (chDay && chDay.status === "saved") { monthSaved++; monthTotalAmt += chDay.amount; }
    else if (chDay && chDay.status === "skipped") { monthSkipped++; }
    else { monthPending++; }
  }
  const monthCompletionPct = daysInMonth > 0 ? Math.round((monthSaved / daysInMonth) * 100) : 0;
  const monthAvgPerDay = monthSaved > 0 ? Math.round(monthTotalAmt / monthSaved) : 0;

  // Use the viewed month's completed days for the progress circle
  const streakForCircle = monthSaved; 
  const circleOffset = 502 - (502 * Math.min(streakForCircle, daysInMonth) / daysInMonth);

  let calendarCells = '';
  dayNames.forEach(d => { calendarCells += `<div class="text-center text-xs font-bold text-text-muted uppercase tracking-widest pb-4">${d}</div>`; });
  for (let i = 0; i < firstDay; i++) calendarCells += `<div></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const chDay = chDays[d - 1];
    
    // The "Current" highlight should only appear in the active current real-world month
    const isCurrentRealMonth = today.getMonth() === month && today.getFullYear() === year;
    const isCurrentStep = isCurrentRealMonth && (d === chDays.length + 1);

    if (chDay && chDay.status === "saved") {
      calendarCells += `<div class="cal-cell cal-saved"><span class="material-symbols-outlined text-success text-lg">check_circle</span><p class="text-[10px] font-medium">${d}</p><p class="font-mono text-[9px] text-success">${fmtShort(chDay.amount)}</p></div>`;
    } else if (chDay && chDay.status === "skipped") {
      calendarCells += `<div class="cal-cell cal-skipped"><span class="material-symbols-outlined text-error text-lg">close</span><p class="text-[10px] font-medium">${d}</p><p class="font-mono text-[9px] text-text-muted">Skipped</p></div>`;
    } else if (isCurrentStep) {
      calendarCells += `<div class="cal-cell cal-today"><p class="font-headline font-bold text-lg">${d}</p><p class="font-mono text-[10px] text-gold">Current</p></div>`;
    } else {
      calendarCells += `<div class="cal-cell cal-future"><p class="font-headline font-bold text-lg text-text-muted/40">${d}</p></div>`;
    }
  }

  // Monthly summary — shows for past months OR if the viewed month's challenge is fully complete!
  let monthlySummaryHTML = "";
  const isPastMonth = (year < today.getFullYear()) || (year === today.getFullYear() && month < today.getMonth());
  const isChallengeComplete = chDays.length >= daysInMonth;
  
  if (isPastMonth || isChallengeComplete) {
    const grade = monthCompletionPct >= 90 ? { label: "🏆 Excellent!", color: "#00E676" }
          : monthCompletionPct >= 70 ? { label: "🌟 Great Job!", color: "#00D2FF" }
          : monthCompletionPct >= 50 ? { label: "👍 Good Effort", color: "#FFB800" }
                : monthCompletionPct >= 25 ? { label: "💪 Keep Going", color: "#FF9F43" }
                :                            { label: "🔥 Start Fresh", color: "#FF4757" };

    monthlySummaryHTML = `
    <section class="card bg-gradient-to-br from-gold/5 to-accent-secondary/5 border-gold/20 recommend-card">
      <div class="flex items-center gap-3 mb-6">
        <span class="material-symbols-outlined text-gold filled text-[28px]">emoji_events</span>
        <div><h2 class="font-headline text-xl font-bold">${MONTH_NAMES[month]} ${year} Summary</h2><p class="text-sm text-text-muted">Your saving challenge results</p></div>
      </div>
      <div class="flex items-center gap-8 mb-6">
        <div class="relative w-[120px] h-[120px] flex items-center justify-center flex-shrink-0">
          <svg class="absolute inset-0 w-full h-full -rotate-90"><circle cx="60" cy="60" r="50" fill="transparent" stroke="#242438" stroke-width="8"/><circle cx="60" cy="60" r="50" fill="transparent" stroke="${grade.color}" stroke-dasharray="314" stroke-dashoffset="${314 - (314 * monthCompletionPct / 100)}" stroke-linecap="round" stroke-width="8"/></svg>
          <div class="text-center z-10"><p class="font-headline font-bold text-2xl">${monthCompletionPct}%</p></div>
        </div>
        <div class="flex-1 space-y-3">
          <p class="text-lg font-semibold" style="color:${grade.color}">${grade.label}</p>
          <p class="text-sm text-text-secondary">You saved on <strong class="text-text-primary">${monthSaved} out of ${daysInMonth} days</strong> this month${monthSkipped > 0 ? ` and skipped ${monthSkipped} day${monthSkipped > 1 ? 's' : ''}` : ''}.</p>
        </div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="bg-surface-container-low/50 rounded-xl p-4 text-center"><p class="text-[10px] text-text-muted uppercase tracking-wider mb-1">Total Saved</p><p class="font-mono text-xl font-bold text-success">${fmt(monthTotalAmt)}</p></div>
        <div class="bg-surface-container-low/50 rounded-xl p-4 text-center"><p class="text-[10px] text-text-muted uppercase tracking-wider mb-1">Days Saved</p><p class="font-headline text-xl font-bold text-gold">${monthSaved}/${daysInMonth}</p></div>
        <div class="bg-surface-container-low/50 rounded-xl p-4 text-center"><p class="text-[10px] text-text-muted uppercase tracking-wider mb-1">Avg / Day</p><p class="font-mono text-xl font-bold text-accent-primary">${fmt(monthAvgPerDay)}</p></div>
        <div class="bg-surface-container-low/50 rounded-xl p-4 text-center"><p class="text-[10px] text-text-muted uppercase tracking-wider mb-1">Completion</p><p class="font-headline text-xl font-bold" style="color:${grade.color}">${monthCompletionPct}%</p></div>
      </div>
      <div class="mt-4 progress-track"><div class="progress-fill" style="width:${monthCompletionPct}%;background:${grade.color}"></div></div>
      <p class="text-xs text-text-muted mt-2 text-center">${monthSaved} saved · ${monthSkipped} skipped · ${monthPending} ${isPastMonth ? 'missed' : 'remaining'}</p>
    </section>`;
  }

  el.innerHTML = `
  <section class="relative overflow-hidden bg-gradient-to-br from-surface-container-low to-gold/5 border border-gold/20 rounded-[20px] p-10 flex flex-col md:flex-row items-center justify-between gap-12">
    <div class="flex-1 space-y-6">
      <span class="pill bg-gold/15 text-gold text-[12px] tracking-[0.1em] uppercase">${daysInMonth}-DAY SAVING CHALLENGE</span>
      <h1 class="font-clash text-5xl font-bold leading-tight">Your Daily<br/>Saving Mission</h1>
      <div class="flex items-center gap-4 pt-4">
        <button onclick="acceptChallenge()" class="btn-success h-12 px-8 font-bold rounded-xl">I Saved It! <span class="material-symbols-outlined">check</span></button>
        <button onclick="generateNewAmount()" class="btn-ghost h-12">Generate New Amount</button>
        <button onclick="skipChallenge()" class="text-text-muted hover:text-text-secondary transition-colors font-semibold">Skip Today</button>
      </div>
    </div>
    <div class="flex flex-col items-center gap-6">
      <div class="relative w-[200px] h-[200px] flex items-center justify-center">
        <svg class="absolute inset-0 w-full h-full -rotate-90"><circle cx="100" cy="100" r="80" fill="transparent" stroke="#242438" stroke-width="10"/><circle cx="100" cy="100" r="80" fill="transparent" stroke="url(#chGrad)" stroke-dasharray="502" stroke-dashoffset="${circleOffset}" stroke-linecap="round" stroke-width="10"/><defs><linearGradient id="chGrad" x1="0" x2="200" y1="0" y2="200"><stop stop-color="#00D2FF"/><stop offset="1" stop-color="#6C5CE7"/></linearGradient></defs></svg>
        <div class="text-center z-10"><p class="font-headline font-bold text-3xl">Day ${Math.min(chDays.length, daysInMonth)}</p><p class="text-text-muted text-sm">of ${daysInMonth}</p></div>
      </div>
      <div class="text-center"><p class="text-sm text-text-muted mb-1">Today's Amount</p><p class="font-clash text-6xl font-bold text-accent-secondary text-glow-cyan">${fmt(ch.todayAmount)}</p></div>
    </div>
  </section>
  <section class="card"><div class="flex justify-between items-center"><h2 class="font-headline text-xl font-semibold">Challenge Range</h2><span class="font-mono text-sm text-text-secondary">Min: ${fmtShort(ch.minAmount)} — Max: ${fmtShort(ch.maxAmount)}</span></div>
    <div class="mt-6 space-y-6">
      <div><label class="input-label mb-2">Minimum Amount</label><div class="flex gap-4 items-center"><span class="font-mono text-sm text-text-muted w-16">₱0</span><div class="range-wrapper"><span id="range-min-tooltip" class="range-value-tooltip" style="left:${(ch.minAmount/challengeRangeMax)*100}%">${fmtShort(ch.minAmount)}</span><input type="range" min="0" max="${challengeRangeMax}" value="${ch.minAmount}" class="w-full" oninput="updateRangeTooltip('min',this.value)" onchange="updateChallengeMin(this.value)"/></div><span class="font-mono text-sm text-text-muted w-16 text-right">${fmtShort(challengeRangeMax)}</span></div></div>
      <div><label class="input-label mb-2">Maximum Amount</label><div class="flex gap-4 items-center"><span class="font-mono text-sm text-text-muted w-16">₱0</span><div class="range-wrapper"><span id="range-max-tooltip" class="range-value-tooltip" style="left:${(ch.maxAmount/challengeRangeMax)*100}%">${fmtShort(ch.maxAmount)}</span><input type="range" min="0" max="${challengeRangeMax}" value="${ch.maxAmount}" class="w-full" oninput="updateRangeTooltip('max',this.value)" onchange="updateChallengeMax(this.value)"/></div><span class="font-mono text-sm text-text-muted w-16 text-right">${fmtShort(challengeRangeMax)}</span></div></div>
    </div>
    <button onclick="setAmountFromRange()" class="btn-primary mt-6 w-full justify-center h-12"><span class="material-symbols-outlined text-[18px]">tune</span>Set the Amount</button>
  </section>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
    <div class="stat-card flex items-center justify-between"><div><p class="stat-label">Total Saved</p><p class="font-mono text-3xl font-bold text-success">${fmt(savedTotal)}</p></div><div class="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center"><span class="material-symbols-outlined text-success">savings</span></div></div>
    <div class="stat-card flex items-center justify-between border-l-4 border-gold"><div><p class="stat-label">Current Streak</p><p class="font-headline text-3xl font-bold text-gold">${ch.currentStreak} days</p></div><div class="w-12 h-12 rounded-full bg-gold/10 flex items-center justify-center"><span class="material-symbols-outlined text-gold filled">local_fire_department</span></div></div>
    <div class="stat-card flex items-center justify-between"><div><p class="stat-label">Best Streak</p><p class="font-headline text-3xl font-bold text-accent-primary">${ch.bestStreak} days</p></div><div class="w-12 h-12 rounded-full bg-accent-primary/10 flex items-center justify-center"><span class="material-symbols-outlined text-accent-primary">military_tech</span></div></div>
  </div>
  ${monthlySummaryHTML}
  <section class="card">
    <div class="flex items-center justify-between mb-6">
      <button onclick="challengeNavMonth(-1)" class="p-2 text-text-muted hover:text-text-primary transition-colors rounded-lg hover:bg-surface-container-low"><span class="material-symbols-outlined text-[20px]">chevron_left</span></button>
      <h2 class="font-headline text-2xl font-bold">${MONTH_NAMES[month]} ${year}</h2>
      <button onclick="challengeNavMonth(1)" class="p-2 text-text-muted hover:text-text-primary transition-colors rounded-lg hover:bg-surface-container-low"><span class="material-symbols-outlined text-[20px]">chevron_right</span></button>
    </div>
    <div class="grid grid-cols-7 gap-4">${calendarCells}</div>
  </section>`;
}

// ============== CHALLENGE ACTIONS ==============
function acceptChallenge() {
  const ch = state.challenge;
  if (ch.days.length >= 30) {
    showChallengeToast("Challenge complete! Great job!", 7500);
    return;
  }

  const todayDate = new Date().toISOString().split("T")[0];
  const savedAmount = ch.todayAmount;
  
  ch.days.push({ date: todayDate, amount: savedAmount, status: "saved" });
  
  // Recalculate streak
  let streak = 0;
  for (let i = ch.days.length - 1; i >= 0; i--) {
    if (ch.days[i].status === "saved") {
      streak++;
    } else {
      break;
    }
  }
  ch.currentStreak = streak;
  if (ch.currentStreak > ch.bestStreak) ch.bestStreak = ch.currentStreak;
  
  // Generate new amount for next interaction
  ch.todayAmount = randomChallengeAmount();
  saveState();
  showChallengeToast(`Saved ${fmt(savedAmount)} today! 🎉 Streak: ${ch.currentStreak}`, 7500);
  renderChallenge();
  if (document.getElementById("page-dashboard") && !document.getElementById("page-dashboard").classList.contains("hidden")) renderDashboard();
}

function skipChallenge() {
  const ch = state.challenge;
  if (ch.days.length >= 30) {
    showChallengeToast("Challenge complete! Excellent effort.", 7500);
    return;
  }

  const todayDate = new Date().toISOString().split("T")[0];
  
  ch.days.push({ date: todayDate, amount: 0, status: "skipped" });
  ch.currentStreak = 0;
  
  saveState();
  showChallengeToast("Skipped this challenge step. Current streak reset to 0. 💪", 7500);
  renderChallenge();
}

function generateNewAmount() {
  state.challenge.todayAmount = randomChallengeAmount();
  saveState();
  renderChallenge();
}

function setAmountFromRange() {
  state.challenge.todayAmount = randomChallengeAmount();
  saveState();
  showChallengeToast(`New challenge amount set: ${fmt(state.challenge.todayAmount)}`, 4500);
  renderChallenge();
}

function randomChallengeAmount() {
  const ch = state.challenge;
  const min = ch.minAmount || 1;
  const max = ch.maxAmount || (getProfileType() === "standard" ? 5000 : 1000);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function updateChallengeMin(val) {
  const v = parseInt(val);
  state.challenge.minAmount = v;
  if (v > state.challenge.maxAmount) state.challenge.maxAmount = v;
  saveState();
}

function updateChallengeMax(val) {
  const v = parseInt(val);
  state.challenge.maxAmount = v;
  if (v < state.challenge.minAmount) state.challenge.minAmount = v;
  saveState();
}

function updateRangeTooltip(type, val) {
  const tooltip = document.getElementById(`range-${type}-tooltip`);
  const challengeRangeMax = getProfileType() === "standard" ? 5000 : 1000;
  if (tooltip) {
    tooltip.textContent = fmtShort(parseInt(val));
    tooltip.style.left = `${(parseInt(val) / challengeRangeMax) * 100}%`;
  }
}

function showToast(msg, type) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "fixed top-6 right-6 z-[9999] flex flex-col gap-3";
    document.body.appendChild(container);
  }
  const colors = { success: "bg-success", warning: "bg-warning", error: "bg-error", info: "bg-accent-primary" };
  const toast = document.createElement("div");
  toast.className = `${colors[type] || colors.info} text-white px-6 py-3 rounded-xl shadow-lg font-medium text-sm flex items-center gap-2 animate-slide-in`;
  toast.style.cssText = "animation: recommendSlideIn 0.3s ease both;";
  toast.innerHTML = `<span class="material-symbols-outlined text-[18px]">notifications</span>${msg}`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = "0"; toast.style.transform = "translateX(100px)"; toast.style.transition = "all 0.3s ease"; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ============== ANALYTICS ==============
let analyticsTab = "spending";
let analyticsMonth = new Date().getMonth();
let analyticsYear = new Date().getFullYear();
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function analyticsNavMonth(dir) {
  analyticsMonth += dir;
  if (analyticsMonth > 11) { analyticsMonth = 0; analyticsYear++; }
  if (analyticsMonth < 0) { analyticsMonth = 11; analyticsYear--; }
  renderAnalytics();
}
function setAnalyticsTab(tab, btn) {
  analyticsTab = tab;
  renderAnalytics();
}

function buildCalendarHTML() {
  const year = analyticsYear, month = analyticsMonth;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  let html = `<div class="card"><div class="flex items-center justify-between mb-4">
    <button onclick="analyticsNavMonth(-1)" class="p-2 text-text-muted hover:text-text-primary transition-colors rounded-lg hover:bg-surface-container-low"><span class="material-symbols-outlined text-[20px]">chevron_left</span></button>
    <h3 class="font-headline font-semibold text-lg">${MONTH_NAMES[month]} ${year}</h3>
    <button onclick="analyticsNavMonth(1)" class="p-2 text-text-muted hover:text-text-primary transition-colors rounded-lg hover:bg-surface-container-low"><span class="material-symbols-outlined text-[20px]">chevron_right</span></button>
  </div>
  <div class="grid grid-cols-7 gap-1">`;
  dayNames.forEach(d => { html += `<div class="text-center text-[10px] font-bold text-text-muted uppercase tracking-wider py-2">${d}</div>`; });
  for (let i = 0; i < firstDay; i++) html += `<div></div>`;
  
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const dayTx = state.transactions.filter(t => t.date === dateStr);
    const daySpent = dayTx.filter(t => t.type === "expense").reduce((s,t) => s + t.amount, 0);
    const daySavedChallenge = state.challenge.days.filter(cd => cd.date === dateStr && cd.status === "saved").reduce((s,cd) => s + cd.amount, 0);
    const isToday = today.getDate() === d && today.getMonth() === month && today.getFullYear() === year;
    const hasActivity = dayTx.length > 0 || daySavedChallenge > 0;
    let cls = "rounded-lg p-1 text-center cursor-pointer transition-colors min-h-[48px] flex flex-col items-center justify-center hover:bg-accent-primary/10 ";
    if (isToday) cls += "border-2 border-gold bg-gold/5 ";
    else if (hasActivity) cls += "bg-surface-container-low ";
    html += `<div class="${cls}" onclick="showDayDetail('${dateStr}')"><span class="text-xs font-medium ${isToday ? 'text-gold font-bold' : ''}">${d}</span>`;
    if (daySpent > 0) html += `<span class="font-mono text-[9px] text-error mt-0.5">-${fmtShort(daySpent)}</span>`;
    if (daySavedChallenge > 0) html += `<span class="font-mono text-[9px] text-success mt-0.5">+${fmtShort(daySavedChallenge)}</span>`;
    html += `</div>`;
  }
  html += `</div></div>`;
  return html;
}

function showDayDetail(dateStr) {
  const dayTx = state.transactions.filter(t => t.date === dateStr);
  const dayIncome = dayTx.filter(t => t.type === "income");
  const dayExpenses = dayTx.filter(t => t.type === "expense");
  const incomeTotal = dayIncome.reduce((s,t) => s + t.amount, 0);
  const expenseTotal = dayExpenses.reduce((s,t) => s + t.amount, 0);
  
  const challengeDay = state.challenge.days.find(cd => cd.date === dateStr);
  
  const challengeSaved = challengeDay && challengeDay.status === "saved" ? challengeDay.amount : 0;
  const net = incomeTotal - expenseTotal + challengeSaved;
  const d = new Date(dateStr);
  const dateLabel = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  let txRows = '';
  if (dayIncome.length > 0) {
    txRows += `<div class="mb-4"><p class="text-[11px] font-bold text-text-muted uppercase tracking-widest mb-2">Income</p>`;
    dayIncome.forEach(t => {
      txRows += `<div class="flex items-center justify-between py-2"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full flex items-center justify-center" style="background:${CAT_COLORS[t.category]}15;color:${CAT_COLORS[t.category]}"><span class="material-symbols-outlined text-[16px]">${CAT_ICONS[t.category]||"payments"}</span></div><div><p class="text-sm font-medium">${t.description}</p><p class="text-[11px] text-text-muted">${t.category}</p></div></div><span class="font-mono text-sm font-semibold text-success">+${fmt(t.amount)}</span></div>`;
    });
    txRows += `</div>`;
  }
  if (dayExpenses.length > 0) {
    txRows += `<div class="mb-4"><p class="text-[11px] font-bold text-text-muted uppercase tracking-widest mb-2">Expenses</p>`;
    dayExpenses.forEach(t => {
      txRows += `<div class="flex items-center justify-between py-2"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full flex items-center justify-center" style="background:${CAT_COLORS[t.category]}15;color:${CAT_COLORS[t.category]}"><span class="material-symbols-outlined text-[16px]">${CAT_ICONS[t.category]||"more_horiz"}</span></div><div><p class="text-sm font-medium">${t.description}</p><p class="text-[11px] text-text-muted">${t.category}</p></div></div><span class="font-mono text-sm font-semibold text-error">-${fmt(t.amount)}</span></div>`;
    });
    txRows += `</div>`;
  }
  if (challengeSaved > 0) {
    txRows += `<div class="mb-4"><p class="text-[11px] font-bold text-text-muted uppercase tracking-widest mb-2">Saving Challenge</p><div class="flex items-center justify-between py-2"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-gold/10 flex items-center justify-center text-gold"><span class="material-symbols-outlined text-[16px] filled">workspace_premium</span></div><div><p class="text-sm font-medium">Daily Challenge Saved</p><p class="text-[11px] text-text-muted">Streak reward</p></div></div><span class="font-mono text-sm font-semibold text-success">+${fmt(challengeSaved)}</span></div></div>`;
  }
  if (!txRows) {
    txRows = `<div class="text-center py-8"><span class="material-symbols-outlined text-[40px] text-text-muted/40 mb-2">event_busy</span><p class="text-text-muted">No activity on this day</p></div>`;
  }

  showModal(`<div class="flex justify-between items-start mb-6">
    <div><h2 class="text-xl font-bold font-headline">Daily Summary</h2><p class="text-sm text-text-muted mt-1">${dateLabel}</p></div>
    <button onclick="hideModal()" class="text-text-muted hover:text-text-primary"><span class="material-symbols-outlined">close</span></button>
  </div>
  <div class="grid grid-cols-3 gap-3 mb-6">
    <div class="bg-surface-container-low rounded-xl p-3 text-center"><p class="text-[10px] text-text-muted uppercase tracking-wider">Income</p><p class="font-mono text-lg font-bold text-success">${fmt(incomeTotal)}</p></div>
    <div class="bg-surface-container-low rounded-xl p-3 text-center"><p class="text-[10px] text-text-muted uppercase tracking-wider">Expenses</p><p class="font-mono text-lg font-bold text-error">${fmt(expenseTotal)}</p></div>
    <div class="bg-surface-container-low rounded-xl p-3 text-center"><p class="text-[10px] text-text-muted uppercase tracking-wider">Saved</p><p class="font-mono text-lg font-bold text-gold">${fmt(challengeSaved)}</p></div>
  </div>
  <div class="divide-y divide-surface-container-low">${txRows}</div>
  <div class="mt-4 pt-4 border-t border-border-default flex justify-between items-center">
    <span class="text-sm font-semibold">Net for this day</span>
    <span class="font-mono text-lg font-bold ${net >= 0 ? 'text-success' : 'text-error'}">${net >= 0 ? '+' : ''}${fmt(net)}</span>
  </div>`);
}

function renderAnalytics() {
  const el = document.getElementById("page-analytics");
  const goals = state.savingsGoals;
  const ts = goals.reduce((s,g) => s + g.target, 0);
  const ss = goals.reduce((s,g) => s + g.saved, 0);
  const ch = state.challenge;
  const chSaved = ch.days.filter(d => d.status === "saved").reduce((s,d) => s + d.amount, 0);

  const tabBtnClass = (t) => analyticsTab === t ? "seg-btn active" : "seg-btn";

  let spendingContent = `
  <div class="card"><h3 class="font-headline font-semibold text-lg mb-4">Spending Trend</h3><canvas id="trendChart" height="120"></canvas></div>
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-12 lg:col-span-6 card"><h3 class="font-headline font-semibold text-lg mb-4">Spending by Category</h3><canvas id="catChart" height="200"></canvas></div>
    <div class="col-span-12 lg:col-span-6 card"><h3 class="font-headline font-semibold text-lg mb-4">Daily Average</h3><canvas id="avgChart" height="200"></canvas></div>
  </div>`;

  let savingsContent = `
  <!-- Savings Summary Cards -->
  <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
    <div class="stat-card"><span class="stat-label">Total Saved (Goals)</span><span class="stat-value text-success">${fmt(ss)}</span></div>
    <div class="stat-card"><span class="stat-label">Challenge Saved</span><span class="stat-value text-gold">${fmt(chSaved)}</span></div>
    <div class="stat-card"><span class="stat-label">Combined Savings</span><span class="stat-value text-accent-secondary">${fmt(ss + chSaved)}</span></div>
    <div class="stat-card"><span class="stat-label">Savings Rate</span><span class="stat-value text-accent-primary">${savingsRate()}%</span></div>
  </div>
  <!-- Goal Progress -->
  <div class="card">
    <h3 class="font-headline font-semibold text-lg mb-6">Goal Progress</h3>
    <div class="space-y-5">${goals.map(g => `
      <div>
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background:${g.color}15;color:${g.color}"><span class="material-symbols-outlined text-[18px]">${g.icon}</span></div>
            <span class="font-semibold text-sm">${g.name}</span>
          </div>
          <span class="font-mono text-sm" style="color:${g.color}">${pct(g.saved,g.target)}%</span>
        </div>
        <div class="progress-track h-3">
          <div class="progress-fill" style="width:${pct(g.saved,g.target)}%;background:${g.color}"></div>
        </div>
        <div class="flex justify-between mt-1">
          <span class="font-mono text-[11px] text-text-muted">${fmt(g.saved)} saved</span>
          <span class="font-mono text-[11px] text-text-muted">${fmt(g.target)} target</span>
        </div>
      </div>`).join("")}
    </div>
  </div>
  <!-- Savings Charts -->
  <div class="grid grid-cols-12 gap-6">
    <div class="col-span-12 lg:col-span-6 card">
      <h3 class="font-headline font-semibold text-lg mb-4">Savings vs Spending</h3>
      <canvas id="savingsVsSpendingChart" height="200"></canvas>
    </div>
    <div class="col-span-12 lg:col-span-6 card">
      <h3 class="font-headline font-semibold text-lg mb-4">Challenge Savings Trend</h3>
      <canvas id="challengeTrendChart" height="200"></canvas>
    </div>
  </div>
  <!-- Savings Breakdown Donut -->
  <div class="card">
    <h3 class="font-headline font-semibold text-lg mb-4">Savings Breakdown</h3>
    <div class="flex items-center gap-8">
      <div><canvas id="savingsDonut" width="200" height="200"></canvas></div>
      <div class="space-y-3">
        ${goals.map(g => `<div class="flex items-center gap-3"><div class="w-3 h-3 rounded-full" style="background:${g.color}"></div><span class="text-sm">${g.name}</span><span class="font-mono text-sm text-text-muted">${fmt(g.saved)}</span></div>`).join("")}
        <div class="flex items-center gap-3"><div class="w-3 h-3 rounded-full bg-gold"></div><span class="text-sm">Daily Challenge</span><span class="font-mono text-sm text-text-muted">${fmt(chSaved)}</span></div>
      </div>
    </div>
  </div>`;

  const tabContent = analyticsTab === "spending" ? spendingContent : savingsContent;

  el.innerHTML = `
  <div class="flex justify-between items-end">
    <h1 class="text-[28px] font-bold font-headline">Analytics</h1>
    <div class="seg-control">
      <button class="${tabBtnClass("spending")}" onclick="setAnalyticsTab('spending',this)"><span class="material-symbols-outlined text-[16px] mr-1">monitoring</span>Spending</button>
      <button class="${tabBtnClass("savings")}" onclick="setAnalyticsTab('savings',this)"><span class="material-symbols-outlined text-[16px] mr-1">savings</span>Savings</button>
    </div>
  </div>
  <!-- Calendar Navigator -->
  ${buildCalendarHTML()}
  <!-- Tab Content -->
  ${tabContent}
  <!-- Smart Insights (always visible) -->
  <div class="card bg-gradient-to-br from-surface to-accent-primary/[0.03]"><div class="flex items-center gap-2 mb-4"><span class="material-symbols-outlined text-gold filled">auto_awesome</span><h3 class="font-headline font-semibold text-lg">Smart Insights</h3></div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="stat-card flex items-start gap-3"><span class="material-symbols-outlined text-success">trending_down</span><div><p class="text-sm font-semibold">Food spending decreased 15%</p><p class="text-xs text-text-muted mt-1">Great job managing your food budget this week!</p></div></div>
      <div class="stat-card flex items-start gap-3"><span class="material-symbols-outlined text-accent-secondary">rocket_launch</span><div><p class="text-sm font-semibold">iPhone 16 goal on track</p><p class="text-xs text-text-muted mt-1">At this rate, you'll reach it by December 2026</p></div></div>
      <div class="stat-card flex items-start gap-3"><span class="material-symbols-outlined text-warning">warning</span><div><p class="text-sm font-semibold">Transport costs rising</p><p class="text-xs text-text-muted mt-1">Transport is your fastest-growing expense category</p></div></div>
    </div>
  </div>`;
  setTimeout(renderAnalyticsCharts, 100);
}

function renderAnalyticsCharts() {
  if (analyticsTab === "spending") {
    const tc = document.getElementById("trendChart");
    if (tc) new Chart(tc, { type: "line", data: { labels: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], datasets: [{ label: "Spending", data: [300,450,640,250,400,600,350], borderColor: "#00D2FF", backgroundColor: "rgba(0,210,255,0.1)", fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: "#00D2FF" }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { grid: { color: "#1A1A2E" }, ticks: { color: "#6B6B85", callback: v => fmtShort(v) } }, x: { grid: { display: false }, ticks: { color: "#6B6B85" } } } } });
    const cc = document.getElementById("catChart");
    const catTotals = {}; state.transactions.filter(t => t.type === "expense").forEach(t => { catTotals[t.category] = (catTotals[t.category]||0) + t.amount; });
    if (cc) new Chart(cc, { type: "doughnut", data: { labels: Object.keys(catTotals), datasets: [{ data: Object.values(catTotals), backgroundColor: Object.keys(catTotals).map(c => CAT_COLORS[c]||"#6B6B85"), borderWidth: 0 }] }, options: { cutout: "65%", plugins: { legend: { position: "right", labels: { color: "#A0A0B8", usePointStyle: true, pointStyle: "circle" } } } } });
    const ac = document.getElementById("avgChart");
    if (ac) new Chart(ac, { type: "bar", data: { labels: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], datasets: [{ data: [300,450,640,250,400,600,350], backgroundColor: "rgba(0,210,255,0.6)", borderRadius: 6 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { grid: { color: "#1A1A2E" }, ticks: { color: "#6B6B85" } }, x: { grid: { display: false }, ticks: { color: "#6B6B85" } } } } });
  } else {
    // Savings vs Spending bar chart
    const svsC = document.getElementById("savingsVsSpendingChart");
    if (svsC) new Chart(svsC, { type: "bar", data: { labels: ["Jan","Feb","Mar"], datasets: [
      { label: "Spending", data: [4200, 3800, totalExpenses()], backgroundColor: "rgba(255,82,82,0.6)", borderRadius: 6 },
      { label: "Savings", data: [2800, 3200, totalSaved()], backgroundColor: "rgba(0,230,118,0.6)", borderRadius: 6 }
    ]}, options: { responsive: true, plugins: { legend: { labels: { color: "#A0A0B8", usePointStyle: true, pointStyle: "circle" } } }, scales: { y: { grid: { color: "#1A1A2E" }, ticks: { color: "#6B6B85" } }, x: { grid: { display: false }, ticks: { color: "#6B6B85" } } } } });

    // Challenge trend line chart
    const ctC = document.getElementById("challengeTrendChart");
    const chDays = state.challenge.days.filter(d => d.status === "saved");
    const chLabels = chDays.map((d,i) => "Day " + (i+1));
    const chData = chDays.map(d => d.amount);
    let cumulative = 0; const chCumulative = chDays.map(d => { cumulative += d.amount; return cumulative; });
    if (ctC) new Chart(ctC, { type: "line", data: { labels: chLabels, datasets: [
      { label: "Cumulative", data: chCumulative, borderColor: "#00D2FF", backgroundColor: "rgba(0,210,255,0.1)", fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: "#00D2FF" },
    ]}, options: { responsive: true, plugins: { legend: { labels: { color: "#A0A0B8" } } }, scales: { y: { grid: { color: "#1A1A2E" }, ticks: { color: "#6B6B85", callback: v => fmtShort(v) } }, x: { grid: { display: false }, ticks: { color: "#6B6B85", maxTicksLimit: 8 } } } } });

    // Savings donut
    const sd = document.getElementById("savingsDonut");
    const goalNames = state.savingsGoals.map(g => g.name);
    const goalSaved = state.savingsGoals.map(g => g.saved);
    const goalColors = state.savingsGoals.map(g => g.color);
    const chSavedTotal = state.challenge.days.filter(d => d.status === "saved").reduce((s,d) => s + d.amount, 0);
    goalNames.push("Daily Challenge"); goalSaved.push(chSavedTotal); goalColors.push("#00D2FF");
    if (sd) new Chart(sd, { type: "doughnut", data: { labels: goalNames, datasets: [{ data: goalSaved, backgroundColor: goalColors, borderWidth: 0 }] }, options: { cutout: "65%", plugins: { legend: { display: false } } } });
  }
}

// ============== SETTINGS ==============
function renderSettings() {
  const el = document.getElementById("page-settings");
  const isDark = document.documentElement.classList.contains("dark");
  el.innerHTML = `
  <h1 class="text-[28px] font-bold font-headline">Settings</h1>
  <div class="max-w-[720px] space-y-6">
    <div class="card"><h3 class="font-headline font-semibold text-lg mb-4">Appearance</h3>
      <div class="flex items-center justify-between"><span>Dark Mode</span><div class="toggle-track ${isDark?"active":""}" onclick="toggleTheme()"><div class="toggle-thumb"></div></div></div></div>
    <div class="card"><h3 class="font-headline font-semibold text-lg mb-4">Profile</h3>
      <label class="input-label">Name</label><input class="input-field w-full" value="${state.profile.name}" onchange="state.profile.name=this.value;saveState();updateNames()"/>
      <label class="input-label mt-4">Account Type</label>
      <select class="input-field w-full" onchange="changeProfileType(this.value)">
        <option value="student" ${getProfileType()==="student"?"selected":""}>Student</option>
        <option value="standard" ${getProfileType()==="standard"?"selected":""}>Standard</option>
      </select>
      <p class="text-xs text-text-muted mt-2">Changing account type updates goals and budget defaults for that profile.</p>
    </div>
    <div class="card"><h3 class="font-headline font-semibold text-lg mb-4">Budget Rule</h3>
      <div class="flex gap-4">${["50-30-20","60-20-20","70-20-10"].map(r => `<label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="rule" value="${r}" ${state.settings.budgetRule===r?"checked":""} onchange="state.settings.budgetRule=this.value;saveState();" class="accent-accent-primary"/><span class="text-sm">${r.replace(/-/g,"/")}</span></label>`).join("")}</div></div>
    <div class="card"><h3 class="font-headline font-semibold text-lg mb-4">Data Management</h3>
      <div class="flex flex-wrap gap-4"><button class="btn-ghost" onclick="exportData()"><span class="material-symbols-outlined text-[18px]">download</span>Export Data</button>
      <button class="btn-ghost" onclick="restoreBackup()"><span class="material-symbols-outlined text-[18px] text-success">settings_backup_restore</span>Restore Backup</button>
      <button class="btn-ghost btn-danger" onclick="resetData()"><span class="material-symbols-outlined text-[18px]">warning</span>Reset All Data</button></div>
      <p class="text-xs text-error mt-3">Reset will permanently delete all your data.</p></div>
  </div>`;
}

// ============== ACTIONS ==============
function toggleTheme() {
  const html = document.documentElement;
  html.classList.toggle("dark");
  state.settings.theme = html.classList.contains("dark") ? "dark" : "light";
  const themeIcon = document.getElementById("theme-icon");
  if (themeIcon) {
    themeIcon.textContent = state.settings.theme === "dark" ? "dark_mode" : "light_mode";
  }
  saveState(); if (currentPage === "settings") renderSettings();
}

function updateNames() {
  document.getElementById("topbar-name").textContent = state.profile.name;
  document.getElementById("sidebar-name").textContent = state.profile.name;
  const roleEl = document.getElementById("sidebar-role");
  if (roleEl) roleEl.textContent = getProfileLabel();
  syncProfileTypeControls();
}

function syncProfileTypeControls() {
  const profileType = getProfileType();
  const topbarSelect = document.getElementById("topbar-profile-type");
  if (topbarSelect) topbarSelect.value = profileType;
}

function changeProfileType(profileType) {
  const normalized = normalizeProfileType(profileType);
  if (!normalized) return;
  if (normalized === activeProfileType) return;
  saveState();
  loadStateForProfile(normalized);
  updateNames();
  renderPage(currentPage);
}
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `budgetit_data_${activeProfileType}.json`; a.click();
}
function resetData() {
  if (confirm("Are you sure? This will delete ALL your data.")) {
    localStorage.removeItem(storageKeyForProfile("student"));
    localStorage.removeItem(storageKeyForProfile("standard"));
    localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
    location.reload();
  }
}

function restoreBackup() {
  const backupData = {
    profile: { name: "Eunice", type: activeProfileType, role: getProfileLabel(), initialized: true },
    monthlyIncome: 14999,
    settings: { theme: "dark", budgetRule: "50-30-20", currency: "PHP" },
    transactions: [
      { id: 1, date: "2026-03-23", type: "expense", amount: 55, category: "Food", description: "Coffee — 7-Eleven" },
      { id: 2, date: "2026-03-24", type: "income", amount: 500, category: "Income", description: "Allowance" },
      { id: 3, date: "2026-03-24", type: "expense", amount: 245, category: "School", description: "School Supplies" },
      { id: 4, date: "2026-03-25", type: "expense", amount: 13, category: "Transport", description: "Jeepney Fare" },
      { id: 5, date: "2026-03-25", type: "expense", amount: 189, category: "Food", description: "Lunch — Jollibee" },
      { id: 6, date: "2026-03-25", type: "expense", amount: 20, category: "Food", description: "fishball" }
    ],
    savingsGoals: [
      { id: 1, name: "iPhone 15", icon: "smartphone", color: "#00D2FF", target: 60000, saved: 5200 },
      { id: 2, name: "Baguio Trip", icon: "flight_takeoff", color: "#FFB800", target: 5000, saved: 1200 }
    ],
    challenge: {
      minAmount: 0, maxAmount: 1000, todayAmount: 47,
      currentStreak: 0, bestStreak: 0,
      months: {}
    }
  };
  localStorage.setItem(storageKeyForProfile(activeProfileType), JSON.stringify(backupData));
  alert("Data successfully restored from Mar 27 backup!");
  location.reload();
}

// ============== MODALS ==============
let modalCloseTimer = null;

function showModal(html) {
  const overlay = document.getElementById("modal-overlay");
  if (modalCloseTimer) {
    clearTimeout(modalCloseTimer);
    modalCloseTimer = null;
  }
  document.getElementById("modal-content").innerHTML = html;
  overlay.classList.remove("hidden");
  overlay.classList.remove("modal-animate-out");
  overlay.classList.remove("modal-animate-in");
  void overlay.offsetWidth; // force reflow
  overlay.classList.add("modal-animate-in");
}
function hideModal() {
  const overlay = document.getElementById("modal-overlay");
  if (overlay.classList.contains("hidden") || overlay.classList.contains("modal-animate-out")) return;
  overlay.classList.remove("modal-animate-in");
  overlay.classList.add("modal-animate-out");
  modalCloseTimer = setTimeout(() => {
    overlay.classList.add("hidden");
    overlay.classList.remove("modal-animate-out");
    modalCloseTimer = null;
  }, 220);
}
document.getElementById("modal-overlay").addEventListener("click", e => { if (e.target === e.currentTarget) hideModal(); });

function showGoalModal() {
  showModal(`<div class="flex justify-between items-center mb-6"><h2 class="text-2xl font-bold font-headline">Create New Goal</h2><button onclick="hideModal()" class="text-text-muted hover:text-text-primary"><span class="material-symbols-outlined">close</span></button></div>
  <form id="goal-form" class="space-y-5" onsubmit="addGoal(event)">
    <div><label class="input-label">Goal Name</label><input id="goal-name" class="input-field w-full" placeholder="e.g. Dream Vacation" required style="background-color:#12121A;color:#F0F0F5"/></div>
    <div><label class="input-label">Target Amount (₱)</label><input id="goal-target" class="input-field w-full font-mono" placeholder="0.00" type="number" required style="background-color:#12121A;color:#F0F0F5"/></div>
    <div><label class="input-label">Icon</label><div class="flex gap-2 mt-1">${["smartphone","medical_services","flight_takeoff","school","shopping_cart","home","sports_esports","favorite"].map(i => `<button type="button" class="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center text-text-muted hover:text-accent-primary hover:bg-accent-primary/10 transition-all goal-icon-btn" data-icon="${i}" onclick="selectGoalIcon(this)"><span class="material-symbols-outlined">${i}</span></button>`).join("")}</div></div>
    <button type="submit" class="btn-primary w-full justify-center h-12">Create Goal</button>
  </form>`);
}
let selectedGoalIcon = "smartphone";
function selectGoalIcon(btn) {
  document.querySelectorAll(".goal-icon-btn").forEach(b => { b.classList.remove("bg-accent-primary/10","text-accent-primary"); b.classList.add("bg-surface-container-low","text-text-muted"); });
  btn.classList.add("bg-accent-primary/10","text-accent-primary"); btn.classList.remove("bg-surface-container-low","text-text-muted");
  selectedGoalIcon = btn.dataset.icon;
}
function addGoal(e) {
  e.preventDefault();
  const colors = ["#00D2FF","#00E676","#FFB800","#6C5CE7","#FF6B9D","#54A0FF"];
  const goal = { id: nextId(state.savingsGoals), name: document.getElementById("goal-name").value, icon: selectedGoalIcon, color: colors[state.savingsGoals.length % colors.length], target: parseFloat(document.getElementById("goal-target").value), saved: 0 };
  state.savingsGoals.push(goal);
  saveState(); hideModal(); renderGoals();

  createRemoteGoal(goal)
    .then(() => {
      apiOnline = true;
    })
    .catch(() => {
      apiOnline = false;
      showToast("Goal saved locally. API sync unavailable right now.");
    });
}
function showAddFundsModal(goalId) {
  const g = state.savingsGoals.find(g => g.id === goalId);
  showModal(`<div class="flex justify-between items-center mb-6"><h2 class="text-xl font-bold font-headline">Add Funds to ${g.name}</h2><button onclick="hideModal()" class="text-text-muted hover:text-text-primary"><span class="material-symbols-outlined">close</span></button></div>
  <p class="text-text-secondary mb-4">Current: ${fmt(g.saved)} / ${fmt(g.target)}</p>
  <form onsubmit="addFunds(event,${goalId})"><label class="input-label">Amount (₱)</label><input id="fund-amount" class="input-field w-full font-mono mb-4" type="number" placeholder="0.00" required style="background-color:#12121A;color:#F0F0F5"/>
  <button type="submit" class="btn-primary w-full justify-center h-12">Add Funds</button></form>`);
}
function addFunds(e, goalId) {
  e.preventDefault();
  const g = state.savingsGoals.find(g => g.id === goalId);
  g.saved += parseFloat(document.getElementById("fund-amount").value) || 0;
  if (g.saved > g.target) g.saved = g.target;
  saveState(); hideModal(); renderGoals();

  updateRemoteGoal(g)
    .then(() => {
      apiOnline = true;
    })
    .catch(() => {
      apiOnline = false;
      showToast("Updated locally. API sync unavailable right now.");
    });
}

// FAB click
document.getElementById("fab-btn").addEventListener("click", () => {
  if (currentPage === "goals") showGoalModal();
  else navigate("tracker");
});

// ============== TOAST NOTIFICATIONS ==============
function showToast(message, duration = 4500) {
  // Remove existing toasts
  document.querySelectorAll('.toast-notification').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

function showChallengeToast(message, duration = 4500) {
  showToast(message, duration);

  // Fallback positioning in case a legacy toast container is used.
  const container = document.getElementById("toast-container");
  if (container) {
    container.className = "fixed top-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3";
  }
}

// ============== CHALLENGE PAGE TOAST ==============
let _lastChallengePage = '';
const _origRenderChallenge = renderChallenge;
renderChallenge = function() {
  _origRenderChallenge();
  const ch = state.challenge;
  if (_lastChallengePage !== 'challenge_shown') {
    _lastChallengePage = 'challenge_shown';
    showToast(`<span class="material-symbols-outlined text-gold filled" style="font-size:22px">local_fire_department</span> Day ${ch.currentStreak} of your challenge! Save <strong>${fmt(ch.todayAmount)}</strong> today.`);
  }
};
// Reset when leaving challenge page
const _origNavigate = navigate;
navigate = function(page) {
  if (page !== 'challenge') _lastChallengePage = '';
  _origNavigate(page);
};

// ============== GOAL ANIMATIONS ==============
function animateBtnAndGoal(btn) {
  btn.classList.add('animate-pulse-click');
  setTimeout(() => { btn.classList.remove('animate-pulse-click'); showGoalModal(); }, 350);
}
function animateCardAndGoal(card) {
  card.classList.add('animate-card-bounce');
  setTimeout(() => { card.classList.remove('animate-card-bounce'); showGoalModal(); }, 400);
}

// ============== INCOME GATE MODAL ==============
function showIncomeGateModal() {
  showModal(`<div class="flex justify-between items-start mb-6">
    <div><h2 class="text-xl font-bold font-headline">Monthly Income Required</h2><p class="text-sm text-text-muted mt-1">Set your monthly income before starting the challenge</p></div>
    <button onclick="hideModal()" class="text-text-muted hover:text-text-primary"><span class="material-symbols-outlined">close</span></button>
  </div>
  <div class="flex flex-col items-center py-6 gap-4">
    <div class="w-20 h-20 rounded-full bg-warning/10 flex items-center justify-center"><span class="material-symbols-outlined text-warning filled" style="font-size:40px">account_balance_wallet</span></div>
    <p class="text-center text-text-secondary max-w-xs">To avoid forcing yourself to save without knowing your budget, please set your <strong class="text-text-primary">monthly income</strong> in the Budget Planner first.</p>
    <p class="text-center text-xs text-text-muted">This ensures you only save what you can actually afford.</p>
  </div>
  <div class="flex gap-3 mt-2">
    <button onclick="hideModal();navigate('budget')" class="flex-1 btn-primary justify-center h-12"><span class="material-symbols-outlined text-[18px]">payments</span>Go to Budget Planner</button>
    <button onclick="hideModal()" class="flex-1 btn-ghost justify-center h-12">Cancel</button>
  </div>`);
}

// ============== RECOMMENDATIONS ==============
let recommendMode = "monthly"; // "monthly" or "daily"

function setRecommendMode(mode, btn) {
  recommendMode = mode;
  if (mode === "daily" && btn) {
    btn.classList.remove("animate-pulse-click");
    void btn.offsetWidth;
    btn.classList.add("animate-pulse-click");
  }
  document.querySelectorAll(".rec-mode-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");

  const container = document.getElementById("recommend-content");
  if (container) {
    container.classList.remove("animate-recommend-switch");
    void container.offsetWidth;
    container.classList.add("animate-recommend-switch");
    setTimeout(() => container.classList.remove("animate-recommend-switch"), 320);
  }

  renderRecommendContent();
}

function renderRecommend() {
  const el = document.getElementById("page-recommend");
  const profileType = getProfileType();
  const profileHeadline = profileType === "student" ? "Student-focused" : "Standard-focused";

  // Recommendation database — shared between modes
  window._recItems = {
    Food: [
      { name: "Rice + Ulam (Carinderia)", price: 50, desc: "Filling home-style meal", tip: "Best for daily lunches" },
      { name: "Instant Noodles + Egg", price: 25, desc: "Quick & budget-friendly", tip: "Add veggies for nutrition" },
      { name: "Bread & Peanut Butter", price: 35, desc: "Breakfast staple", tip: "Lasts 3-4 days" },
      { name: "Banana (per bundle)", price: 30, desc: "Healthy snack", tip: "Great energy boost" },
      { name: "Canned Goods (Sardines)", price: 22, desc: "Protein-rich & affordable", tip: "Stock up on sale days" },
      { name: "Lugaw / Arroz Caldo", price: 30, desc: "Warm comfort food", tip: "Perfect for rainy days" },
      { name: "Fruits in Season", price: 40, desc: "Mangoes, watermelon, etc.", tip: "Buy in-season for savings" },
      { name: "Packed Lunch (Home-cooked)", price: 60, desc: "Cook at home & bring to school", tip: "Save ₱100+/day vs eating out" },
      { name: "Street Food (Fish Balls, Kwek)", price: 20, desc: "Tasty affordable snacks", tip: "Great for merienda" },
      { name: "Grocery Cooking (per meal)", price: 80, desc: "Cook full meals at home", tip: "Meal prep on weekends" },
    ],
    Transport: [
      { name: "Jeepney Ride", price: 13, desc: "Standard Metro Manila fare", tip: "Use for daily commute" },
      { name: "Tricycle (Short Distance)", price: 15, desc: "For barangay-level trips", tip: "Share ride when possible" },
      { name: "Bus (Air-con)", price: 15, desc: "Comfortable city travel", tip: "Beep card saves time" },
      { name: "MRT/LRT Single Journey", price: 16, desc: "Metro rail tickets", tip: "Get stored-value card" },
      { name: "Walking (Free!)", price: 0, desc: "Under 1km? Walk it!", tip: "Exercise + save money" },
      { name: "Bike / E-bike Rental", price: 25, desc: "Eco-friendly short trips", tip: "Faster than traffic jams" },
      { name: "Grab Share / Angkas", price: 60, desc: "For urgent/rainy day trips", tip: "Split with friends" },
      { name: "P2P Bus", price: 55, desc: "Point-to-point premium bus", tip: "Worth it for long commutes" },
    ],
    Entertainment: [
      { name: "Mobile Games (Free)", price: 0, desc: "CODM, ML, Genshin", tip: "No spending on gacha!" },
      { name: "YouTube / Free Streaming", price: 0, desc: "Endless free content", tip: "Use WiFi to save data" },
      { name: "Library Visit", price: 0, desc: "Free books & study space", tip: "Great for productive days" },
      { name: "Park / Beach Day", price: 50, desc: "Outdoor fun with friends", tip: "Pack your own food" },
      { name: "Movie Night (Home)", price: 30, desc: "Snacks + streamed movie", tip: "Cheaper than cinema" },
      { name: "Cinema (Student)", price: 250, desc: "With student discount", tip: "Go on off-peak days" },
      { name: "Board Game Café", price: 120, desc: "Unlimited play, shared cost", tip: "Split with friend group" },
      { name: "Karaoke (KTV per head)", price: 100, desc: "Group singing fun", tip: "More friends = cheaper per head" },
    ],
    Shopping: [
      { name: "Thrift Clothing (Ukay)", price: 50, desc: "Find unique pieces cheap", tip: "Go early for best picks" },
      { name: "School Supplies (Bulk)", price: 80, desc: "Notebooks, pens bundle", tip: "Buy at start of semester" },
      { name: "Phone Case/Accessories", price: 60, desc: "Protect your gadgets", tip: "Check Shopee/Lazada sales" },
      { name: "Skincare Basics", price: 150, desc: "Sunscreen, cleanser", tip: "Stick to essentials first" },
      { name: "Water Bottle (Reusable)", price: 200, desc: "One-time buy, daily savings", tip: "Skip buying bottled water" },
    ],
    Utilities: [
      { name: "Prepaid Load (Weekly)", price: 50, desc: "Data + calls essentials", tip: "Use promo bundles" },
      { name: "Internet Café", price: 15, desc: "Per hour of browsing", tip: "Use school WiFi when possible" },
      { name: "Electricity Contribution", price: 200, desc: "Monthly share", tip: "Unplug to save energy" },
      { name: "Water Bill Contribution", price: 100, desc: "Monthly share", tip: "Short showers help!" },
    ],
    School: [
      { name: "Photocopies / Printouts", price: 3, desc: "Per page school docs", tip: "Go digital when possible" },
      { name: "Project Materials", price: 100, desc: "Art supplies, paper, etc.", tip: "Reuse & recycle materials" },
      { name: "USB Drive / Cloud Storage", price: 150, desc: "One-time investment", tip: "Back up everything!" },
      { name: "Highlighters/Pens Set", price: 50, desc: "Study essentials", tip: "Buy sets for better value" },
    ],
    "Dining Out": [
      { name: "Jollibee Chickenjoy Meal", price: 109, desc: "Classic fast-food treat", tip: "Share bucket for groups" },
      { name: "McDo McSpaghetti Meal", price: 89, desc: "Affordable & filling", tip: "Use app for deals" },
      { name: "Milk Tea (Medium)", price: 89, desc: "Treat-yourself drink", tip: "Limit to 1-2x/week" },
      { name: "Café Coffee", price: 120, desc: "Study fuel", tip: "Bring tumbler for discounts" },
      { name: "Pizza (Sharing/Slice)", price: 70, desc: "Group hangout food", tip: "Slice deals are cheaper" },
    ],
    Subscriptions: [
      { name: "Spotify Student", price: 75, desc: "Music streaming", tip: "Use student discount" },
      { name: "Netflix (Shared)", price: 55, desc: "Split with 3 others", tip: "₱220 ÷ 4 people" },
      { name: "YouTube Premium (Family)", price: 50, desc: "Ad-free + music", tip: "Share family plan" },
      { name: "iCloud / Google One (50GB)", price: 49, desc: "Cloud storage backup", tip: "Essential for school files" },
    ]
  };

  // Render the shell with toggle + content area
  el.innerHTML = `
  <div class="flex items-center justify-between mb-2">
    <div>
      <h1 class="font-headline font-bold text-[28px]">Smart Recommendations</h1>
      <p class="text-text-secondary mt-1">${profileHeadline} options tailored to your income</p>
    </div>
    <div class="seg-control h-[44px]">
      <button type="button" class="seg-btn rec-mode-btn ${recommendMode === 'monthly' ? 'active' : ''}" onclick="setRecommendMode('monthly',this)">Monthly</button>
      <button type="button" class="seg-btn rec-mode-btn ${recommendMode === 'daily' ? 'active' : ''}" onclick="setRecommendMode('daily',this)">Daily</button>
    </div>
  </div>
  <div id="recommend-content"></div>`;

  renderRecommendContent();
}

function renderRecommendContent() {
  const container = document.getElementById("recommend-content");
  if (!container) return;
  if (recommendMode === "monthly") {
    renderMonthlyRecommend(container);
  } else {
    renderDailyRecommend(container);
  }
}

function renderMonthlyRecommend(container) {
  const inc = state.monthlyIncome;
  if (!inc || inc <= 0) {
    container.innerHTML = `
    <div class="card flex flex-col items-center justify-center py-16 gap-4">
      <div class="w-20 h-20 rounded-full bg-warning/10 flex items-center justify-center"><span class="material-symbols-outlined text-warning filled" style="font-size:40px">payments</span></div>
      <h2 class="text-2xl font-bold font-headline">Set Your Monthly Income</h2>
      <p class="text-text-secondary text-center max-w-md">Set your monthly income in the Budget Planner to see monthly recommendations.</p>
      <button onclick="navigate('budget')" class="btn-primary mt-2"><span class="material-symbols-outlined text-[18px]">payments</span>Go to Budget Planner</button>
    </div>`;
    return;
  }

  const rules = state.settings.budgetRule.split("-").map(Number);
  const needsBudget = inc * rules[0] / 100;
  const wantsBudget = inc * rules[1] / 100;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const monthTx = state.transactions.filter(t => t.type === "expense" && t.date >= monthStart);
  const spentByCategory = {};
  monthTx.forEach(t => { spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amount; });

  const categoryBudgets = {
    Food:          { budget: needsBudget * 0.40, icon: "restaurant", color: "#FF5252", type: "Needs" },
    Transport:     { budget: needsBudget * 0.25, icon: "directions_bus", color: "#00D2FF", type: "Needs" },
    Utilities:     { budget: needsBudget * 0.20, icon: "bolt", color: "#FFD166", type: "Needs" },
    School:        { budget: needsBudget * 0.15, icon: "school", color: "#6C5CE7", type: "Needs" },
    Entertainment: { budget: wantsBudget * 0.35, icon: "sports_esports", color: "#FF6B9D", type: "Wants" },
    Shopping:      { budget: wantsBudget * 0.30, icon: "shopping_bag", color: "#FFB800", type: "Wants" },
    "Dining Out":  { budget: wantsBudget * 0.20, icon: "local_cafe", color: "#FF9F43", type: "Wants" },
    Subscriptions: { budget: wantsBudget * 0.15, icon: "subscriptions", color: "#54A0FF", type: "Wants" }
  };

  if (getProfileType() === "standard") {
    categoryBudgets.Family = { budget: needsBudget * 0.10, icon: "groups", color: "#54A0FF", type: "Needs" };
    categoryBudgets.Utilities = { budget: needsBudget * 0.15, icon: "bolt", color: "#FFD166", type: "Needs" };
  }

  let html = `
  <div class="card py-4 px-5 flex items-center justify-between mb-2">
    <div class="flex items-center gap-3">
      <span class="material-symbols-outlined text-accent-primary filled">account_balance_wallet</span>
      <div><span class="text-xs text-text-muted uppercase tracking-wider">Monthly Income</span><p class="font-mono font-bold text-xl">${fmt(inc)}</p></div>
    </div>
    <div class="flex items-center gap-3">
      <span class="material-symbols-outlined text-accent-secondary filled">pie_chart</span>
      <div><span class="text-xs text-text-muted uppercase tracking-wider">Budget Rule</span><p class="font-mono font-bold text-xl">${rules.join("/")}</p></div>
    </div>
  </div>`;

  html += buildCategoryCards(categoryBudgets, spentByCategory, "month");
  html += buildTipsSection();
  container.innerHTML = html;
}

function renderDailyRecommend(container) {
  const today = new Date().toISOString().split("T")[0];
  const todayTx = state.transactions.filter(t => t.date === today);
  const todayIncome = todayTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const todayExpense = todayTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const remaining = todayIncome - todayExpense;

  if (todayIncome <= 0) {
    container.innerHTML = `
    <div class="card flex flex-col items-center justify-center py-16 gap-4">
      <div class="w-20 h-20 rounded-full bg-accent-primary/10 flex items-center justify-center"><span class="material-symbols-outlined text-accent-primary filled" style="font-size:40px">today</span></div>
      <h2 class="text-2xl font-bold font-headline">No Income Recorded Today</h2>
      <p class="text-text-secondary text-center max-w-md">Add an income transaction in the Daily Tracker first, then come back to see what you can afford today!</p>
      <button onclick="navigate('tracker')" class="btn-primary mt-2"><span class="material-symbols-outlined text-[18px]">add_circle</span>Go to Daily Tracker</button>
    </div>`;
    return;
  }

  // Split daily income into categories (simpler split for daily)
  const needsPct = 0.60, wantsPct = 0.30, savePct = 0.10;
  const dailyNeeds = todayIncome * needsPct;
  const dailyWants = todayIncome * wantsPct;
  const dailySavings = todayIncome * savePct;

  const spentByCategory = {};
  todayTx.filter(t => t.type === "expense").forEach(t => { spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amount; });

  const categoryBudgets = {
    Food:          { budget: dailyNeeds * 0.50, icon: "restaurant", color: "#FF5252", type: "Needs" },
    Transport:     { budget: dailyNeeds * 0.30, icon: "directions_bus", color: "#00D2FF", type: "Needs" },
    School:        { budget: dailyNeeds * 0.20, icon: "school", color: "#6C5CE7", type: "Needs" },
    Entertainment: { budget: dailyWants * 0.40, icon: "sports_esports", color: "#FF6B9D", type: "Wants" },
    "Dining Out":  { budget: dailyWants * 0.35, icon: "local_cafe", color: "#FF9F43", type: "Wants" },
    Shopping:      { budget: dailyWants * 0.25, icon: "shopping_bag", color: "#FFB800", type: "Wants" },
  };

  let html = `
  <div class="card py-4 px-5 mb-2">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <span class="material-symbols-outlined text-accent-secondary filled text-[28px]">today</span>
        <div><span class="text-xs text-text-muted uppercase tracking-wider">Today's Income</span><p class="font-mono font-bold text-xl text-success">${fmt(todayIncome)}</p></div>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-right"><span class="text-xs text-text-muted uppercase tracking-wider">Spent Today</span><p class="font-mono font-bold text-xl text-error">${fmt(todayExpense)}</p></div>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-right"><span class="text-xs text-text-muted uppercase tracking-wider">Remaining</span><p class="font-mono font-bold text-xl ${remaining >= 0 ? 'text-accent-primary' : 'text-error'}">${fmt(remaining)}</p></div>
      </div>
    </div>
    <div class="flex items-center gap-2 mt-3 text-xs text-text-muted">
      <span class="material-symbols-outlined text-[14px]">info</span>
      Split: ${Math.round(needsPct*100)}% Needs · ${Math.round(wantsPct*100)}% Wants · ${Math.round(savePct*100)}% Save
    </div>
    ${dailySavings > 0 ? `<div class="flex items-center gap-2 mt-2 py-2 px-3 rounded-xl bg-success/5 border border-success/10"><span class="material-symbols-outlined text-success text-[18px]">savings</span><span class="text-sm text-success font-medium">Set aside ${fmt(Math.round(dailySavings))} for savings today!</span></div>` : ""}
  </div>`;

  html += buildCategoryCards(categoryBudgets, spentByCategory, "day");

  // Daily-specific tips
  html += `
  <div class="card bg-gradient-to-br from-accent-secondary/5 to-accent-primary/5 border-accent-secondary/10">
    <h3 class="font-headline font-semibold text-lg mb-4 flex items-center gap-2"><span class="material-symbols-outlined text-accent-secondary filled">tips_and_updates</span>Today's Smart Tips</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      ${[
        { icon: "lunch_dining", tip: "Bring baon from home — a packed lunch costs only ~₱60 vs ₱120+ eating out", color: "#FF5252" },
        { icon: "directions_walk", tip: "Walk if under 1km — save that ₱13 jeepney fare for snacks later", color: "#00D2FF" },
        { icon: "water_drop", tip: "Refill your water bottle — ₱25 saved every time you skip buying bottled water", color: "#00E676" },
        { icon: "no_drinks", tip: "Skip the milk tea today — that's ₱89 you can put toward savings", color: "#FF9F43" }
      ].map(t => `
      <div class="flex items-start gap-3 p-3 rounded-xl bg-surface/50">
        <span class="material-symbols-outlined mt-0.5" style="color:${t.color};font-size:20px">${t.icon}</span>
        <p class="text-sm text-text-secondary leading-relaxed">${t.tip}</p>
      </div>`).join("")}
    </div>
  </div>`;

  container.innerHTML = html;
}

// Shared card builder for both modes
function buildCategoryCards(categoryBudgets, spentByCategory, period) {
  const recs = window._recItems;
  let html = "";
  Object.keys(categoryBudgets).forEach((cat, idx) => {
    const info = categoryBudgets[cat];
    const spent = spentByCategory[cat] || 0;
    const remaining = Math.max(0, info.budget - spent);
    const items = recs[cat] || [];
    const affordable = items.filter(i => i.price <= remaining);
    const pctUsed = Math.min(100, info.budget > 0 ? (spent / info.budget) * 100 : 0);
    const perLabel = period === "day" ? "today" : "/day left";
    const dailyBudget = period === "day" ? remaining : remaining / Math.max(1, daysLeftInMonth());

    html += `
    <div class="card recommend-card" style="animation-delay:${idx * 80}ms">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-xl flex items-center justify-center" style="background:${info.color}15">
            <span class="material-symbols-outlined filled" style="color:${info.color};font-size:22px">${info.icon}</span>
          </div>
          <div>
            <h3 class="font-headline font-semibold text-lg">${cat}</h3>
            <span class="text-xs px-2 py-0.5 rounded-full font-medium" style="background:${info.color}20;color:${info.color}">${info.type}</span>
          </div>
        </div>
        <div class="text-right">
          <p class="font-mono font-bold text-lg">${fmt(remaining)}</p>
          <p class="text-xs text-text-muted">${period === "day" ? "left today" : "~" + fmt(Math.round(dailyBudget)) + "/day left"}</p>
        </div>
      </div>
      <div class="progress-track mb-4"><div class="progress-fill" style="width:${pctUsed}%;background:${pctUsed > 80 ? '#FF4757' : info.color}"></div></div>
      <p class="text-xs text-text-muted mb-4">${fmt(spent)} spent of ${fmt(Math.round(info.budget))} budget (${Math.round(pctUsed)}%)</p>
      ${affordable.length > 0 ? `
      <div class="space-y-2">
        <p class="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2">💡 ${period === "day" ? "You can afford today" : "Recommended for you"}</p>
        ${affordable.slice(0, 4).map(item => {
          const encodedCategory = encodeURIComponent(cat);
          const encodedName = encodeURIComponent(item.name);
          return `
        <div class="flex items-center justify-between py-2.5 px-3 rounded-xl bg-surface-container-low/50 hover:bg-surface-container-low transition-all gap-3">
          <div class="flex-1 min-w-0">
            <p class="font-medium text-sm text-text-primary truncate">${item.name}</p>
            <p class="text-xs text-text-muted truncate">${item.desc}</p>
            <p class="text-[11px] text-text-muted/90 mt-1 truncate">${item.tip}</p>
          </div>
          <div class="ml-auto flex flex-col items-end gap-2 min-w-[180px] shrink-0">
            <span class="text-xs px-2 py-1 rounded-lg bg-accent-primary/10 text-accent-primary font-mono font-semibold whitespace-nowrap text-right">${item.price === 0 ? 'FREE' : fmt(item.price)}</span>
            <button type="button" onclick="confirmAddRecommendationToTracker('${encodedCategory}','${encodedName}',${item.price})" class="btn-ghost h-[32px] px-3 text-xs justify-center">
              <span class="material-symbols-outlined text-[14px]">add_circle</span>
              Add to Daily Tracker
            </button>
          </div>
        </div>`;
        }).join("")}
        ${affordable.length > 4 ? `<p class="text-xs text-text-muted text-center pt-1">+${affordable.length - 4} more options within budget</p>` : ""}
      </div>` : `
      <div class="flex items-center gap-3 py-4 px-3 rounded-xl bg-error/5 border border-error/10">
        <span class="material-symbols-outlined text-error">warning</span>
        <p class="text-sm text-text-secondary">Budget tight! Consider reducing spending in this category.</p>
      </div>`}
    </div>`;
  });
  return html;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeRecommendationCategory(category) {
  const categories = getExpenseCategories();
  if (categories.includes(category)) return category;
  if (categories.includes("Other")) return "Other";
  return categories[0] || "Other";
}

function confirmAddRecommendationToTracker(encodedCategory, encodedName, amount) {
  const category = decodeURIComponent(encodedCategory || "");
  const name = decodeURIComponent(encodedName || "");
  const safeName = escapeHtml(name);
  const safeCategory = escapeHtml(category);

  showModal(`<div class="flex justify-between items-start mb-6">
    <div>
      <h2 class="text-xl font-bold font-headline">Add This Recommendation?</h2>
      <p class="text-sm text-text-muted mt-1">This will create an expense entry in Daily Tracker.</p>
    </div>
    <button onclick="hideModal()" class="text-text-muted hover:text-text-primary"><span class="material-symbols-outlined">close</span></button>
  </div>
  <div class="rounded-xl border border-border-default bg-surface-container-low/50 p-4 space-y-2 mb-5">
    <p class="text-sm"><span class="text-text-muted">Item:</span> <strong>${safeName}</strong></p>
    <p class="text-sm"><span class="text-text-muted">Category:</span> <strong>${safeCategory}</strong></p>
    <p class="text-sm"><span class="text-text-muted">Amount:</span> <strong>${fmt(amount)}</strong></p>
  </div>
  <div class="flex gap-3">
    <button onclick="addRecommendationToTracker('${encodedCategory}','${encodedName}',${amount})" class="flex-1 btn-primary justify-center h-12">
      <span class="material-symbols-outlined text-[18px]">check_circle</span>
      Yes, Add and Open Tracker
    </button>
    <button onclick="hideModal()" class="flex-1 btn-ghost justify-center h-12">Cancel</button>
  </div>`);
}

function addRecommendationToTracker(encodedCategory, encodedName, amount) {
  const rawCategory = decodeURIComponent(encodedCategory || "");
  const name = decodeURIComponent(encodedName || "");
  const category = normalizeRecommendationCategory(rawCategory);
  const safeAmount = Number(amount);

  if (!Number.isFinite(safeAmount) || safeAmount < 0) {
    hideModal();
    showToast("Invalid amount. Please try again.");
    return;
  }

  const tx = {
    id: nextId(state.transactions),
    type: "expense",
    amount: safeAmount,
    category,
    description: `Recommendation: ${name || "Suggested item"}`,
    date: new Date().toISOString().split("T")[0]
  };

  state.transactions.unshift(tx);

  saveState();
  hideModal();
  showToast(`Added <strong>${escapeHtml(name || "item")}</strong> (${fmt(safeAmount)}) to Daily Tracker.`);
  navigate("tracker");

  createRemoteTransaction(tx)
    .then(() => {
      apiOnline = true;
    })
    .catch(() => {
      apiOnline = false;
    });
}

function buildTipsSection() {
  const profileType = getProfileType();
  const tips = profileType === "student" ? [
    { icon: "lunch_dining", tip: "Cook at home or bring baon to school to save up to ₱3,000/month.", color: "#FF5252" },
    { icon: "directions_walk", tip: "Walk short distances and save your jeepney fare for school supplies.", color: "#00D2FF" },
    { icon: "water_drop", tip: "Bring a reusable bottle and skip daily bottled water costs.", color: "#00E676" },
    { icon: "shopping_bag", tip: "Prioritize needs over trend buys and use student discount days.", color: "#FFB800" },
    { icon: "group", tip: "Share subscriptions with friends and split monthly bills fairly.", color: "#54A0FF" },
    { icon: "calendar_month", tip: "Track every peso of allowance to avoid end-of-month shortages.", color: "#6C5CE7" }
  ] : [
    { icon: "savings", tip: "Automate a transfer to savings right after payday every month.", color: "#00E676" },
    { icon: "receipt_long", tip: "Review utility and recurring bills monthly to cut hidden waste.", color: "#FFD166" },
    { icon: "shopping_cart", tip: "Plan groceries weekly with a list to reduce impulse spending.", color: "#FF5252" },
    { icon: "family_restroom", tip: "Set a family essentials cap and track progress by category.", color: "#54A0FF" },
    { icon: "credit_card", tip: "Keep wants spending under plan by paying cash for discretionary items.", color: "#FFB800" },
    { icon: "event_repeat", tip: "Schedule a monthly budget review to rebalance goals and expenses.", color: "#6C5CE7" }
  ];

  return `
  <div class="card bg-gradient-to-br from-accent-primary/5 to-accent-secondary/5 border-accent-primary/10">
    <h3 class="font-headline font-semibold text-lg mb-4 flex items-center gap-2"><span class="material-symbols-outlined text-accent-primary filled">auto_awesome</span>Money-Saving Tips</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      ${tips.map(t => `
      <div class="flex items-start gap-3 p-3 rounded-xl bg-surface/50">
        <span class="material-symbols-outlined mt-0.5" style="color:${t.color};font-size:20px">${t.icon}</span>
        <p class="text-sm text-text-secondary leading-relaxed">${t.tip}</p>
      </div>`).join("")}
    </div>
  </div>`;
}

function daysLeftInMonth() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate() + 1;
}
loadState();
if (state.settings.theme === "light") {
  document.documentElement.classList.remove("dark");
  const themeIcon = document.getElementById("theme-icon");
  if (themeIcon) themeIcon.textContent = "light_mode";
}
document.getElementById("topbar-date").textContent = dateStr(new Date());
updateNames();
syncProfileTypeControls();
initRouter();

syncStateFromApi().then((synced) => {
  if (!synced) return;
  updateNames();
  syncProfileTypeControls();
  renderPage(currentPage);
});

// Keep clean URLs after reading profile from query param.
if (location.search.includes("profile=")) {
  const params = new URLSearchParams(location.search);
  params.delete("profile");
  const rest = params.toString();
  const cleanUrl = `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`;
  history.replaceState({}, "", cleanUrl);
}
