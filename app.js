// Modern Man - Tailor & Salary Management Suite
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global State
let allEmployees = [];
let productionEntries = [];
let advances = [];
let currentEmployee = null; // { id, full_name }
let currentTab = 'overview';
let activeFilter = 'all'; // 'all', 'month', 'week', 'today', 'custom'
let activeRecordView = 'all'; // 'all', 'jobs', 'payments'

// --- Initialization ---

window.onload = function () {
    const today = new Date().toISOString().split('T')[0];
    const logDateInput = document.getElementById('log_date');
    if (logDateInput) logDateInput.value = today;

    initTheme();
    fetchEmployees();
    if (currentTab === 'overview') fetchGlobalOverview();
    if (currentTab === 'transactions') fetchGlobalTransactions();
    updateDisplays();

    document.addEventListener('click', (e) => {
        const tailorContainer = document.getElementById('custom_tailor_dropdown_container');
        if (tailorContainer && !tailorContainer.contains(e.target)) {
            closeTailorCustomDropdown();
        }

        const periodContainer = document.getElementById('custom_dash_period_container');
        if (periodContainer && !periodContainer.contains(e.target)) {
            closeDashPeriodDropdown();
        }
    });
};

// --- Currency & Formatting Helpers ---

function formatMoney(val) {
    const num = parseFloat(val) || 0;
    const isNeg = num < 0;
    const formatted = Math.abs(num).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return isNeg ? `-KSh ${formatted}` : `KSh ${formatted}`;
}

function formatDate(isoStr) {
    if (!isoStr) return "";
    const date = new Date(isoStr);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getInitials(name) {
    if (!name || typeof name !== 'string') return "T";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "T";
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    const first = parts[0][0] || '';
    const second = parts[1][0] || '';
    return (first + second).toUpperCase() || "T";
}

// --- Toast Notifications ---

function showToast(message, type = 'success') {
    const container = document.getElementById('toast_container');
    if (!container) return;

    const toast = document.createElement('div');
    const bgColors = {
        success: 'bg-emerald-600 text-white shadow-emerald-500/20',
        error: 'bg-red-600 text-white shadow-red-500/20',
        info: 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
    };

    toast.className = `toast-item flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold ${bgColors[type] || bgColors.info}`;
    toast.innerHTML = `
        <span class="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-black">${type === 'error' ? '✕' : '✓'}</span>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px) scale(0.95)';
        toast.style.transition = 'all 0.25s ease';
        setTimeout(() => toast.remove(), 250);
    }, 3000);
}

// --- Theme Management ---

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
        if (sun) sun.classList.remove('hidden');
        if (moon) moon.classList.add('hidden');
    } else {
        if (sun) sun.classList.add('hidden');
        if (moon) moon.classList.remove('hidden');
    }
}

// --- Navigation Tabs ---

function switchTab(tab) {
    currentTab = tab;
    ['overview', 'ledger', 'transactions', 'staff'].forEach(t => {
        const btn = document.getElementById(`tab_${t}`);
        const sec = document.getElementById(`section_${t}`);
        if (btn) btn.classList.toggle('active', t === tab);
        if (sec) sec.classList.toggle('hidden', t !== tab);
    });

    if (tab === 'overview') fetchGlobalOverview();
    if (tab === 'ledger' && currentEmployee) loadFromCloud();
    if (tab === 'staff') fetchEmployees();
    if (tab === 'transactions') fetchGlobalTransactions();
}

function setSyncStatus(status) {
    const indicator = document.getElementById('sync_status');
    const syncText = document.getElementById('sync_text');
    if (!indicator) return;

    indicator.className = "w-2 h-2 rounded-full transition-all duration-300";
    if (status === 'syncing') {
        indicator.classList.add('bg-amber-400', 'animate-pulse');
        if (syncText) syncText.innerText = "Syncing...";
    } else if (status === 'success') {
        indicator.classList.add('bg-emerald-500');
        if (syncText) syncText.innerText = "Cloud Synced";
    } else if (status === 'error') {
        indicator.classList.add('bg-red-500');
        if (syncText) syncText.innerText = "Connection Error";
    } else {
        indicator.classList.add('bg-slate-400');
        if (syncText) syncText.innerText = "Ready";
    }
}

// --- Employee & Tailor Management ---

async function fetchEmployees() {
    setSyncStatus('syncing');
    try {
        const { data, error } = await db.from('employees').select('*').order('full_name', { ascending: true });
        if (error) throw error;
        allEmployees = data || [];
        renderStaffList();
        renderTailorDropdown();
        const badge = document.getElementById('tailor_count_badge');
        if (badge) badge.innerText = `${allEmployees.length} Registered`;
        setSyncStatus('success');
    } catch (err) {
        console.error("Fetch employees error:", err);
        setSyncStatus('error');
    }
}

function renderTailorDropdown(list = allEmployees) {
    const menuItems = document.getElementById('tailor_menu_items');
    if (!menuItems) return;

    const data = list || allEmployees;
    if (data.length === 0) {
        menuItems.innerHTML = `<div class="p-4 text-center text-xs text-slate-400 italic">No tailors found.</div>`;
        return;
    }

    menuItems.innerHTML = data.map(emp => {
        const isSelected = currentEmployee && currentEmployee.id === emp.id;
        const initials = getInitials(emp.full_name);
        const phone = emp.phone ? `<span class="text-[10px] text-slate-400">📞 ${emp.phone}</span>` : '';

        return `
            <div onclick="selectTailorFromCustomDropdown('${emp.id}', '${emp.full_name}')"
                class="flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${isSelected ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold' : 'hover:bg-slate-100 dark:hover:bg-white/5 font-semibold'}">
                <div class="flex items-center gap-2.5">
                    <div class="w-8 h-8 rounded-xl bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0 shadow-sm">
                        ${initials}
                    </div>
                    <div>
                        <div class="text-xs" style="color: var(--text-main);">${emp.full_name}</div>
                        ${phone}
                    </div>
                </div>
                ${isSelected ? '<span class="text-blue-600 dark:text-blue-400 font-black text-sm">✓</span>' : ''}
            </div>
        `;
    }).join('');
}

function filterTailorMenu(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        renderTailorDropdown(allEmployees);
        return;
    }
    const filtered = allEmployees.filter(e => 
        e.full_name.toLowerCase().includes(q) || (e.phone && e.phone.toLowerCase().includes(q))
    );
    renderTailorDropdown(filtered);
}

function toggleTailorCustomDropdown() {
    const menu = document.getElementById('tailor_select_menu');
    const chevron = document.getElementById('tailor_select_chevron');
    if (!menu) return;

    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
        menu.classList.remove('hidden');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
        const searchInput = document.getElementById('tailor_menu_search');
        if (searchInput) {
            searchInput.value = '';
            renderTailorDropdown(allEmployees);
            setTimeout(() => searchInput.focus(), 50);
        }
    } else {
        closeTailorCustomDropdown();
    }
}

function closeTailorCustomDropdown() {
    const menu = document.getElementById('tailor_select_menu');
    const chevron = document.getElementById('tailor_select_chevron');
    if (menu) menu.classList.add('hidden');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
}

function selectTailorFromCustomDropdown(id, name) {
    closeTailorCustomDropdown();
    selectEmployee(id, name);
}

function selectEmployee(id, name) {
    currentEmployee = { id, full_name: name };

    const label = document.getElementById('tailor_select_label');
    const avatar = document.getElementById('tailor_select_avatar');
    if (label) label.innerText = name;
    if (avatar) avatar.innerText = getInitials(name);

    const emptyState = document.getElementById('ledger_empty_state');
    const activeContent = document.getElementById('ledger_active_content');
    if (emptyState) emptyState.classList.add('hidden');
    if (activeContent) activeContent.classList.remove('hidden');

    const tailorName = document.getElementById('ledger_tailor_name');
    if (tailorName) tailorName.innerText = name;

    const tailorAvatar = document.getElementById('ledger_tailor_avatar');
    if (tailorAvatar) tailorAvatar.innerText = getInitials(name);

    renderTailorDropdown();
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
    const label = document.getElementById('tailor_select_label');
    const avatar = document.getElementById('tailor_select_avatar');
    if (label) label.innerText = '-- Choose Tailor to Manage --';
    if (avatar) avatar.innerText = '🧵';

    const emptyState = document.getElementById('ledger_empty_state');
    const activeContent = document.getElementById('ledger_active_content');
    if (emptyState) emptyState.classList.remove('hidden');
    if (activeContent) activeContent.classList.add('hidden');

    productionEntries = [];
    advances = [];
    renderTailorDropdown();
    updateDisplays();
}

async function addNewEmployee() {
    const nameInput = document.getElementById('new_employee_name');
    const phoneInput = document.getElementById('new_employee_phone');
    const name = nameInput.value.trim();
    const phone = phoneInput ? phoneInput.value.trim() : '';

    if (!name) {
        showToast("Please enter tailor full name", "error");
        return;
    }

    setSyncStatus('syncing');
    try {
        let insertObj = { full_name: name };
        if (phone) insertObj.phone = phone;

        let { error } = await db.from('employees').insert([insertObj]);
        
        // If column 'phone' doesn't exist in Supabase table schema, fallback gracefully
        if (error && phone) {
            const fallback = await db.from('employees').insert([{ full_name: name }]);
            error = fallback.error;
        }

        if (error) throw error;
        nameInput.value = '';
        if (phoneInput) phoneInput.value = '';
        await fetchEmployees();
        showToast(`${name} added to team!`, "success");
        setSyncStatus('success');
    } catch (err) {
        console.error("Add employee error:", err);
        setSyncStatus('error');
        showToast("Failed to add tailor or tailor already exists", "error");
    }
}

function fireEmployee(id, name) {
    const modal = document.getElementById('confirm_modal');
    const nameSpan = document.getElementById('confirm_emp_name');
    const fireBtn = document.getElementById('confirm_fire_btn');

    nameSpan.innerText = name;
    modal.classList.remove('hidden');

    fireBtn.onclick = async () => {
        setSyncStatus('syncing');
        try {
            const { error } = await db.from('employees').delete().eq('id', id);
            if (error) throw error;

            await fetchEmployees();
            closeConfirmModal();
            setSyncStatus('success');
            showToast(`${name} removed.`, "info");

            if (currentEmployee && currentEmployee.id === id) {
                clearSelection();
            }
        } catch (err) {
            console.error("Fire employee error:", err);
            setSyncStatus('error');
            showToast("Failed to remove tailor.", "error");
        }
    };
}

function closeConfirmModal() {
    const modal = document.getElementById('confirm_modal');
    if (modal) modal.classList.add('hidden');
}

let editingEmployeeId = null;

function openEditContactModal(id, name, currentPhone) {
    editingEmployeeId = id;
    const nameLabel = document.getElementById('edit_emp_name');
    const phoneInput = document.getElementById('edit_emp_phone');
    if (nameLabel) nameLabel.innerText = `Tailor: ${name}`;
    if (phoneInput) phoneInput.value = currentPhone || '';
    const modal = document.getElementById('edit_contact_modal');
    if (modal) modal.classList.remove('hidden');
}

function closeEditContactModal() {
    editingEmployeeId = null;
    const modal = document.getElementById('edit_contact_modal');
    if (modal) modal.classList.add('hidden');
}

async function saveTailorContact() {
    if (!editingEmployeeId) return;
    const phoneInput = document.getElementById('edit_emp_phone');
    const phone = phoneInput ? phoneInput.value.trim() : '';

    setSyncStatus('syncing');
    try {
        const { error } = await db.from('employees').update({ phone: phone }).eq('id', editingEmployeeId);
        if (error) throw error;
        closeEditContactModal();
        await fetchEmployees();
        showToast("Tailor contact updated in cloud!", "success");
        setSyncStatus('success');
    } catch (err) {
        console.error("Update phone error:", err);
        setSyncStatus('error');
        showToast("Could not update contact. Ensure 'phone' column exists in Supabase table.", "error");
    }
}

function renderStaffList(list = allEmployees) {
    const container = document.getElementById('staff_full_list');
    if (!container) return;

    const data = list || allEmployees;
    if (data.length === 0) {
        container.innerHTML = `<div class="col-span-full p-8 text-center text-slate-400 italic text-xs glass-card rounded-2xl">No tailors registered. Add tailor above.</div>`;
        return;
    }

    container.innerHTML = data.map(emp => {
        const initials = getInitials(emp.full_name);
        const phone = emp.phone || '';
        const phoneHtml = phone ? `
            <div class="flex items-center gap-1.5 mt-0.5">
                <a href="tel:${phone}" class="text-[11px] text-blue-500 hover:underline flex items-center gap-1 font-medium">
                    <span>📞</span><span>${phone}</span>
                </a>
                <button onclick="openEditContactModal('${emp.id}', '${emp.full_name}', '${phone}')" class="text-[10px] text-slate-400 hover:text-blue-500 transition-all" title="Edit Phone Number">✏️</button>
            </div>
        ` : `
            <div class="flex items-center gap-1 mt-0.5">
                <button onclick="openEditContactModal('${emp.id}', '${emp.full_name}', '')" class="text-[10px] font-bold text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md transition-all">
                    + Add Phone
                </button>
            </div>
        `;

        return `
            <div class="glass-card card-hover rounded-2xl p-4 flex justify-between items-center">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-sm shrink-0">
                        ${initials}
                    </div>
                    <div>
                        <h4 class="font-bold text-sm leading-tight" style="color: var(--text-main);">${emp.full_name}</h4>
                        ${phoneHtml}
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="selectEmployeeByName('${emp.full_name}')"
                        class="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-2 rounded-xl hover:bg-blue-100 transition-all flex items-center gap-1">
                        <span>Open Ledger</span>
                    </button>
                    <button onclick="fireEmployee('${emp.id}', '${emp.full_name}')" title="Remove"
                        class="text-xs font-bold text-slate-400 hover:text-red-500 p-2 rounded-xl transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

let currentDashboardPeriod = 'all';

function toggleDashPeriodDropdown() {
    const menu = document.getElementById('dash_period_menu');
    const chevron = document.getElementById('dash_period_chevron');
    if (!menu) return;
    const isHidden = menu.classList.contains('hidden');
    if (isHidden) {
        menu.classList.remove('hidden');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
        closeDashPeriodDropdown();
    }
}

function closeDashPeriodDropdown() {
    const menu = document.getElementById('dash_period_menu');
    const chevron = document.getElementById('dash_period_chevron');
    if (menu) menu.classList.add('hidden');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
}

function selectDashPeriod(period, labelText) {
    const label = document.getElementById('dash_period_label');
    if (label) label.innerText = labelText;

    ['all', 'month', 'week', 'today'].forEach(p => {
        const check = document.getElementById(`check_period_${p}`);
        if (check) {
            if (p === period) check.classList.remove('hidden');
            else check.classList.add('hidden');
        }
    });

    closeDashPeriodDropdown();
    setDashboardPeriod(period);
}

function setDashboardPeriod(period) {
    currentDashboardPeriod = period;
    ['all', 'month', 'week', 'today'].forEach(p => {
        const btn = document.getElementById(`dash_period_${p}`);
        if (btn) {
            if (p === period) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });

    const labelMap = {
        all: '📅 All Time (Since Start)',
        month: '📅 This Month',
        week: '📅 This Week',
        today: '📅 Today'
    };
    const label = document.getElementById('dash_period_label');
    if (label && labelMap[period]) label.innerText = labelMap[period];

    ['all', 'month', 'week', 'today'].forEach(p => {
        const check = document.getElementById(`check_period_${p}`);
        if (check) {
            if (p === period) check.classList.remove('hidden');
            else check.classList.add('hidden');
        }
    });

    fetchGlobalOverview();
}

function isDateInDashboardPeriod(isoDate, period) {
    if (period === 'all' || !isoDate) return true;
    const d = new Date(isoDate);
    const now = new Date();

    if (period === 'today') {
        return d.toDateString() === now.toDateString();
    }
    if (period === 'month') {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (period === 'week') {
        const startOfWeek = new Date(now);
        const day = startOfWeek.getDay() || 7;
        startOfWeek.setDate(startOfWeek.getDate() - day + 1);
        startOfWeek.setHours(0, 0, 0, 0);
        return d >= startOfWeek && d <= now;
    }
    return true;
}

// --- Global Overview Dashboard ---

async function fetchGlobalOverview() {
    const listContainer = document.getElementById('global_stats_list');
    if (!listContainer) return;

    listContainer.innerHTML = `<div class="p-8 text-center text-slate-400 italic text-sm">Calculating tailor balances...</div>`;
    setSyncStatus('syncing');

    try {
        const [prodRes, payRes, empRes] = await Promise.all([
            db.from('production_logs').select('employee_name, quantity, unit_cost, created_at'),
            db.from('payment_logs').select('employee_name, amount_paid, created_at'),
            db.from('employees').select('id, full_name, phone')
        ]);

        if (prodRes.error || payRes.error || empRes.error) throw new Error("Could not fetch dashboard data");

        const staffStats = {};
        empRes.data.forEach(e => staffStats[e.full_name] = { 
            id: e.id, 
            phone: e.phone, 
            periodGross: 0, 
            periodPaid: 0, 
            allTimeGross: 0, 
            allTimePaid: 0 
        });

        prodRes.data.forEach(p => {
            if (staffStats[p.employee_name]) {
                const val = (p.quantity * p.unit_cost);
                staffStats[p.employee_name].allTimeGross += val;
                if (isDateInDashboardPeriod(p.created_at, currentDashboardPeriod)) {
                    staffStats[p.employee_name].periodGross += val;
                }
            }
        });

        payRes.data.forEach(p => {
            if (staffStats[p.employee_name]) {
                const amt = (parseFloat(p.amount_paid) || 0);
                staffStats[p.employee_name].allTimePaid += amt;
                if (isDateInDashboardPeriod(p.created_at, currentDashboardPeriod)) {
                    staffStats[p.employee_name].periodPaid += amt;
                }
            }
        });

        let totalPeriodGross = 0;
        let totalPeriodPaid = 0;
        let actualCashPayoutDue = 0;
        let totalOutstandingAdvances = 0;

        const statsArray = Object.entries(staffStats).map(([name, data]) => {
            totalPeriodGross += data.periodGross;
            totalPeriodPaid += data.periodPaid;
            const runningBalance = data.allTimeGross - data.allTimePaid;
            if (runningBalance > 0) {
                actualCashPayoutDue += runningBalance;
            } else if (runningBalance < 0) {
                totalOutstandingAdvances += Math.abs(runningBalance);
            }
            return {
                id: data.id,
                name,
                phone: data.phone,
                gross: data.periodGross,
                paid: data.periodPaid,
                balance: runningBalance
            };
        }).sort((a, b) => b.balance - a.balance);

        // Update Top Banner Stats
        const statWork = document.getElementById('stat_total_work');
        const statPaid = document.getElementById('stat_total_paid');
        const statDue = document.getElementById('stat_total_due');
        if (statWork) statWork.innerText = formatMoney(totalPeriodGross);
        if (statPaid) statPaid.innerText = formatMoney(totalPeriodPaid);
        if (statDue) statDue.innerText = formatMoney(actualCashPayoutDue);

        dashboardStatsList = statsArray;
        renderDashboardStats(statsArray);
        setSyncStatus('success');
    } catch (err) {
        console.error("Dashboard error:", err);
        listContainer.innerHTML = `<div class="p-8 text-center text-red-500 italic text-xs glass-card rounded-2xl">Could not load dashboard statistics. Check connection.</div>`;
        setSyncStatus('error');
    }
}

function handlePrint() {
    const label = document.getElementById('print_date_label');
    if (label) {
        label.innerText = new Date().toLocaleDateString('en-GB', { 
            day: '2-digit', 
            month: 'short', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    window.print();
}

function filterDashboardTailors(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        renderDashboardStats(dashboardStatsList);
        return;
    }
    const filtered = dashboardStatsList.filter(s => 
        s.name.toLowerCase().includes(q) || (s.phone && s.phone.toLowerCase().includes(q))
    );
    renderDashboardStats(filtered);
}

function filterTeamTailors(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        renderStaffList(allEmployees);
        return;
    }
    const filtered = allEmployees.filter(e => 
        e.full_name.toLowerCase().includes(q) || (e.phone && e.phone.toLowerCase().includes(q))
    );
    renderStaffList(filtered);
}

function renderDashboardStats(list) {
    const listContainer = document.getElementById('global_stats_list');
    if (!listContainer) return;

    if (list.length === 0) {
        listContainer.innerHTML = `<div class="p-8 text-center text-slate-400 italic text-xs glass-card rounded-2xl">No matching tailors found.</div>`;
        return;
    }

    listContainer.innerHTML = list.map(s => {
        const initials = getInitials(s.name);
        const isSettled = s.balance === 0;
        const isAdvance = s.balance < 0;

        let balanceHtml = `<span class="text-xs font-black px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/30">Due: ${formatMoney(s.balance)}</span>`;
        if (isSettled) {
            balanceHtml = `<span class="text-xs font-black px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-900 dark:text-emerald-300 border border-emerald-500/30">✓ Fully Settled</span>`;
        } else if (isAdvance) {
            balanceHtml = `<span class="text-xs font-black px-3 py-1.5 rounded-xl bg-red-500/15 text-red-900 dark:text-red-300 border border-red-500/30">${formatMoney(s.balance)} (Tailor Owes)</span>`;
        }

        const phoneSnippet = s.phone ? `<span class="text-[11px] text-blue-500 font-medium">📞 ${s.phone}</span><span>•</span>` : '';

        return `
        <div class="glass-card card-hover rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex items-center gap-3">
                <div class="w-11 h-11 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center text-sm shrink-0 shadow-sm">
                    ${initials}
                </div>
                <div>
                    <h3 class="font-bold text-sm" style="color: var(--text-main);">${s.name}</h3>
                    <div class="flex items-center gap-2 text-xs font-semibold mt-0.5" style="color: var(--text-muted);">
                        ${phoneSnippet}
                        <span>Earned: <strong style="color: var(--text-main);" class="font-bold">${formatMoney(s.gross)}</strong></span>
                        <span>•</span>
                        <span>Paid: <strong class="text-emerald-700 dark:text-emerald-400 font-bold">${formatMoney(s.paid)}</strong></span>
                    </div>
                </div>
            </div>

            <div class="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-black/5 dark:border-white/5">
                <div class="text-left sm:text-right">
                    ${balanceHtml}
                </div>
                <button onclick="selectEmployeeByName('${s.name}')"
                    class="px-3.5 py-2 rounded-xl btn-primary text-xs font-bold flex items-center gap-1 shadow-sm">
                    <span>Ledger & Pay</span>
                </button>
            </div>
        </div>
    `}).join('');
}

// --- Toggle Add Work Form & Auto-Pricing ---

const GARMENT_STANDARD_RATES = {
    'Blazer': 150,
    'Trouser / Pant': 100,
    'Waist Coat': 100,
    'Shirt (Official/African)': 100,
    'Dress': 100,
    'Skirt': 100,
    'Repair / Alteration': 50
};

function onGarmentTypeChange(type) {
    const rateInput = document.getElementById('unit_cost');
    if (rateInput && GARMENT_STANDARD_RATES[type] !== undefined) {
        rateInput.value = GARMENT_STANDARD_RATES[type];
    }
    calculateEntryPreview();
}

function toggleAddWorkForm() {
    const sec = document.getElementById('add_work_section');
    const btn = document.getElementById('toggle_work_btn');
    if (!sec) return;

    const isHidden = sec.classList.contains('hidden');
    sec.classList.toggle('hidden', !isHidden);
    if (btn) btn.innerHTML = isHidden ? '<span>✕ Close Form</span>' : '<span>➕ Add Work</span>';

    if (isHidden) {
        const typeSelect = document.getElementById('garment_type');
        const qtyInput = document.getElementById('qty');
        const costInput = document.getElementById('unit_cost');
        if (typeSelect && (!costInput.value || costInput.value === '')) {
            onGarmentTypeChange(typeSelect.value);
        }
        if (qtyInput && !qtyInput.value) {
            qtyInput.value = '1';
        }
        calculateEntryPreview();
    }
}

function calculateEntryPreview() {
    const qty = parseInt(document.getElementById('qty').value) || 0;
    const cost = parseFloat(document.getElementById('unit_cost').value) || 0;
    const total = qty * cost;
    const preview = document.getElementById('entry_preview_amount');
    if (preview) preview.innerText = formatMoney(total);
}

// --- Filter Chips & Quick Date Helpers ---

function setLedgerFilter(type) {
    activeFilter = type;
    const chips = ['all', 'month', 'week', 'today'];
    chips.forEach(c => {
        const btn = document.getElementById(`filter_btn_${c}`);
        if (btn) btn.classList.toggle('active', c === type);
    });

    const customBtn = document.getElementById('filter_btn_custom');
    if (customBtn) customBtn.classList.remove('active');

    const customContainer = document.getElementById('custom_date_container');
    if (customContainer) customContainer.classList.add('hidden');

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const fromInput = document.getElementById('filter_from');
    const toInput = document.getElementById('filter_to');

    if (type === 'all') {
        if (fromInput) fromInput.value = '';
        if (toInput) toInput.value = '';
    } else if (type === 'today') {
        if (fromInput) fromInput.value = today;
        if (toInput) toInput.value = today;
    } else if (type === 'week') {
        const first = now.getDate() - now.getDay();
        const firstDay = new Date(new Date().setDate(first)).toISOString().split('T')[0];
        if (fromInput) fromInput.value = firstDay;
        if (toInput) toInput.value = today;
    } else if (type === 'month') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        if (fromInput) fromInput.value = firstDay;
        if (toInput) toInput.value = today;
    }

    loadFromCloud();
}

function toggleCustomDate() {
    const customContainer = document.getElementById('custom_date_container');
    const customBtn = document.getElementById('filter_btn_custom');
    if (!customContainer) return;

    const isHidden = customContainer.classList.contains('hidden');
    customContainer.classList.toggle('hidden', !isHidden);

    if (isHidden) {
        ['all', 'month', 'week', 'today'].forEach(c => {
            const btn = document.getElementById(`filter_btn_${c}`);
            if (btn) btn.classList.remove('active');
        });
        if (customBtn) customBtn.classList.add('active');
    }
}

function switchRecordView(view) {
    activeRecordView = view;
    const views = ['all', 'jobs', 'payments'];
    views.forEach(v => {
        const btn = document.getElementById(`view_btn_${v}`);
        if (btn) {
            btn.className = `text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all ${v === view ? 'bg-white dark:bg-white/10 shadow-sm text-slate-800 dark:text-slate-100' : 'text-slate-400'}`;
        }
    });
    renderLedgerRecords();
}

let currentEmployeeAllTimeBalance = 0;

// --- Cloud Data Fetching (Ledger) ---

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

        const [prodRes, payRes, allProdRes, allPayRes] = await Promise.all([
            prodQ.order('created_at', { ascending: false }),
            payQ.order('created_at', { ascending: false }),
            db.from('production_logs').select('quantity, unit_cost').eq('employee_name', currentEmployee.full_name),
            db.from('payment_logs').select('amount_paid').eq('employee_name', currentEmployee.full_name)
        ]);

        const allTimeGross = (allProdRes.data || []).reduce((s, d) => s + (d.quantity * d.unit_cost), 0);
        const allTimePaid = (allPayRes.data || []).reduce((s, d) => s + (parseFloat(d.amount_paid) || 0), 0);
        currentEmployeeAllTimeBalance = allTimeGross - allTimePaid;

        productionEntries = (prodRes.data || []).map(d => ({
            id: d.id,
            type: d.garment_type,
            qty: d.quantity,
            unit_cost: d.unit_cost,
            date: d.created_at,
            status: d.status || 'in_production'
        }));

        advances = (payRes.data || []).map(d => ({
            id: d.id,
            desc: d.description,
            amount: parseFloat(d.amount_paid) || 0,
            date: d.created_at,
            production_log_id: d.production_log_id || null
        }));

        setSyncStatus('success');
        updateDisplays();
    } catch (err) {
        console.error("Error loading tailor data:", err);
        setSyncStatus('error');
    }
}

function updateDisplays() {
    const gross = productionEntries.reduce((s, e) => s + (e.qty * e.unit_cost), 0);
    const paid = advances.reduce((s, a) => s + a.amount, 0);
    const balance = currentEmployeeAllTimeBalance;

    // Update Tailor Summary Card
    const statEarned = document.getElementById('ledger_stat_earned');
    const statPaid = document.getElementById('ledger_stat_paid');
    const statBalance = document.getElementById('ledger_stat_balance');
    const balanceBadge = document.getElementById('ledger_balance_badge');

    if (statEarned) statEarned.innerText = formatMoney(gross);
    if (statPaid) statPaid.innerText = formatMoney(paid);

    if (statBalance && balanceBadge) {
        if (balance > 0) {
            statBalance.innerText = formatMoney(balance);
            statBalance.className = "text-xs sm:text-base font-black font-heading text-amber-600 dark:text-amber-400";
            balanceBadge.innerText = `${formatMoney(balance)} Due`;
            balanceBadge.className = "text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400";
        } else if (balance === 0) {
            statBalance.innerText = "KSh 0.00";
            statBalance.className = "text-xs sm:text-base font-black font-heading text-emerald-600 dark:text-emerald-400";
            balanceBadge.innerText = "✓ Fully Settled";
            balanceBadge.className = "text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
        } else {
            statBalance.innerText = formatMoney(balance);
            statBalance.className = "text-xs sm:text-base font-black font-heading text-red-500 dark:text-red-400";
            balanceBadge.innerText = `${formatMoney(balance)} (Tailor Owes)`;
            balanceBadge.className = "text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-500 dark:text-red-400";
        }
    }

    // Update Footer if on Ledger Tab
    if (currentTab === 'ledger') {
        const displayTotal = document.getElementById('display_total');
        const displayPaid = document.getElementById('display_paid');
        const displayBalance = document.getElementById('display_balance');
        if (displayTotal) displayTotal.innerText = formatMoney(gross);
        if (displayPaid) displayPaid.innerText = formatMoney(paid);
        if (displayBalance) {
            displayBalance.innerText = formatMoney(balance);
            displayBalance.className = `text-base sm:text-lg font-black font-heading leading-tight ${balance < 0 ? 'text-red-500 dark:text-red-400' : (balance === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400')}`;
        }
    }

    renderLedgerRecords();
}

function renderLedgerRecords() {
    const list = document.getElementById('ledger_records_list');
    const badge = document.getElementById('records_count_badge');
    if (!list) return;

    const paidPerJob = {};
    advances.forEach(a => {
        if (a.production_log_id) {
            paidPerJob[a.production_log_id] = (paidPerJob[a.production_log_id] || 0) + a.amount;
        }
    });

    let records = [];

    if (activeRecordView === 'all' || activeRecordView === 'jobs') {
        productionEntries.forEach(e => {
            const total = e.qty * e.unit_cost;
            const paidAmt = paidPerJob[e.id] || 0;
            const remaining = Math.max(0, total - paidAmt);
            records.push({
                id: e.id,
                date: e.date,
                category: 'job',
                title: e.type,
                note: e.description || e.notes || '',
                subtitle: `${e.qty} pcs @ ${formatMoney(e.unit_cost)}`,
                total: total,
                paid: paidAmt,
                remaining: remaining,
                status: e.status
            });
        });
    }

    if (activeRecordView === 'all' || activeRecordView === 'payments') {
        advances.forEach(a => {
            const linkedJob = a.production_log_id ? productionEntries.find(e => e.id === a.production_log_id) : null;
            records.push({
                id: a.id,
                date: a.date,
                category: 'payment',
                title: linkedJob ? `Job Payment: ${linkedJob.type}` : (a.desc || 'Cash Advance'),
                subtitle: a.production_log_id ? 'Paid for Stitched Garment' : 'Cash Advance / Upkeep',
                total: a.amount
            });
        });
    }

    records.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (badge) badge.innerText = `${records.length} item${records.length === 1 ? '' : 's'}`;

    if (records.length === 0) {
        list.innerHTML = `<div class="p-8 text-center text-slate-400 italic text-xs glass-card rounded-2xl">No records found for this view/date filter.</div>`;
        return;
    }

    list.innerHTML = records.map(r => {
        if (r.category === 'job') {
            const isDone = r.status === 'completed';
            const isFullyPaid = r.remaining <= 0;
            return `
            <div class="glass-card card-hover rounded-2xl p-4 space-y-2.5">
                <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-base shrink-0">
                            ${isDone ? '✓' : '🧵'}
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h4 class="font-bold text-sm" style="color: var(--text-main);">${r.title}</h4>
                                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${isDone ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}">
                                    ${isDone ? 'Completed' : 'In Progress'}
                                </span>
                            </div>
                            <div class="text-xs font-medium mt-0.5" style="color: var(--text-muted);">
                                 ${formatDate(r.date)} • <strong>${r.subtitle}</strong>
                            </div>
                            ${r.note ? `
                                <div class="text-[11px] text-blue-600 dark:text-blue-400 font-semibold mt-1 flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded-md inline-flex">
                                    <span>🏷️</span><span>${r.note}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="text-right">
                        <div class="text-xs font-semibold text-slate-400">Total Earned</div>
                        <div class="text-sm font-black font-heading">${formatMoney(r.total)}</div>
                        <div class="text-[11px] font-bold ${isFullyPaid ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}">
                            ${isFullyPaid ? '✓ Fully Paid' : `Due: ${formatMoney(r.remaining)}`}
                        </div>
                    </div>
                </div>

                <!-- Actions -->
                <div class="flex items-center justify-end gap-2 pt-2 border-t border-black/5 dark:border-white/5">
                    ${!isFullyPaid ? `
                        <button onclick="quickPayJob('${r.id}')" class="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-all">
                            💳 Pay This Job
                        </button>
                    ` : ''}

                    ${!isDone ? `
                        <button onclick="markJobComplete('${r.id}')" class="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-all">
                            ✓ Mark Complete
                        </button>
                    ` : ''}

                    <button onclick="removeEntry('${r.id}')" title="Delete" class="text-slate-400 hover:text-red-500 p-1.5 rounded-lg transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>`;
        } else {
            return `
            <div class="glass-card card-hover rounded-2xl p-3.5 flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center text-base shrink-0">
                        💳
                    </div>
                    <div>
                        <h4 class="font-bold text-xs text-slate-800 dark:text-slate-200">${r.title}</h4>
                        <div class="text-[11px] text-slate-400">${formatDate(r.date)} • <span class="font-semibold">${r.subtitle}</span></div>
                    </div>
                </div>

                <div class="flex items-center gap-3">
                    <span class="text-sm font-black text-emerald-600 dark:text-emerald-400 font-heading">
                        -${formatMoney(r.total)}
                    </span>
                    <button onclick="removeAdvance('${r.id}')" title="Delete" class="text-slate-300 hover:text-red-500 p-1">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>`;
        }
    }).join('');
}

// --- CRUD ---

async function addEntry() {
    if (!currentEmployee) {
        showToast("Select a tailor first", "error");
        return;
    }

    const type = document.getElementById('garment_type').value;
    const qty = parseInt(document.getElementById('qty').value);
    const cost = parseFloat(document.getElementById('unit_cost').value);
    const date = document.getElementById('log_date').value;
    const noteInput = document.getElementById('order_note');
    const note = noteInput ? noteInput.value.trim() : '';

    if (isNaN(qty) || qty <= 0) {
        showToast("Enter valid quantity sewn", "error");
        return;
    }
    if (isNaN(cost) || cost < 0) {
        showToast("Enter valid rate per piece", "error");
        return;
    }

    setSyncStatus('syncing');
    try {
        const insertObj = {
            employee_name: currentEmployee.full_name,
            garment_type: type,
            quantity: qty,
            unit_cost: cost
        };
        if (date) insertObj.created_at = date + 'T12:00:00';
        if (note) insertObj.description = note;

        let { data, error } = await db.from('production_logs').insert([insertObj]).select();
        
        // If description column not present in schema, fallback gracefully
        if (error && note) {
            delete insertObj.description;
            const fallback = await db.from('production_logs').insert([insertObj]).select();
            data = fallback.data;
            error = fallback.error;
        }

        if (error) throw error;

        productionEntries.unshift({
            ...data[0],
            date: data[0].created_at,
            qty: data[0].quantity,
            unit_cost: data[0].unit_cost,
            type: data[0].garment_type,
            description: note || data[0].description || '',
            status: data[0].status || 'in_production'
        });

        document.getElementById('qty').value = '1';
        if (noteInput) noteInput.value = '';
        const typeSelect = document.getElementById('garment_type');
        if (typeSelect) onGarmentTypeChange(typeSelect.value);
        calculateEntryPreview();
        toggleAddWorkForm(); // Close form after saving

        setSyncStatus('success');
        updateDisplays();
        showToast(`Saved: ${qty} ${type} logged!`, "success");
    } catch (err) {
        console.error("Add entry error:", err);
        setSyncStatus('error');
        showToast("Failed to save entry", "error");
    }
}

// --- Payment Modal ---

let selectedJobId = null;

function openPaymentModal() {
    if (!currentEmployee) {
        showToast("Select a tailor first", "error");
        return;
    }

    selectedJobId = null;
    const label = document.getElementById('modal_tailor_label');
    if (label) label.innerText = `Recipient: ${currentEmployee.full_name}`;

    const jobForm = document.getElementById('pay_job_form');
    if (jobForm) jobForm.classList.add('hidden');

    const expDesc = document.getElementById('pay_exp_desc');
    if (expDesc) expDesc.value = '';

    const expAmt = document.getElementById('pay_exp_amount');
    if (expAmt) expAmt.value = '';

    switchPaymentTab('job');
    renderPayJobList();
    const modal = document.getElementById('payment_modal');
    if (modal) modal.classList.remove('hidden');
}

function quickPayJob(jobId) {
    openPaymentModal();
    selectJobForPayment(jobId);
}

function closePaymentModal() {
    const modal = document.getElementById('payment_modal');
    if (modal) modal.classList.add('hidden');
}

function switchPaymentTab(tab) {
    const isJob = tab === 'job';
    const tabJob = document.getElementById('pay_tab_job');
    const tabExp = document.getElementById('pay_tab_expense');
    const panJob = document.getElementById('pay_panel_job');
    const panExp = document.getElementById('pay_panel_expense');

    if (tabJob) tabJob.className = `flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${isJob ? 'bg-white dark:bg-white/10 shadow-sm' : 'text-slate-400'}`;
    if (tabExp) tabExp.className = `flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${!isJob ? 'bg-white dark:bg-white/10 shadow-sm' : 'text-slate-400'}`;
    if (panJob) panJob.classList.toggle('hidden', !isJob);
    if (panExp) panExp.classList.toggle('hidden', isJob);
}

function renderPayJobList() {
    const paidPerJob = {};
    advances.forEach(a => {
        if (a.production_log_id) {
            paidPerJob[a.production_log_id] = (paidPerJob[a.production_log_id] || 0) + a.amount;
        }
    });

    const list = document.getElementById('pay_job_list');
    if (!list) return;

    if (productionEntries.length === 0) {
        list.innerHTML = '<div class="p-6 text-center text-slate-400 italic text-xs">No garment entries found. Use "Cash Advance" tab instead.</div>';
        return;
    }

    list.innerHTML = productionEntries.map(e => {
        const total = e.qty * e.unit_cost;
        const paidAmt = paidPerJob[e.id] || 0;
        const remaining = Math.max(0, total - paidAmt);
        const isDone = e.status === 'completed';
        const isSelected = selectedJobId === e.id;

        return `
        <div onclick="selectJobForPayment('${e.id}')"
            class="p-3 rounded-2xl border-2 cursor-pointer transition-all ${isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40' : 'border-transparent bg-slate-50 dark:bg-white/5 hover:border-slate-300'}"
            id="pay_job_item_${e.id}">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <span class="text-base">${isDone ? '✓' : '🧵'}</span>
                    <div>
                        <div class="text-xs font-bold">${e.type} <span class="text-slate-400 font-normal">(${e.qty} pcs)</span></div>
                        <div class="text-[10px] text-slate-400">${formatDate(e.date)}</div>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-xs font-bold">${formatMoney(total)}</div>
                    <div class="text-[11px] font-bold ${remaining <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}">
                        ${remaining <= 0 ? '✓ Paid' : `Due: ${formatMoney(remaining)}`}
                    </div>
                </div>
            </div>
        </div>`;
    }).join('');
}

function selectJobForPayment(jobId) {
    selectedJobId = jobId;
    const paidPerJob = {};
    advances.forEach(a => {
        if (a.production_log_id) {
            paidPerJob[a.production_log_id] = (paidPerJob[a.production_log_id] || 0) + a.amount;
        }
    });

    const job = productionEntries.find(e => e.id === jobId);
    if (!job) return;

    const total = job.qty * job.unit_cost;
    const paidAmt = paidPerJob[jobId] || 0;
    const remaining = Math.max(0, total - paidAmt);

    document.getElementById('pay_job_selected_label').textContent = `Paying for: ${job.type} (${job.qty} pcs)`;
    document.getElementById('pay_job_value').textContent = formatMoney(total);
    document.getElementById('pay_job_paid').textContent = formatMoney(paidAmt);
    document.getElementById('pay_job_amount').value = remaining > 0 ? remaining : '';
    document.getElementById('pay_job_form').classList.remove('hidden');

    document.querySelectorAll('[id^="pay_job_item_"]').forEach(el => {
        el.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-950/40');
        el.classList.add('border-transparent');
    });
    const sel = document.getElementById(`pay_job_item_${jobId}`);
    if (sel) {
        sel.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-950/40');
        sel.classList.remove('border-transparent');
    }
}

async function submitJobPayment() {
    if (!currentEmployee || !selectedJobId) {
        showToast("Please choose a job to pay for", "error");
        return;
    }
    const amount = parseFloat(document.getElementById('pay_job_amount').value);
    if (isNaN(amount) || amount <= 0) {
        showToast("Enter a valid payment amount", "error");
        return;
    }

    const job = productionEntries.find(e => e.id === selectedJobId);
    setSyncStatus('syncing');
    try {
        const insertObj = {
            employee_name: currentEmployee.full_name,
            amount_paid: amount,
            description: `Job Payment: ${job ? job.type : 'Garment'}`,
            production_log_id: selectedJobId
        };
        const date = document.getElementById('log_date') ? document.getElementById('log_date').value : '';
        if (date) insertObj.created_at = date + 'T12:00:00';

        const { data, error } = await db.from('payment_logs').insert([insertObj]).select();
        if (error) throw error;

        advances.unshift({
            ...data[0],
            date: data[0].created_at,
            amount: parseFloat(data[0].amount_paid) || 0,
            desc: data[0].description,
            production_log_id: data[0].production_log_id
        });

        closePaymentModal();
        setSyncStatus('success');
        updateDisplays();
        showToast(`Paid ${formatMoney(amount)} to ${currentEmployee.full_name}`, "success");
    } catch (err) {
        console.error("Payment error:", err);
        setSyncStatus('error');
        showToast("Failed to record payment", "error");
    }
}

async function submitExpensePayment() {
    if (!currentEmployee) {
        showToast("Select a tailor first", "error");
        return;
    }
    const desc = document.getElementById('pay_exp_desc').value.trim();
    const amount = parseFloat(document.getElementById('pay_exp_amount').value);
    if (isNaN(amount) || amount <= 0) {
        showToast("Enter a valid amount", "error");
        return;
    }

    setSyncStatus('syncing');
    try {
        const insertObj = {
            employee_name: currentEmployee.full_name,
            amount_paid: amount,
            description: desc || 'Cash Advance / Upkeep'
        };
        const date = document.getElementById('log_date') ? document.getElementById('log_date').value : '';
        if (date) insertObj.created_at = date + 'T12:00:00';

        const { data, error } = await db.from('payment_logs').insert([insertObj]).select();
        if (error) throw error;

        advances.unshift({
            ...data[0],
            date: data[0].created_at,
            amount: parseFloat(data[0].amount_paid) || 0,
            desc: data[0].description,
            production_log_id: null
        });

        closePaymentModal();
        setSyncStatus('success');
        updateDisplays();
        showToast(`Recorded advance of ${formatMoney(amount)}`, "success");
    } catch (err) {
        console.error("Cash advance error:", err);
        setSyncStatus('error');
        showToast("Failed to record advance", "error");
    }
}

async function markJobComplete(id) {
    setSyncStatus('syncing');
    try {
        const { error } = await db.from('production_logs').update({ status: 'completed' }).eq('id', id);
        if (error) throw error;
        const entry = productionEntries.find(e => e.id === id);
        if (entry) entry.status = 'completed';
        setSyncStatus('success');
        updateDisplays();
        showToast("Garment marked as Completed!", "success");
    } catch (err) {
        console.error("Mark complete error:", err);
        setSyncStatus('error');
        showToast("Failed to update status", "error");
    }
}

async function removeEntry(id) {
    if (!confirm("Delete this garment record?")) return;
    setSyncStatus('syncing');
    try {
        await db.from('production_logs').delete().eq('id', id);
        productionEntries = productionEntries.filter(e => e.id !== id);
        updateDisplays();
        setSyncStatus('success');
        showToast("Garment record deleted", "info");
    } catch (err) {
        console.error("Delete error:", err);
        setSyncStatus('error');
        showToast("Failed to delete", "error");
    }
}

async function removeAdvance(id) {
    if (!confirm("Delete this payment record?")) return;
    setSyncStatus('syncing');
    try {
        await db.from('payment_logs').delete().eq('id', id);
        advances = advances.filter(a => a.id !== id);
        updateDisplays();
        setSyncStatus('success');
        showToast("Payment record deleted", "info");
    } catch (err) {
        console.error("Delete payment error:", err);
        setSyncStatus('error');
        showToast("Failed to delete", "error");
    }
}

// --- Activity Feed ---

async function fetchGlobalTransactions() {
    const listContainer = document.getElementById('global_transactions_list');
    if (!listContainer) return;

    listContainer.innerHTML = '<div class="p-12 text-center text-slate-400 italic text-sm">Loading activity log...</div>';
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
                desc: `Stitched: ${p.garment_type} (${p.quantity} pcs)`,
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
                desc: p.description || 'Cash Payment',
                amount: parseFloat(p.amount_paid) || 0,
                isCredit: false
            });
        });

        allTxs.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (allTxs.length === 0) {
            listContainer.innerHTML = '<div class="p-12 text-center text-slate-400 italic text-sm glass-card rounded-2xl">No recent activity recorded.</div>';
        } else {
            listContainer.innerHTML = allTxs.map(tx => `
                <div class="glass-card card-hover rounded-2xl p-4 flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl ${tx.isCredit ? 'bg-blue-500/10 text-blue-600' : 'bg-emerald-500/10 text-emerald-600'} flex items-center justify-center text-base shrink-0">
                            ${tx.isCredit ? '🧵' : '💳'}
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h4 class="text-sm font-bold">${tx.employee}</h4>
                                <span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${tx.isCredit ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}">
                                    ${tx.isCredit ? 'Work Earned' : 'Cash Payout'}
                                </span>
                            </div>
                            <div class="text-xs text-slate-400 font-medium mt-0.5">
                                ${formatDate(tx.date)} • ${tx.desc}
                            </div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-sm font-black font-heading ${tx.isCredit ? 'text-slate-800 dark:text-slate-200' : 'text-emerald-600 dark:text-emerald-400'}">
                            ${tx.isCredit ? '+' : '-'}${formatMoney(tx.amount)}
                        </div>
                    </div>
                </div>
            `).join('');
        }

        setSyncStatus('success');
    } catch (err) {
        console.error("Error fetching transactions:", err);
        listContainer.innerHTML = '<div class="p-12 text-center text-red-500 italic text-sm">Error loading activity feed.</div>';
        setSyncStatus('error');
    }
}