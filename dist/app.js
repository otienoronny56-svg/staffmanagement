// Supabase Configuration (Now loaded from config.js)
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State
let allEmployees = [];
let productionEntries = [];
let advances = [];
let currentEmployee = null; // Object {id, full_name}
let currentTab = 'overview';

// --- Initialization & UI Helpers ---

window.onload = function () {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    document.getElementById('log_date').value = today;
    document.getElementById('filter_from').value = today;
    document.getElementById('filter_to').value = today;

    initTheme();
    fetchEmployees();
    if (currentTab === 'overview') fetchGlobalOverview();
    if (currentTab === 'transactions') fetchGlobalTransactions();
    updateDisplays();
};

function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem('theme', next);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const sun = document.getElementById('theme_icon_sun');
    const moon = document.getElementById('theme_icon_moon');
    if (theme === 'dark') {
        sun.classList.remove('hidden');
        moon.classList.add('hidden');
    } else {
        sun.classList.add('hidden');
        moon.classList.remove('hidden');
    }
}

function switchTab(tab) {
    currentTab = tab;
    document.getElementById('tab_ledger').classList.toggle('active', tab === 'ledger');
    document.getElementById('tab_overview').classList.toggle('active', tab === 'overview');
    document.getElementById('tab_transactions').classList.toggle('active', tab === 'transactions');
    document.getElementById('tab_staff').classList.toggle('active', tab === 'staff');

    document.getElementById('section_ledger').classList.toggle('hidden', tab !== 'ledger');
    document.getElementById('section_overview').classList.toggle('hidden', tab !== 'overview');
    document.getElementById('section_transactions').classList.toggle('hidden', tab !== 'transactions');
    document.getElementById('section_staff').classList.toggle('hidden', tab !== 'staff');

    if (tab === 'overview') fetchGlobalOverview();
    if (tab === 'staff') fetchEmployees();
    if (tab === 'transactions') fetchGlobalTransactions();
}

function setSyncStatus(status) {
    const indicator = document.getElementById('sync_status');
    if (!indicator) return;
    indicator.className = "w-2 h-2 rounded-full transition-all duration-300";
    if (status === 'syncing') indicator.classList.add('bg-yellow-400', 'animate-pulse');
    else if (status === 'success') indicator.classList.add('bg-green-500', 'shadow-[0_0_8px_rgba(34,197,94,0.5)]');
    else if (status === 'error') indicator.classList.add('bg-red-500');
    else indicator.classList.add('bg-slate-300');
}

// Helper: Format Date
function formatDate(isoStr) {
    if (!isoStr) return "";
    const date = new Date(isoStr);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// --- Employee Management ---

async function fetchEmployees() {
    setSyncStatus('syncing');
    try {
        const { data, error } = await db.from('employees').select('*').order('full_name', { ascending: true });
        if (error) throw error;
        allEmployees = data;
        renderStaffList();
        setSyncStatus('success');
    } catch (err) {
        console.error("Fetch employees error:", err);
        setSyncStatus('error');
    }
}

async function addNewEmployee() {
    const nameInput = document.getElementById('new_employee_name');
    const name = nameInput.value.trim();
    if (!name) return;

    setSyncStatus('syncing');
    try {
        const { error } = await db.from('employees').insert([{ full_name: name }]);
        if (error) throw error;
        nameInput.value = '';
        await fetchEmployees();
        setSyncStatus('success');
    } catch (err) {
        console.error("Add employee error:", err);
        setSyncStatus('error');
        alert("Employee already exists.");
    }
}

function fireEmployee(id, name) {
    const modal = document.getElementById('confirm_modal');
    const nameSpan = document.getElementById('confirm_emp_name');
    const fireBtn = document.getElementById('confirm_fire_btn');

    nameSpan.innerText = name;
    modal.classList.remove('hidden');

    // Set up one-time click handler
    fireBtn.onclick = async () => {
        setSyncStatus('syncing');
        try {
            const { error } = await db.from('employees').delete().eq('id', id);
            if (error) throw error;

            await fetchEmployees();
            closeConfirmModal();
            setSyncStatus('success');

            if (currentEmployee && currentEmployee.id === id) {
                clearSelection();
            }
        } catch (err) {
            console.error("Fire employee error:", err);
            setSyncStatus('error');
            alert("Failed to remove employee.");
        }
    };
}

function closeConfirmModal() {
    document.getElementById('confirm_modal').classList.add('hidden');
}

function renderStaffList() {
    const list = document.getElementById('staff_full_list');
    list.innerHTML = allEmployees.map(emp => `
        <div class="glass-card rounded-xl p-4 flex justify-between items-center transition-all hover:bg-white/70">
            <span class="font-semibold text-sm">${emp.full_name}</span>
            <div class="flex gap-2">
                <button onclick="selectEmployeeByName('${emp.full_name}')" class="text-[9px] font-bold text-blue-500 uppercase tracking-widest bg-blue-500/10 px-3 py-2 rounded-lg hover:bg-blue-500/20 transition-all">Ledger</button>
                <button onclick="fireEmployee('${emp.id}', '${emp.full_name}')" class="text-[9px] font-bold text-red-500 uppercase tracking-widest bg-red-500/10 px-3 py-2 rounded-lg hover:bg-red-500/20 transition-all">Fire</button>
            </div>
        </div>
    `).join('');
}

// --- Global Overview Dashboard ---

async function fetchGlobalOverview() {
    const listContainer = document.getElementById('global_stats_list');
    listContainer.innerHTML = `<div class="p-8 text-center text-slate-400 italic text-sm">Aggregating business data...</div>`;

    setSyncStatus('syncing');
    try {
        // Fetch everything to aggregate (for simplicity in small datasets)
        const [prodRes, payRes, empRes] = await Promise.all([
            db.from('production_logs').select('employee_name, quantity, unit_cost'),
            db.from('payment_logs').select('employee_name, amount_paid'),
            db.from('employees').select('full_name')
        ]);

        if (prodRes.error || payRes.error || empRes.error) throw new Error("Could not fetch dashboard data");

        // Map data by employee
        const staffStats = {};
        empRes.data.forEach(e => staffStats[e.full_name] = { gross: 0, paid: 0 });

        prodRes.data.forEach(p => {
            if (staffStats[p.employee_name]) {
                staffStats[p.employee_name].gross += (p.quantity * p.unit_cost);
            }
        });

        payRes.data.forEach(p => {
            if (staffStats[p.employee_name]) {
                staffStats[p.employee_name].paid += parseFloat(p.amount_paid);
            }
        });

        // Convert to array and sort by highest debt
        let totalBusinessGross = 0;
        let totalBusinessPaid = 0;

        const statsArray = Object.entries(staffStats).map(([name, data]) => {
            totalBusinessGross += data.gross;
            totalBusinessPaid += data.paid;
            return {
                name,
                gross: data.gross,
                paid: data.paid,
                balance: data.gross - data.paid
            };
        }).sort((a, b) => b.balance - a.balance);

        // Update footer with Global Totals
        document.getElementById('display_total').innerText = totalBusinessGross.toFixed(2);
        document.getElementById('display_paid').innerText = totalBusinessPaid.toFixed(2);
        const businessBalance = totalBusinessGross - totalBusinessPaid;
        document.getElementById('display_balance').innerText = businessBalance.toFixed(2);
        if (document.getElementById('display_balance_mobile')) {
            document.getElementById('display_balance_mobile').innerText = businessBalance.toFixed(2);
        }

        listContainer.innerHTML = statsArray.map(s => `
            <div class="glass-card rounded-2xl p-4 flex items-center justify-between group transition-all hover:translate-y-[-1px]">
                <div class="space-y-0.5">
                    <h3 class="font-bold text-sm tracking-tight">${s.name}</h3>
                    <div class="flex gap-4">
                        <span class="text-[8px] font-bold opacity-30 uppercase tracking-tighter">Gross: ${s.gross.toFixed(2)}</span>
                        <span class="text-[8px] font-bold text-red-400 opacity-60 uppercase tracking-tighter">Paid: ${s.paid.toFixed(2)}</span>
                    </div>
                </div>
                <div class="text-right flex items-center gap-4">
                    <div class="mr-1">
                        <span class="block text-[7px] font-bold opacity-40 uppercase tracking-tighter text-right">Debit</span>
                        <span class="text-lg font-bold font-heading leading-none" style="color: ${s.balance > 0 ? 'var(--text-main)' : '#22c55e'}">${s.balance.toFixed(2)}</span>
                    </div>
                    <button onclick="selectEmployeeByName('${s.name}')" class="w-8 h-8 flex items-center justify-center bg-black text-white rounded-lg shadow-sm hover:scale-105 active:scale-95 transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');

        setSyncStatus('success');
    } catch (err) {
        console.error("Dashboard error:", err);
        setSyncStatus('error');
        listContainer.innerHTML = `<div class="p-8 text-center text-red-400 italic text-sm">Error loading dashboard. Please check your connection.</div>`;
    }
}

// --- Search & Selection ---

function searchEmployees(query) {
    const resultsDiv = document.getElementById('search_results');
    if (!query.trim()) {
        resultsDiv.classList.add('hidden');
        return;
    }

    const matches = allEmployees.filter(e => e.full_name.toLowerCase().includes(query.toLowerCase()));
    if (matches.length > 0) {
        resultsDiv.innerHTML = matches.map(e => `
            <div onclick="selectEmployee('${e.id}', '${e.full_name}')" class="p-3 hover:bg-slate-50 cursor-pointer text-sm font-medium border-b border-slate-100 last:border-0">
                ${e.full_name}
            </div>
        `).join('');
        resultsDiv.classList.remove('hidden');
    } else {
        resultsDiv.innerHTML = `<div class="p-3 text-xs text-slate-400 italic">No staff found by that name</div>`;
        resultsDiv.classList.remove('hidden');
    }
}

function selectEmployee(id, name) {
    currentEmployee = { id, full_name: name };
    document.getElementById('employee_search').value = '';
    document.getElementById('search_results').classList.add('hidden');
    document.getElementById('selected_employee_badge').classList.remove('hidden');
    document.getElementById('selected_name').innerText = name;
    document.getElementById('ledger_controls').classList.remove('opacity-40', 'pointer-events-none');
    loadFromCloud();
}

function selectEmployeeByName(name) {
    const emp = allEmployees.find(e => e.full_name === name);
    if (emp) {
        switchTab('ledger');
        selectEmployee(emp.id, emp.full_name);
    }
}

function clearSelection() {
    currentEmployee = null;
    document.getElementById('selected_employee_badge').classList.add('hidden');
    document.getElementById('ledger_controls').classList.add('opacity-40', 'pointer-events-none');
    productionEntries = [];
    advances = [];
    updateDisplays();
}

// --- Data Fetching ---

async function loadFromCloud() {
    if (!currentEmployee) return;
    const from = document.getElementById('filter_from').value;
    const to = document.getElementById('filter_to').value;

    setSyncStatus('syncing');
    try {
        let prodQ = db.from('production_logs').select('*').eq('employee_name', currentEmployee.full_name);
        let payQ = db.from('payment_logs').select('*').eq('employee_name', currentEmployee.full_name);

        if (from) {
            prodQ = prodQ.gte('created_at', from + 'T00:00:00');
            payQ = payQ.gte('created_at', from + 'T00:00:00');
        }
        if (to) {
            prodQ = prodQ.lte('created_at', to + 'T23:59:59');
            payQ = payQ.lte('created_at', to + 'T23:59:59');
        }

        const [prodRes, payRes] = await Promise.all([
            prodQ.order('created_at', { ascending: false }),
            payQ.order('created_at', { ascending: false })
        ]);

        productionEntries = (prodRes.data || []).map(d => ({
            id: d.id,
            type: d.garment_type,
            qty: d.quantity,
            unit_cost: d.unit_cost,
            date: d.created_at
        }));

        advances = (payRes.data || []).map(d => ({
            id: d.id,
            desc: d.description,
            amount: parseFloat(d.amount_paid),
            date: d.created_at
        }));

        setSyncStatus('success');
        updateDisplays();
    } catch (err) {
        setSyncStatus('error');
    }
}

function updateDisplays() {
    const displayTotal = document.getElementById('display_total');
    const displayPaid = document.getElementById('display_paid');
    const displayBalance = document.getElementById('display_balance');
    const displayBalanceMobile = document.getElementById('display_balance_mobile');
    const entriesList = document.getElementById('entries_list');
    const advancesList = document.getElementById('advances_list');

    const gross = productionEntries.reduce((s, e) => s + (e.qty * e.unit_cost), 0);
    const paid = advances.reduce((s, a) => s + a.amount, 0);
    const balance = gross - paid;

    // Only update footer if we are in Ledger tab (private view)
    // If in Overview, fetchGlobalOverview handles the business-wide footer
    if (currentTab === 'ledger') {
        displayTotal.innerText = gross.toFixed(2);
        displayPaid.innerText = paid.toFixed(2);
        displayBalance.innerText = balance.toFixed(2);
        if (displayBalanceMobile) displayBalanceMobile.innerText = balance.toFixed(2);
    }

    if (productionEntries.length > 0) {
        entriesList.classList.remove('hidden');
        entriesList.innerHTML = productionEntries.map(e => `
            <div class="glass-card rounded-xl p-4 entry-card flex items-center justify-between group">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                        ${e.type.charAt(0)}
                    </div>
                    <div>
                        <div class="text-sm font-semibold">${e.type}</div>
                        <div class="text-[9px] text-slate-400 font-medium uppercase tracking-wider">
                            ${formatDate(e.date)} • ${e.qty} units
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="text-sm font-bold">${(e.qty * e.unit_cost).toFixed(2)}</div>
                    <button onclick="removeEntry('${e.id}')" class="text-slate-300 hover:text-red-500 transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
    } else { entriesList.classList.add('hidden'); }

    if (advances.length > 0) {
        advancesList.classList.remove('hidden');
        advancesList.innerHTML = advances.map(a => `
            <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 border border-slate-100 group">
                <div class="flex items-center gap-3">
                    <div class="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-red-500 text-[8px] font-bold">P</div>
                    <div>
                        <div class="text-xs font-semibold text-slate-600">${a.desc || 'Advance'}</div>
                        <div class="text-[8px] text-slate-400 uppercase tracking-widest">${formatDate(a.date)}</div>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-xs font-bold text-red-500">-${a.amount.toFixed(2)}</span>
                    <button onclick="removeAdvance('${a.id}')" class="text-slate-200 hover:text-red-500 transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
    } else { advancesList.classList.add('hidden'); }
}

// --- CRUD ---

async function addEntry() {
    if (!currentEmployee) return;
    const type = document.getElementById('garment_type').value;
    const qty = parseInt(document.getElementById('qty').value);
    const cost = parseFloat(document.getElementById('unit_cost').value);
    const date = document.getElementById('log_date').value;

    if (isNaN(qty) || qty <= 0 || isNaN(cost) || cost <= 0) return;

    setSyncStatus('syncing');
    try {
        const insertObj = {
            employee_name: currentEmployee.full_name,
            garment_type: type,
            quantity: qty,
            unit_cost: cost
        };
        // Use manual date if selected, else default to NOW
        if (date) insertObj.created_at = date + 'T12:00:00';

        const { data, error } = await db.from('production_logs').insert([insertObj]).select();
        if (error) throw error;
        productionEntries.unshift({ ...data[0], date: data[0].created_at, qty: data[0].quantity, unit_cost: data[0].unit_cost, type: data[0].garment_type });
        document.getElementById('qty').value = '';
        document.getElementById('unit_cost').value = '';
        setSyncStatus('success');
        updateDisplays();
    } catch (err) { setSyncStatus('error'); }
}

async function addAdvance() {
    if (!currentEmployee) return;
    const desc = document.getElementById('adv_desc').value.trim();
    const amount = parseFloat(document.getElementById('adv_amount').value);
    const date = document.getElementById('log_date').value;

    if (isNaN(amount) || amount <= 0) return;

    setSyncStatus('syncing');
    try {
        const insertObj = {
            employee_name: currentEmployee.full_name,
            amount_paid: amount,
            description: desc
        };
        if (date) insertObj.created_at = date + 'T12:00:00';

        const { data, error } = await db.from('payment_logs').insert([insertObj]).select();
        if (error) throw error;
        advances.unshift({ ...data[0], date: data[0].created_at, amount: parseFloat(data[0].amount_paid), desc: data[0].description });
        document.getElementById('adv_desc').value = '';
        document.getElementById('adv_amount').value = '';
        setSyncStatus('success');
        updateDisplays();
    } catch (err) { setSyncStatus('error'); }
}

async function removeEntry(id) {
    if (!confirm("Delete record?")) return;
    setSyncStatus('syncing');
    try {
        await db.from('production_logs').delete().eq('id', id);
        productionEntries = productionEntries.filter(e => e.id !== id);
        updateDisplays();
        setSyncStatus('success');
    } catch (err) { setSyncStatus('error'); }
}

async function removeAdvance(id) {
    if (!confirm("Delete payment?")) return;
    setSyncStatus('syncing');
    try {
        await db.from('payment_logs').delete().eq('id', id);
        advances = advances.filter(a => a.id !== id);
        updateDisplays();
        setSyncStatus('success');
    } catch (err) { setSyncStatus('error'); }
}

function setQuickFilter(type) {
    const now = new Date();
    if (type === 'week') {
        const first = now.getDate() - now.getDay();
        const firstDay = new Date(now.setDate(first)).toISOString().split('T')[0];
        const lastDay = new Date().toISOString().split('T')[0];
        document.getElementById('filter_from').value = firstDay;
        document.getElementById('filter_to').value = lastDay;
        loadFromCloud();
    }
}

async function fetchGlobalTransactions() {
    const listContainer = document.getElementById('global_transactions_list');
    listContainer.innerHTML = '<div class="p-12 text-center opacity-20 italic text-[10px]">Loading transactions...</div>';
    setSyncStatus('syncing');

    try {
        const [prodRes, payRes] = await Promise.all([
            db.from('production_logs').select('id, employee_name, garment_type, quantity, unit_cost, created_at'),
            db.from('payment_logs').select('id, employee_name, amount_paid, description, created_at')
        ]);

        if (prodRes.error) throw prodRes.error;
        if (payRes.error) throw payRes.error;

        let allTxs = [];
        (prodRes.data || []).forEach(p => {
            allTxs.push({
                id: p.id,
                date: p.created_at,
                employee: p.employee_name,
                type: 'work',
                desc: `${p.garment_type} (${p.quantity} units)`,
                amount: p.quantity * p.unit_cost,
                isCredit: true
            });
        });

        (payRes.data || []).forEach(p => {
            allTxs.push({
                id: p.id,
                date: p.created_at,
                employee: p.employee_name,
                type: 'payment',
                desc: p.description || 'Payment',
                amount: p.amount_paid,
                isCredit: false
            });
        });

        allTxs.sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

        if (allTxs.length === 0) {
            listContainer.innerHTML = '<div class="p-12 text-center opacity-20 italic text-[10px]">No transactions found.</div>';
        } else {
            listContainer.innerHTML = allTxs.map(tx => `
                <div class="glass-card rounded-xl p-3 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg ${tx.isCredit ? 'bg-slate-100 text-slate-500' : 'bg-red-100 text-red-500'} flex items-center justify-center font-bold text-xs">
                            ${tx.isCredit ? 'W' : 'P'}
                        </div>
                        <div>
                            <div class="text-xs font-bold">${tx.employee}</div>
                            <div class="text-[9px] text-slate-400 font-medium uppercase tracking-wider">
                                ${formatDate(tx.date)} • ${tx.desc}
                            </div>
                        </div>
                    </div>
                    <div class="text-sm font-bold ${tx.isCredit ? 'text-slate-800 dark:text-slate-200' : 'text-red-500'}">
                        ${tx.isCredit ? '' : '-'}${tx.amount.toFixed(2)}
                    </div>
                </div>
            `).join('');
        }

        setSyncStatus('success');
    } catch (err) {
        console.error("Error fetching transactions:", err);
        listContainer.innerHTML = '<div class="p-12 text-center text-red-500 italic text-[10px]">Error loading transactions.</div>';
        setSyncStatus('error');
    }
}