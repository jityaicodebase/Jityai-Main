// ============================================
// STATE MANAGEMENT
// ============================================
let currentPersona = 'owner';
let currentStoreId = localStorage.getItem('lastStoreId') || '';
let inventoryData = [];
let reorderCart = [];
let currentRejectionRec = null;
let selectedRejectionReason = null;

// Pagination & Filter state
let registryPageSize = 50;
let registryVisibleCount = 50;
let ownerRecPageSize = 50;
let ownerRecVisibleCount = 50;
let currentRecommendationFilter = 'ALL';
let currentTrackerOutcomeFilter = 'ALL';
let trackerHistory = [];

/**
 * UI Formatting Helper
 * Removes underscores and capitalizes words for a professional look.
 */
function formatLabel(str) {
    if (!str) return '';
    return str.toString().toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Premium UI Notifications
 */
function showToast(message, type = 'success', duration = 4000) {
    const container = document.getElementById('notifications-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: '✅',
        warning: '⚠️',
        danger: '🚫',
        info: 'ℹ️'
    };

    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || '✨'}</div>
        <div class="toast-message">${message}</div>
        <div class="toast-close" onclick="this.parentElement.remove()">✕</div>
    `;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

// ============================================
// INITIALIZATION
// ============================================
// ============================================
// INITIALIZATION
// ============================================
window.onload = async () => {
    // 1. Get authenticated user data
    const userData = window.auth.getUserData();

    // 2. Guardrail: If no user data, redirect to login (double check)
    if (!userData || !userData.store_id) {
        window.location.href = '/login.html';
        return;
    }

    // 3. Set Global Store Context
    currentStoreId = userData.store_id;
    console.log(`🚀 Loaded context for store: ${currentStoreId}`);

    // 4. Update UI Labels
    // 4. Update UI Labels
    const storeBadgeName = document.getElementById('store-owner-name');
    const locationDisplay = document.getElementById('current-location-display');

    if (storeBadgeName) {
        // Top right badge shows Store Name
        storeBadgeName.innerText = userData.store_name || 'My Store';
    }

    if (locationDisplay) {
        // Operations Hub box shows Location
        locationDisplay.innerText = userData.store_location || 'Location Not Set';
    }

    // 5. Initial cart load
    reorderCart = JSON.parse(localStorage.getItem('reorderCart_' + currentStoreId) || '[]');
    updateCartBadge();
    renderCart();

    // 6. Check if first-time user (no inventory data)
    await checkFirstTimeUser();
};

/**
 * Check if this is a first-time user with no data
 * Shows onboarding screen if store has no inventory
 */
async function checkFirstTimeUser() {
    try {
        const res = await window.auth.apiRequest('/api/products');
        const data = await res.json();

        const hasData = data.success && data.products && data.products.length > 0;

        if (!hasData) {
            // First-time user - show onboarding
            showOnboarding();
        } else {
            // Has data - show normal dashboard
            hideOnboarding();
            refreshView();
        }
    } catch (e) {
        console.error('Error checking first-time user:', e);
        // On error, show normal dashboard
        refreshView();
    }
}

/**
 * Show the onboarding welcome screen
 */
function showOnboarding() {
    document.body.classList.add('onboarding-active');
    const onboardingEl = document.getElementById('onboarding-welcome');
    if (onboardingEl) {
        onboardingEl.style.display = 'flex';
    }

    // Pre-fill and hide redundant fields if we already have them from registration
    const userData = window.auth.getUserData();
    if (userData) {
        const nameInput = document.getElementById('onboard-name');
        const locInput = document.getElementById('onboard-location');
        const nameContainer = document.getElementById('onboard-name-container');
        const locContainer = document.getElementById('onboard-location-container');

        if (userData.store_name) {
            if (nameInput) nameInput.value = userData.store_name;
            if (nameContainer) nameContainer.style.display = 'none';
        }

        if (userData.store_location) {
            if (locInput) locInput.value = userData.store_location;
            if (locContainer) locContainer.style.display = 'none';
        }
    }

    console.log('📋 First-time user detected - showing onboarding');
}

/**
 * Hide onboarding and show normal dashboard
 */
function hideOnboarding() {
    document.body.classList.remove('onboarding-active');
    const onboardingEl = document.getElementById('onboarding-welcome');
    if (onboardingEl) {
        onboardingEl.style.display = 'none';
    }
}

/**
 * Download sample inventory format
 */
function showSampleFormat() {
    // Create sample CSV (Removed category as it's not required for onboarding)
    const sampleCSV = `item_id,product_name,quantity,selling_price,cost_price
SKU001,Maggi Noodles 2-Min 70g,45,14.00,11.00
SKU002,Amul Butter 500g,12,280.00,245.00
SKU003,Tata Salt 1kg,30,28.00,22.00
SKU004,Parle-G Biscuit 100g,60,10.00,8.00
SKU005,Surf Excel Detergent 1kg,18,220.00,190.00`;

    const blob = new Blob([sampleCSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'JityAI_Sample_Inventory.csv';
    link.click();
    URL.revokeObjectURL(url);

    showToast('Sample format downloaded!', 'success');
    return false; // Prevent default link behavior
}



function switchPersona(p) {
    currentPersona = p;

    // Updated mapping for renamed personas
    const personaMap = {
        'owner': 'Insights',
        'tracker': 'Tracker',
        'manager': 'Inventory',
        'reports': 'Reports'
    };

    document.querySelectorAll('.persona-btn').forEach(b => {
        const text = b.innerText.trim();
        b.classList.toggle('active', text.includes(personaMap[p]));
    });

    document.getElementById('owner-view').classList.toggle('active', p === 'owner');
    document.getElementById('tracker-view').classList.toggle('active', p === 'tracker');
    document.getElementById('manager-view').classList.toggle('active', p === 'manager');
    document.getElementById('reports-view').classList.toggle('active', p === 'reports'); // Added
    document.getElementById('registry-view').classList.remove('active');

    // Remove any leftover expanded styles if they exist
    const switcher = document.querySelector('.persona-switcher');
    if (switcher) {
        switcher.style.flex = 'none';
        switcher.style.width = 'fit-content';
    }

    if (p !== 'reports') refreshView();
}

function showFullRegistry() {
    document.getElementById('owner-view').classList.remove('active');
    document.getElementById('tracker-view').classList.remove('active');
    document.getElementById('manager-view').classList.remove('active');
    document.getElementById('registry-view').classList.add('active');

    registryVisibleCount = registryPageSize; // Reset scroll
    renderFullRegistry(inventoryData);
}

async function refreshView() {
    if (!currentStoreId) {
        showEmptyStatePrompt();
        return;
    }

    if (currentPersona === 'owner') {
        loadOwnerDashboard();
    } else if (currentPersona === 'tracker') {
        loadTrackerDashboard();
    } else {
        loadManagerDashboard();
    }
}

function showEmptyStatePrompt() {
    const content = `
        <div class="empty" style="max-width: 500px; margin: 100px auto;">
            <div style="font-size: 64px; margin-bottom: 24px;">🏢</div>
            <h2>No Locations Found</h2>
            <p style="color: var(--text-secondary); margin-bottom: 32px;">JityAi needs at least one store location with inventory data to begin analysis.</p>
            <button class="btn btn-primary" onclick="openModal('onboard-modal')">Add Your First Store</button>
        </div>
    `;
    document.getElementById('owner-view').innerHTML = content;
    document.getElementById('manager-view').innerHTML = content;
    document.getElementById('owner-view').classList.add('active');
    document.getElementById('manager-view').classList.remove('active');
}

// ============================================
// OWNER LOGIC
// ============================================
let ownerRecommendations = [];

async function loadOwnerDashboard() {
    try {
        const [sumRes, recRes] = await Promise.all([
            window.auth.apiRequest(`/api/inventory-ai/summary/${currentStoreId}`),
            window.auth.apiRequest(`/api/inventory-ai/recommendations/${currentStoreId}?status=PENDING`)
        ]);

        const sumData = await sumRes.json();
        const recData = await recRes.json();

        if (sumData.success) {
            document.getElementById('owner-sales-prot').innerText = `₹${sumData.summary.salesProtected}`;
            document.getElementById('owner-cash-block').innerText = `₹${sumData.summary.cashBlocked}`;
        }

        ownerRecommendations = recData.recommendations || [];
        ownerRecVisibleCount = ownerRecPageSize; // Reset on load
        renderOwnerRecommendations();
    } catch (e) {
        console.error('Error loading owner dashboard:', e);
    }
}

function filterRecommendations(cat) {
    currentRecommendationFilter = cat;

    // Update UI buttons
    document.querySelectorAll('.insight-nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-category') === cat);
    });

    ownerRecVisibleCount = ownerRecPageSize; // Reset scroll
    renderOwnerRecommendations();
}

function renderOwnerRecommendations() {
    const list = document.getElementById('decision-list');
    if (!list) return;

    let filtered = ownerRecommendations;
    if (currentRecommendationFilter !== 'ALL') {
        filtered = ownerRecommendations.filter(r => r.insight_category === currentRecommendationFilter);
    }

    // 1. Enforce Uniqueness: One SKU = One Card
    const unique = [];
    const seen = new Set();
    filtered.forEach(r => {
        if (!seen.has(r.store_item_id)) {
            unique.push(r);
            seen.add(r.store_item_id);
        }
    });

    if (unique.length > 0) {
        const visibleRecs = unique.slice(0, ownerRecVisibleCount);

        const catMeta = {
            'BUY_MORE': { title: 'Restock Priorities', color: '#ef4444' },
            'BUY_LESS': { title: 'Overstock Reductions', color: '#f59e0b' },
            'MONITOR': { title: 'Strategic Watchlist', color: '#10b981' }
        };

        const grouped = {};
        visibleRecs.forEach(r => {
            const cat = r.insight_category || 'MONITOR';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(r);
        });

        list.innerHTML = Object.entries(grouped).map(([cat, recs]) => {
            const config = catMeta[cat] || catMeta['MONITOR'];
            return `
                <div style="grid-column: 1/-1; margin-top: 40px; border-bottom: 2px solid var(--border); padding-bottom: 16px; display: flex; align-items: center; gap: 16px; margin-bottom: 12px;">
                    <div style="width: 12px; height: 12px; border-radius: 4px; background: ${config.color}; box-shadow: 0 0 10px ${config.color}44;"></div>
                    <h3 style="margin: 0; color: hsl(var(--foreground)); text-transform: uppercase; font-size: 14px; letter-spacing: 0.2em; font-weight: 900;">${config.title}</h3>
                    <div style="flex: 1; height: 1px; background: var(--border); margin: 0 12px;"></div>
                    <span style="font-size: 12px; color: var(--text-secondary); font-weight: 600; background: var(--border); padding: 4px 10px; border-radius: 20px;">${recs.length} SKUs</span>
                </div>
                ${recs.map(rec => {
                const isBuyMore = rec.insight_category === 'BUY_MORE';
                const isBuyLess = rec.insight_category === 'BUY_LESS';
                const isMonitor = rec.insight_category === 'MONITOR';

                const stockDays = Math.round(rec.days_of_cover || 0);
                const urgencyColor = isBuyMore ? '#ef4444' : isBuyLess ? '#f59e0b' : '#10b981';

                // CLEAN REASONING: Remove jargon & clarify ambiguous quantities
                const cleanReasoning = (rec.reasoning_text || '')
                    .replace(/Strategic reasoning temporarily unavailable\./gi, '')
                    .replace(/Recommendation based on System Math: [A-Z_]+/gi, '')
                    .replace(/Deterministic Proto/gi, '')
                    .replace(/Quantity determined by system math/gi, '')
                    .split('•')
                    .map(s => s.trim())
                    .filter(s => s.length > 5)
                    .map(s => {
                        if (isBuyLess && s.toLowerCase().includes('quantity:')) {
                            return s.replace(/quantity:/i, 'Excess Stock to Liquidate:');
                        }
                        if (isBuyMore && s.toLowerCase().includes('quantity:')) {
                            return s.replace(/quantity:/i, 'Units to Restock:');
                        }
                        return s;
                    });

                const whyBullets = [
                    `Stock lasts ~${stockDays} days`,
                    `Target coverage: ${rec.pw || 7} days`
                ];

                return `
                    <div class="card action-card ${isMonitor ? 'monitor-card-passive' : ''}" 
                         style="display: flex; flex-direction: column; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); min-height: auto; position: relative; padding: 16px; ${isMonitor ? 'opacity: 0.7; border-style: dashed;' : ''}">
                        
                        <!-- 1. HEADER SIGNAL -->
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                             <div style="font-size: 11px; font-weight: 900; color: ${urgencyColor}; text-transform: uppercase; letter-spacing: 0.05em; display: flex; align-items: center; gap: 6px;">
                                <span style="width: 6px; height: 6px; border-radius: 50%; background: ${urgencyColor}; ${isBuyMore && stockDays < 3 ? 'animation: pulse 2s infinite;' : ''}"></span>
                                ${isMonitor ? 'SAFE' : `${stockDays} DAYS REMAINING`}
                             </div>
                             <span class="risk-badge" style="font-size: 8px; padding: 3px 8px; border-radius: 4px; font-weight: 700; ${['CRITICAL', 'RISK', 'HIGH'].includes(rec.risk_state) ? 'background: #ef44441a; color: #ef4444; border: 1px solid #ef4444;' : ['WARNING', 'MEDIUM', 'LOW'].includes(rec.risk_state) ? 'background: #f59e0b1a; color: #f59e0b; border: 1px solid #f59e0b;' : 'background: #10b9811a; color: #10b981; border: 1px solid #10b981;'}">${formatLabel(rec.risk_state)}</span>
                        </div>

                        <!-- 2. SKU NAME -->
                        <div style="font-weight: 700; font-size: 15px; color:hsl(var(--foreground)); line-height: 1.3; font-family: 'Outfit', sans-serif; margin-bottom: 16px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 40px;">
                            ${rec.normalized_product_name}
                        </div>

                        <!-- 3. PRIMARY DECISION/SIGNAL -->
                        <div style="background: rgba(255,255,255,0.02); border-radius: 10px; padding: 14px; margin-bottom: 16px; border: 1px solid var(--border);">
                            ${isBuyMore ? `
                                <div style="font-size: 20px; font-weight: 900; background: linear-gradient(135deg, #f97316, #fb923c); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                                    Restock: ${Math.round(rec.recommended_order_quantity)} Units
                                </div>
                                <div style="font-size: 13px; color: var(--text-secondary); font-weight: 500; margin-top: 4px;">
                                    ₹${Math.round((rec.recommended_order_quantity || 0) * (rec.cost_price || 0)).toLocaleString('en-IN')} Estimated Cost
                                </div>
                            ` : isBuyLess ? `
                                <div style="font-size: 18px; font-weight: 900; color: #f59e0b;">
                                    ₹${Math.round(parseFloat(rec.current_stock || 0) * parseFloat(rec.cost_price || 0)).toLocaleString('en-IN')} Cash Blocked
                                </div>
                                <div style="font-size: 12px; font-weight: 700; color: var(--text-secondary); margin-top: 4px; text-transform: uppercase;">
                                    Excess Inventory → REDUCE STOCK
                                </div>
                            ` : `
                                <div style="font-size: 14px; font-weight: 900; color: #10b981; text-align: center;">
                                    Stock lasts ${stockDays} days
                                </div>
                                <div style="font-size: 11px; color: var(--text-secondary); text-align: center; margin-top: 4px; font-weight: 600;">
                                    Status: Optimal Holding
                                </div>
                            `}
                        </div>

                        <!-- 4. WHY BULLETS & INTEL -->
                        ${!isMonitor ? `
                            <div style="margin-bottom: 16px;">
                                ${whyBullets.map(b => `<div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">• ${b}</div>`).join('')}
                                
                                <details style="margin-top: 12px; cursor: pointer;">
                                    <summary style="font-size: 9px; color: var(--text-secondary); font-weight: 800; text-transform: uppercase; list-style: none; display: flex; align-items: center; gap: 4px; opacity: 0.6;">
                                        <span>Show Strategic Reason</span>
                                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>
                                    </summary>
                                    <div style="margin-top: 8px; font-size: 11px; color: var(--text-secondary); line-height: 1.4; border-left: 1px solid var(--border); padding-left: 8px;">
                                        ${cleanReasoning.length > 0 ? cleanReasoning.join('<br>') : 'System math validated replenishment requirement.'}
                                    </div>
                                </details>
                            </div>
                        ` : ''}

                        <!-- 5. TRUST MARKER & CTAs -->
                        ${!isMonitor ? `
                            <div style="margin-top: auto;">
                                <div style="font-size: 9px; color: var(--text-secondary); opacity: 0.4; margin-bottom: 12px; font-style: italic;">
                                    Quantity determined by system math
                                </div>
                                <div style="display: flex; gap: 8px;">
                                    <button class="btn btn-outline" style="flex: 1; height: 38px; font-size: 11px;" onclick="handleRecommendationAction('${rec.recommendation_id}', 'ignore')">${isBuyLess ? 'Ignore' : 'Skip'}</button>
                                    <button class="btn btn-primary" style="flex: 2; height: 38px; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="handleRecommendationAction('${rec.recommendation_id}', 'accept')">
                                        ${isBuyMore ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> Add to Order` : 'Accept'}
                                    </button>
                                    <button class="btn btn-outline" style="width: 38px; height: 38px; padding: 0; display: flex; align-items: center; justify-content: center;" onclick="openEditModal('${rec.store_item_id}')" title="Edit Item Data">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    </button>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('')}
            `;
        }).join('');

        // Handle Load More button
        let loadMoreBtn = document.getElementById('recommendations-load-more');
        if (!loadMoreBtn) {
            const container = document.getElementById('recommendations-pagination-container');
            if (container) {
                loadMoreBtn = document.createElement('button');
                loadMoreBtn.id = 'recommendations-load-more';
                loadMoreBtn.className = 'btn btn-outline';
                loadMoreBtn.style = 'margin: 40px auto; display: block; width: 240px;';
                loadMoreBtn.onclick = () => {
                    ownerRecVisibleCount += ownerRecPageSize;
                    renderOwnerRecommendations();
                };
                container.appendChild(loadMoreBtn);
            }
        }

        if (loadMoreBtn) {
            const remaining = ownerRecommendations.length - ownerRecVisibleCount;
            if (remaining > 0) {
                loadMoreBtn.style.display = 'block';
                loadMoreBtn.innerText = `Show ${Math.min(remaining, ownerRecPageSize)} More Actions`;
            } else {
                loadMoreBtn.style.display = 'none';
            }
        }
    } else {
        list.innerHTML = `<div class="empty" style="grid-column: 1/-1">✅ No pending decisions. Your stock levels are healthy!</div>`;
    }
}

function handleRecommendationAction(recId, action) {
    const rec = ownerRecommendations.find(r => r.recommendation_id === recId);
    if (!rec) return;
    if (action === 'accept') {
        acceptRecommendation(rec);
    } else {
        openRejectionModal(rec);
    }
}

function loadOwnerView() { loadOwnerDashboard(); }

// ============================================
// TRACKER LOGIC
// ============================================
async function loadTrackerDashboard() {
    const body = document.getElementById('tracker-body');
    if (!body) return;
    body.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px;">🔍 Analyzing decision chain...</td></tr>`;

    try {
        const res = await window.auth.apiRequest(`/api/inventory-ai/history/${currentStoreId}`);
        const data = await res.json();

        if (data.success && data.history.length > 0) {
            trackerHistory = data.history;

            // Calculate Impact Metrics
            let capitalSaved = 0;
            let revenueLost = 0;
            let validatedCount = 0;

            trackerHistory.forEach(item => {
                if (item.realized_outcome === 'Opportunity Saved' && item.feedback_status === 'ACCEPTED') {
                    capitalSaved += Math.abs(item.financial_impact_cash || 0);
                    validatedCount++;
                } else if (item.realized_outcome === 'Opportunity Lost' && item.feedback_status === 'REJECTED') {
                    revenueLost += Math.abs(item.financial_impact_cash || 0);
                    validatedCount++;
                }
            });

            // Update Impact Bar with safety checks
            const capEl = document.getElementById('tracker-capital-saved');
            const revEl = document.getElementById('tracker-revenue-lost');

            if (capEl) capEl.textContent = `₹${Math.round(capitalSaved).toLocaleString('en-IN')}`;
            if (revEl) revEl.textContent = `₹${Math.round(revenueLost).toLocaleString('en-IN')}`;

            // Render filtered results
            renderTrackerTable();
        } else {
            body.innerHTML = `<tr><td colspan="5" class="empty">No historical decisions tracked yet. Accept or ignore some recommendations first!</td></tr>`;
        }
    } catch (e) {
        body.innerHTML = `<tr><td colspan="5" class="empty" style="color:var(--accent-red)">Error loading tracker: ${e.message}</td></tr>`;
    }
}

function filterTrackerOutcome(outcome) {
    currentTrackerOutcomeFilter = outcome;

    // Update active button
    document.querySelectorAll('[data-outcome]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.outcome === outcome);
    });

    renderTrackerTable();
}

function renderTrackerTable() {
    const body = document.getElementById('tracker-body');
    if (!body) return;

    let filtered = trackerHistory;
    if (currentTrackerOutcomeFilter !== 'ALL') {
        filtered = trackerHistory.filter(item => {
            if (currentTrackerOutcomeFilter === 'REJECTED') {
                return item.feedback_status === 'REJECTED' || item.feedback_status === 'IGNORED';
            }
            return item.feedback_status === currentTrackerOutcomeFilter;
        });
    }

    if (filtered.length === 0) {
        body.innerHTML = `<tr><td colspan="5" class="empty">No ${currentTrackerOutcomeFilter.toLowerCase()} decisions found.</td></tr>`;
        return;
    }

    body.innerHTML = filtered.map(item => {
        const date = new Date(item.processed_at || item.generated_at).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
        });

        // VERIFIED OUTCOME LOGIC
        let outcomeHTML = '';
        const actual = parseFloat(item.current_stock_actual || 0);
        const ads = parseFloat(item.weighted_ads || 0);

        if (item.realized_outcome === 'Opportunity Saved') {
            outcomeHTML = `
                <div class="outcome-verified success">
                    <span class="verification-tag tag-verified">Verified</span>
                    Opportunity Saved
                </div>
                <div style="font-size:10px; color:var(--text-secondary); margin-top:4px;">
                    ₹${Math.abs(item.financial_impact_cash).toLocaleString('en-IN')} revenue protected via refill.
                </div>
            `;
        } else if (item.realized_outcome === 'Opportunity Lost') {
            outcomeHTML = `
                <div class="outcome-verified failure">
                    <span class="verification-tag tag-verified">Verified</span>
                    Opportunity Lost
                </div>
                <div style="font-size:10px; color:var(--text-secondary); margin-top:4px;">
                    ₹${Math.abs(item.financial_impact_cash).toLocaleString('en-IN')} lost due to stockout during demand.
                </div>
            `;
        } else if (item.outcome_check_count < 7 && !item.realized_outcome) {
            outcomeHTML = `
                <div class="outcome-monitoring">
                    <span class="verification-tag tag-monitoring">Monitoring</span>
                    Reality Check (Day ${item.outcome_check_count || 1}/7)
                </div>
                <div style="font-size:10px; color:var(--text-secondary); margin-top:4px;">
                    Current Stock: ${Math.round(actual)} • No high-confidence signal yet.
                </div>
            `;
        } else {
            outcomeHTML = `
                <div class="outcome-unresolved">
                    <span class="verification-tag tag-closed">Closed</span>
                    Unresolved Outcome
                </div>
                <div style="font-size:10px; color:var(--text-secondary); margin-top:4px;">
                    Insufficient confidence to label after 7 days of tracking.
                </div>
            `;
        }

        return `
            <tr>
                <td style="max-width:320px;">
                    <div style="font-weight:600; color:hsl(var(--foreground));">${item.normalized_product_name}</div>
                    <div style="font-size:12px; color:hsl(var(--secondary)); margin-top:4px; line-height:1.4;">
                        "${item.reasoning_text ? item.reasoning_text.split('\\n')[0].replace('•', '').trim() : 'System analysis...'}"
                    </div>
                </td>
                <td>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        <span class="risk-badge risk-${item.feedback_status === 'ACCEPTED' ? 'SAFE' : 'CRITICAL'}" 
                              style="font-size:10px; width:fit-content;">${item.feedback_status}</span>
                        <div style="font-size:11px; color:hsl(var(--secondary));">
                            ${item.feedback_reason || 'No specific note'}
                        </div>
                    </div>
                </td>
                <td>
                    <div style="font-weight:600;">${formatLabel(item.recommendation_type)}</div>
                    <div style="font-size:11px; color:hsl(var(--secondary));">Suggested: ${Math.round(item.recommended_order_quantity)} units</div>
                </td>
                <td>
                    ${outcomeHTML}
                </td>
                <td style="text-align:right; font-size:12px; color:var(--text-secondary); white-space:nowrap;">
                    ${date}
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================
// MANAGER LOGIC
// ============================================
async function loadManagerDashboard() {
    try {
        const [opsRes, invRes] = await Promise.all([
            window.auth.apiRequest(`/api/ops/summary/${currentStoreId}`),
            window.auth.apiRequest(`/api/inventory/full/${currentStoreId}`)
        ]);

        const opsData = await opsRes.json();
        const invDataRes = await invRes.json();

        if (opsData.success) {
            const s = opsData.stats;
            document.getElementById('ops-catalog-total').innerText = s.totalSKUs;
            document.getElementById('ops-catalog-categorized').innerText = `${s.categorized}/${s.totalSKUs} Categorized`;
            document.getElementById('ops-low-stock').innerText = s.lowStock;
            document.getElementById('ops-inventory-value').innerText = `₹${s.inventoryValue}`;

            if (s.latestSync) {
                document.getElementById('ops-sync-status').innerText = formatLabel(s.latestSync.status);
                document.getElementById('ops-sync-status').style.color = s.latestSync.status === 'completed' ? 'var(--accent-green)' : 'var(--accent-yellow)';
                document.getElementById('ops-sync-time').innerText = `Last: ${new Date(s.latestSync.completed_at).toLocaleString()}`;
            }
        }

        if (invDataRes.success) {
            inventoryData = invDataRes.items;
            populateCategoryFilter(inventoryData);
            renderInventoryTable(inventoryData);
        }
    } catch (e) {
        console.error('Error loading manager dashboard:', e);
    }
}

function renderInventoryTable(items) {
    const body = document.getElementById('inventory-body');
    if (!body) return;
    const limit = 10;
    const displayItems = items.slice(0, limit);

    body.innerHTML = displayItems.map(item => {
        // Status Logic
        const qty = Math.round(item.quantity_on_hand);
        let stockColor = 'var(--text-secondary)';
        let statusBadge = '';

        if (qty <= 3) {
            stockColor = '#ef4444'; // Red
            statusBadge = '<span style="font-size: 9px; background: #ef44441a; color: #ef4444; padding: 2px 4px; border-radius: 3px; font-weight: 700; margin-left: 6px;">CRITICAL</span>';
        } else if (qty <= 7) {
            stockColor = '#f59e0b'; // Amber
            statusBadge = '<span style="font-size: 9px; background: #f59e0b1a; color: #f59e0b; padding: 2px 4px; border-radius: 3px; font-weight: 700; margin-left: 6px;">LOW</span>';
        } else {
            stockColor = '#10b981'; // Green
            statusBadge = '<span style="font-size: 9px; background: #10b9811a; color: #10b981; padding: 2px 4px; border-radius: 3px; font-weight: 700; margin-left: 6px;">HEALTHY</span>';
        }

        return `
        <tr>
            <td style="font-family: monospace; font-size: 11px; color: var(--text-secondary);">
                <div style="display: flex; align-items: center; gap: 8px;">
                     <div style="width: 3px; height: 14px; border-radius: 2px; background: linear-gradient(to bottom, #f97316, #fb923c);"></div>
                     ${item.store_item_id}
                </div>
            </td>
            <td style="font-weight: 600;">${item.product_name}</td>
            <td><span style="background: var(--input); padding: 4px 8px; border-radius: 6px; font-size: 11px;">${formatLabel(item.category || 'Uncategorized')}</span></td>
            <td>
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <div style="font-weight: 700; color: var(--foreground); font-size: 14px;">
                        ${Math.round(item.quantity_on_hand)} ${item.stock_unit || ''}
                    </div>
                    <div style="color: ${stockColor}; font-weight: 800; font-size: 10px; text-transform: uppercase; display: flex; align-items: center; gap: 4px; letter-spacing: 0.05em;">
                        <span style="font-size: 14px; line-height: 0;">•</span> ${qty <= 3 ? 'CRITICAL' : qty <= 7 ? 'LOW STOCK' : 'HEALTHY'}
                    </div>
                </div>
            </td>
            <td style="color: var(--text-secondary);">₹${parseFloat(item.cost_price || 0).toFixed(2)}</td>
            <td style="font-weight: 600;">₹${parseFloat(item.selling_price || 0).toFixed(2)}</td>
            <td style="font-size: 11px; color: var(--text-secondary);">${item.as_of_date ? new Date(item.as_of_date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}</td>
            <td style="text-align: right;">
                <button class="btn btn-outline" style="padding: 4px 12px; font-size: 11px; border-radius: 6px;" 
                    onclick="openEditModal('${item.store_item_id}')">Edit</button>
            </td>
        </tr>
    `;
    }).join('');

    document.getElementById('view-all-container').style.display = items.length > limit ? 'block' : 'none';
}

function renderFullRegistry(items) {
    const body = document.getElementById('full-registry-body');
    if (!body) return;

    const displayItems = items.slice(0, registryVisibleCount);

    body.innerHTML = displayItems.map(item => {
        const qty = Math.round(item.quantity_on_hand);
        let stockColor = '#10b981'; // Green
        let statusText = 'HEALTHY';

        if (qty <= 3) {
            stockColor = '#ef4444'; // Red
            statusText = 'CRITICAL';
        } else if (qty <= 7) {
            stockColor = '#f59e0b'; // Amber
            statusText = 'LOW STOCK';
        }

        return `
        <tr>
            <td style="font-family: monospace; font-size: 11px; color: var(--text-secondary);">
                <div style="display: flex; align-items: center; gap: 8px;">
                     <div style="width: 3px; height: 14px; border-radius: 2px; background: linear-gradient(to bottom, #f97316, #fb923c);"></div>
                     ${item.store_item_id}
                </div>
            </td>
            <td style="font-weight: 600;">${item.product_name}</td>
            <td><span style="background: var(--input); padding: 4px 12px; border-radius: 8px; font-size: 12px;">${formatLabel(item.category || 'Uncategorized')}</span></td>
            <td style="font-weight: 700;">${Math.round(item.quantity_on_hand)} ${item.stock_unit || ''}</td>
            <td style="color: var(--text-secondary);">₹${parseFloat(item.cost_price || 0).toFixed(2)}</td>
            <td style="font-weight: 600;">₹${parseFloat(item.selling_price || 0).toFixed(2)}</td>
            <td>
                <div style="color: ${stockColor}; font-weight: 800; font-size: 10px; text-transform: uppercase; display: flex; align-items: center; gap: 4px; letter-spacing: 0.05em;">
                    <span style="font-size: 14px; line-height: 0;">•</span> ${statusText}
                </div>
            </td>
            <td style="text-align: right;">
                <button class="btn btn-outline" style="padding: 6px 16px; font-size: 12px; border-radius: 8px;" 
                    onclick="openEditModal('${item.store_item_id}')">Edit</button>
            </td>
        </tr>
    `;
    }).join('');

    // Handle Load More
    let loadMoreBtn = document.getElementById('registry-load-more');
    if (!loadMoreBtn) {
        const container = document.getElementById('registry-view');
        loadMoreBtn = document.createElement('button');
        loadMoreBtn.id = 'registry-load-more';
        loadMoreBtn.className = 'btn btn-outline';
        loadMoreBtn.style = 'margin: 20px auto; display: block; width: 200px;';
        loadMoreBtn.innerText = 'Load More SKUs';
        loadMoreBtn.onclick = () => {
            registryVisibleCount += registryPageSize;
            renderFullRegistry(items);
        };
        container.appendChild(loadMoreBtn);
    }

    loadMoreBtn.style.display = items.length > registryVisibleCount ? 'block' : 'none';
    loadMoreBtn.innerText = `Load More (${items.length - registryVisibleCount} remaining)`;
}

let filterTimeout;
function filterFullRegistry() {
    clearTimeout(filterTimeout);
    filterTimeout = setTimeout(() => {
        const term = document.getElementById('full-registry-search').value.toLowerCase();
        const filtered = inventoryData.filter(i =>
            (i.product_name || '').toLowerCase().includes(term) ||
            (i.store_item_id || '').toLowerCase().includes(term) ||
            (i.category && i.category.toLowerCase().includes(term))
        );
        registryVisibleCount = registryPageSize; // Reset to page 1 on search
        renderFullRegistry(filtered);
    }, 300); // 300ms debounce
}

// ============================================
// MODAL HELPERS
// ============================================
let currentEditingItemId = null;
function openModal(id) { document.getElementById(`${id}-overlay`).style.display = 'flex'; }
function closeModal(id) { document.getElementById(`${id}-overlay`).style.display = 'none'; }

function openEditModal(itemId) {
    let item = inventoryData.find(i => i.store_item_id === itemId);

    // Fallback: Check owner recommendations if not in full registry
    if (!item && typeof ownerRecommendations !== 'undefined') {
        const rec = ownerRecommendations.find(r => r.store_item_id === itemId || r.recommendation_id === itemId); // ID check safety
        if (rec) {
            item = {
                store_item_id: rec.store_item_id,
                product_name: rec.normalized_product_name || rec.product_name,
                quantity_on_hand: rec.current_stock,
                category: rec.category,
                cost_price: rec.cost_price,
                selling_price: rec.selling_price || 0 // SP might not be in recs, default to 0
            };
        }
    }

    if (!item) {
        console.error('Item not found for edit:', itemId);
        showToast('Error loading item data', 'danger');
        return;
    }

    currentEditingItemId = itemId;
    document.getElementById('edit-sku-id').innerText = `SKU: ${itemId}`;
    document.getElementById('edit-name').value = item.product_name || '';
    document.getElementById('edit-stock').value = item.quantity_on_hand !== undefined ? Math.round(item.quantity_on_hand) : 0;
    document.getElementById('edit-category').value = item.category || 'Uncategorized';
    document.getElementById('edit-cp').value = item.cost_price || 0;
    document.getElementById('edit-sp').value = item.selling_price || 0;
    document.getElementById('edit-reason').value = '';

    openModal('edit-modal');
}

async function submitEdit() {
    const payload = {
        storeId: currentStoreId,
        storeItemId: currentEditingItemId,
        quantity: parseFloat(document.getElementById('edit-stock').value),
        categoryName: document.getElementById('edit-category').value,
        costPrice: parseFloat(document.getElementById('edit-cp').value),
        sellingPrice: parseFloat(document.getElementById('edit-sp').value),
        reason: document.getElementById('edit-reason').value
    };

    const res = await window.auth.apiRequest('/api/inventory/update', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
        alert('Product updated successfully');
        closeModal('edit-modal');
        refreshView();
    } else {
        alert('Update failed: ' + data.error);
    }
}

function exportInventory() {
    if (!inventoryData.length) return alert('No data to export');

    const headers = ['Product Name', 'Category', 'Stock', 'Unit', 'Cost Price', 'Selling Price'];
    const rows = inventoryData.map(i => [
        `"${i.product_name}"`,
        `"${i.category || 'Uncategorized'}"`,
        i.quantity_on_hand,
        i.stock_unit || '',
        i.cost_price,
        i.selling_price
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `inventory_${currentStoreId}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

let invFilterTimeout;
function filterInventory() {
    clearTimeout(invFilterTimeout);
    invFilterTimeout = setTimeout(() => {
        const query = document.getElementById('inventory-search').value.toLowerCase();
        const categoryFilter = document.getElementById('inventory-filter-category').value;
        const stockFilter = document.getElementById('inventory-filter-stock').value;

        const filtered = inventoryData.filter(i => {
            // 1. Text Search (Name or SKU)
            const matchesText = (i.product_name || '').toLowerCase().includes(query) ||
                (i.store_item_id || '').toLowerCase().includes(query);

            // 2. Category Filter
            const matchesCategory = !categoryFilter || (i.category === categoryFilter);

            // 3. Stock Status Filter
            let matchesStock = true;
            if (stockFilter === 'low') matchesStock = i.quantity_on_hand <= 10 && i.quantity_on_hand > 0;
            else if (stockFilter === 'out') matchesStock = i.quantity_on_hand <= 0;
            else if (stockFilter === 'healthy') matchesStock = i.quantity_on_hand > 10;

            return matchesText && matchesCategory && matchesStock;
        });

        renderInventoryTable(filtered);
    }, 300);
}

function populateCategoryFilter(items) {
    const selector = document.getElementById('inventory-filter-category');
    if (!selector) return;

    // Extract unique non-null categories
    const categories = [...new Set(items.map(i => i.category).filter(c => c && c !== 'Unknown'))].sort();

    // Preserve existing selection if re-populating
    const currentSelection = selector.value;

    selector.innerHTML = `<option value="">All Categories</option>` +
        categories.map(c => `<option value="${c}">${formatLabel(c)}</option>`).join('');

    // Restore selection if valid
    if (categories.includes(currentSelection)) {
        selector.value = currentSelection;
    }
}

function handleFileSelect(inputId, nameId) {
    const file = document.getElementById(inputId).files[0];
    if (file) document.getElementById(nameId).innerText = `Selected: ${file.name}`;
}

// ============================================
// SYSTEM OPERATIONS
// ============================================

/**
 * Update the global agent status bar
 */
function updateAgentStatus(task, progress) {
    const bar = document.getElementById('agent-status-bar');
    const taskEl = document.getElementById('agent-task');
    const progressEl = document.getElementById('agent-progress-bar');
    const textEl = document.getElementById('agent-progress-text');

    if (bar) bar.style.display = 'flex';
    if (taskEl) taskEl.innerText = task;
    if (progressEl) progressEl.style.width = `${progress}%`;
    if (textEl) textEl.innerText = `${Math.round(progress)}%`;

    if (progress >= 100) {
        setTimeout(() => {
            if (bar) bar.style.display = 'none';
        }, 2000);
    }
}

async function submitSync() {
    const file = document.getElementById('sync-file').files[0];
    if (!file) return showToast('Select a file', 'warning');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('storeId', currentStoreId);

    const nameEl = document.getElementById('sync-file-name');
    if (nameEl) nameEl.innerText = 'Uploading...';
    updateAgentStatus('Uploading stock report...', 10);

    try {
        const res = await window.auth.apiRequest('/api/sync/inventory/upload', {
            method: 'POST',
            headers: { 'Content-Type': undefined },
            body: formData
        });

        updateAgentStatus('Refreshing inventory levels...', 60);
        const data = await res.json();

        if (data.success) {
            updateAgentStatus('Stock refresh complete!', 100);
            showToast('Stock refresh complete!', 'success');
            closeModal('sync-modal');
            setTimeout(() => location.reload(), 1500);
        } else {
            showToast('Sync failed: ' + data.error, 'danger');
            if (nameEl) nameEl.innerText = 'Drop CSV/Excel here';
        }
    } catch (e) {
        showToast('Error: ' + e.message, 'danger');
    }
}

async function submitOnboard() {
    const userData = window.auth.getUserData();
    const nameInput = document.getElementById('onboard-name');
    const locInput = document.getElementById('onboard-location');
    const fileInput = document.getElementById('onboard-file');

    const name = (nameInput && nameInput.value) || userData.store_name;
    const locationStr = (locInput && locInput.value) || userData.store_location;
    const file = fileInput ? fileInput.files[0] : null;

    if (!name || !file) return showToast('Catalog file is required', 'warning');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('storeId', userData.store_id);
    formData.append('storeName', name);
    formData.append('location', locationStr);

    const nameEl = document.getElementById('onboard-file-name');
    if (nameEl) nameEl.innerText = 'Uploading catalog...';
    updateAgentStatus(`Onboarding ${name}...`, 10);

    try {
        const res = await window.auth.apiRequest('/api/onboarding/upload', {
            method: 'POST',
            headers: { 'Content-Type': undefined },
            body: formData
        });

        updateAgentStatus('Analyzing inventory and categorizing products...', 50);
        const data = await res.json();

        if (data.success) {
            updateAgentStatus('Onboarding complete!', 100);
            showToast('Location setup complete!', 'success');

            // Update local userData with potentially new name/location
            userData.store_name = name;
            userData.store_location = locationStr;
            window.auth.setUserData(userData);

            setTimeout(() => location.reload(), 1500);
        } else {
            showToast('Failed: ' + data.error, 'danger');
            if (nameEl) nameEl.innerText = 'Select Master CSV/Excel';
        }
    } catch (e) {
        showToast('Error: ' + e.message, 'danger');
    }
}

// ============================================
// CART FUNCTIONS
// ============================================
function toggleCart() {
    document.getElementById('cart-panel').classList.toggle('open');
}

function updateCartBadge() {
    const countEl = document.getElementById('cart-count');
    if (reorderCart.length > 0) {
        countEl.style.display = 'flex';
        countEl.textContent = reorderCart.length;
    } else {
        countEl.style.display = 'none';
    }
}

function addToCart(rec) {
    const exists = reorderCart.find(c => c.skuId === rec.store_item_id);
    if (exists) {
        exists.quantity = Math.round(rec.recommended_order_quantity || 1);
    } else {
        reorderCart.push({
            skuId: rec.store_item_id,
            productName: rec.normalized_product_name || rec.product_name || 'Unknown Product',
            quantity: Math.round(rec.recommended_order_quantity || 1),
            costPrice: parseFloat(rec.cost_price || 0),
            recommendationId: rec.recommendation_id
        });
    }
    localStorage.setItem('reorderCart_' + currentStoreId, JSON.stringify(reorderCart));
    updateCartBadge();
    renderCart();
}

function removeFromCart(skuId) {
    reorderCart = reorderCart.filter(c => c.skuId !== skuId);
    localStorage.setItem('reorderCart_' + currentStoreId, JSON.stringify(reorderCart));
    updateCartBadge();
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items');
    if (reorderCart.length === 0) {
        container.innerHTML = `
            <div class="empty" style="padding: 60px 40px; text-align: center;">
                <div style="font-size: 48px; margin-bottom: 20px; opacity: 0.5;">🛒</div>
                <p style="font-weight: 600; color: hsl(var(--foreground));">Your reorder list is empty</p>
                <p style="font-size: 13px; color: hsl(var(--secondary)); margin-top: 8px;">Accept AI recommendations to build your procurement list.</p>
            </div>`;
        document.getElementById('cart-total-items').textContent = '0';
        document.getElementById('cart-total-cost').textContent = '₹0';
        return;
    }

    container.innerHTML = reorderCart.map(item => `
        <div class="cart-item">
            <div class="cart-item-header">
                <div class="cart-item-title">
                    <h4>${item.productName}</h4>
                    <span>SKU: ${item.skuId} • ₹${parseFloat(item.costPrice).toFixed(2)}/unit</span>
                </div>
                <button class="remove-item-btn" onclick="removeFromCart('${item.skuId}')" title="Remove item">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                </button>
            </div>
            
            <div class="cart-item-controls">
                <div class="qty-pill">
                    <label>Order Quantity</label>
                    <input type="number" class="cart-qty-input" value="${item.quantity}" min="1" 
                        onchange="updateCartQty('${item.skuId}', this.value)">
                </div>
                <div class="item-total-price">
                    <div class="label">Total Price</div>
                    <div class="value">₹${(item.quantity * item.costPrice).toLocaleString('en-IN')}</div>
                </div>
            </div>
        </div>
    `).join('');

    const totalItems = reorderCart.reduce((sum, i) => sum + i.quantity, 0);
    const totalCost = reorderCart.reduce((sum, i) => sum + (sum, i.quantity * i.costPrice), 0); // Note: Simple sum is easier
    const finalCost = reorderCart.reduce((sum, i) => sum + (i.quantity * i.costPrice), 0);

    document.getElementById('cart-total-items').textContent = totalItems;
    document.getElementById('cart-total-cost').textContent = '₹' + Math.round(finalCost).toLocaleString('en-IN');
}

function updateCartQty(skuId, qty) {
    const item = reorderCart.find(c => c.skuId === skuId);
    if (item) item.quantity = parseInt(qty) || 1;
    localStorage.setItem('reorderCart_' + currentStoreId, JSON.stringify(reorderCart));
    renderCart();
}

function clearCart() {
    if (!confirm('Clear all items from reorder list?')) return;
    reorderCart = [];
    localStorage.setItem('reorderCart_' + currentStoreId, JSON.stringify(reorderCart));
    updateCartBadge();
    renderCart();
}

function generatePO() {
    if (reorderCart.length === 0) return showToast('No items in cart', 'warning');

    let poText = `PURCHASE ORDER - ${new Date().toLocaleDateString('en-IN')}\n`;
    poText += `Store: ${currentStoreId}\n\n`;
    poText += `SKU ID | Product | Qty | Est. Cost\n`;
    poText += `${'─'.repeat(60)}\n`;

    reorderCart.forEach(item => {
        poText += `${item.skuId} | ${item.productName} | ${item.quantity} | ₹${(item.quantity * item.costPrice).toFixed(2)}\n`;
    });

    const totalCost = reorderCart.reduce((sum, i) => sum + (i.quantity * i.costPrice), 0);
    poText += `${'─'.repeat(60)}\n`;
    poText += `TOTAL: ₹${totalCost.toLocaleString('en-IN')}\n`;

    const blob = new Blob([poText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PO-${currentStoreId}-${Date.now()}.txt`;
    a.click();

    showToast('Purchase Order generated! Clear cart after ordering.', 'success');
}

// ============================================
// REJECTION FEEDBACK FUNCTIONS
// ============================================
function openRejectionModal(rec) {
    currentRejectionRec = rec;
    selectedRejectionReason = null;
    document.querySelectorAll('.rejection-option').forEach(o => o.classList.remove('selected'));
    document.getElementById('rejection-custom').value = '';
    document.getElementById('rejection-modal-overlay').style.display = 'flex';
}

function selectRejection(el, reason) {
    document.querySelectorAll('.rejection-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    selectedRejectionReason = reason;
}

async function submitRejection() {
    if (!selectedRejectionReason) return showToast('Please select a reason', 'warning');

    const customNote = document.getElementById('rejection-custom').value;
    const fullReason = selectedRejectionReason + (customNote ? ': ' + customNote : '');

    try {
        const res = await window.auth.apiRequest('/api/inventory-ai/feedback', {
            method: 'POST',
            body: JSON.stringify({
                recommendationId: currentRejectionRec.recommendation_id,
                status: 'IGNORED',
                reason: fullReason
            })
        });
        const data = await res.json();
        if (data.success) {
            closeModal('rejection-modal');
            showToast('Insight ignored. Strategy updated.', 'info');
            refreshView();
        } else {
            showToast('Failed to submit feedback', 'danger');
        }
    } catch (e) {
        showToast('Error: ' + e.message, 'danger');
    }
}

async function acceptRecommendation(rec) {
    const isBuyMore = rec.insight_category === 'BUY_MORE';
    const hasQuantity = (rec.recommended_order_quantity || 0) > 0;

    // Only add to cart if it's a restock action with quantity
    if (isBuyMore && hasQuantity) {
        addToCart(rec);
    }

    try {
        const res = await window.auth.apiRequest('/api/inventory-ai/feedback', {
            method: 'POST',
            body: JSON.stringify({
                recommendationId: rec.recommendation_id,
                status: 'ACCEPTED',
                reason: isBuyMore ? 'Added to reorder cart' : 'Insight accepted & tracked'
            })
        });
        const data = await res.json();
        if (data.success) {
            showToast(isBuyMore ? `${rec.normalized_product_name} added to cart & tracker` : `${rec.normalized_product_name} decision archived in tracker`, 'success');
            refreshView();
        }
    } catch (e) {
        console.error('Failed to update recommendation:', e);
        showToast('Local sync failed. Please refresh dashboard.', 'warning');
    }
}

// ============================================
// BARCODE SYSTEM
// ============================================
window.addEventListener('keydown', async (e) => {
    // Basic barcode scanner logic: most scanners act as a keyboard and end with "Enter"
    // We accumulate fast keystrokes
    if (!window._barcodeBuffer) window._barcodeBuffer = '';

    if (e.key === 'Enter' && window._barcodeBuffer.length > 5) {
        const barcode = window._barcodeBuffer;
        window._barcodeBuffer = '';
        console.log('📦 Barcode detected:', barcode);
        lookupBarcode(barcode);
    } else {
        if (e.key.length === 1) {
            window._barcodeBuffer += e.key;
            // Clear buffer if it sits too long (implies slow manual typing)
            clearTimeout(window._barcodeTimeout);
            window._barcodeTimeout = setTimeout(() => { window._barcodeBuffer = ''; }, 100);
        }
    }
});

async function lookupBarcode(barcode) {
    showAgentStatus('JityAi', `Searching for barcode: ${barcode}`);
    try {
        const res = await window.auth.apiRequest(`/api/inventory/barcode/${barcode}`);
        const data = await res.json();

        if (data.success) {
            hideAgentStatus();
            openEditModal(data.item.store_item_id);
        } else {
            updateAgentProgress(100, `Not found: ${barcode}`);
            setTimeout(hideAgentStatus, 2000);
        }
    } catch (e) {
        hideAgentStatus();
        console.error('Barcode lookup failed:', e);
    }
}

// ============================================
// AGENT STATUS BAR FUNCTIONS
// ============================================
function showAgentStatus(agentName, task) {
    document.getElementById('agent-name').textContent = 'JityAi';
    document.getElementById('agent-task').textContent = task;
    document.getElementById('agent-progress-bar').style.width = '0%';
    document.getElementById('agent-progress-text').textContent = '0%';
    document.getElementById('agent-status-bar').classList.add('active');
}

function updateAgentProgress(percent, task = null) {
    document.getElementById('agent-progress-bar').style.width = percent + '%';
    document.getElementById('agent-progress-text').textContent = Math.round(percent) + '%';
    if (task) document.getElementById('agent-task').textContent = task;
}

function hideAgentStatus() {
    document.getElementById('agent-status-bar').classList.remove('active');
}

// Initial Call
updateCartBadge();
renderCart();

/**
 * THEME MANAGEMENT
 */
function toggleTheme() {
    const body = document.body;
    body.classList.toggle('dark-mode');

    // Save preference
    const isDark = body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    // Update icon
    const btn = document.querySelector('.dark-mode-toggle');
    if (btn) {
        if (isDark) {
            btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
        } else {
            btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
        }
    }
}

// ============================================
// REPORTING MODULE
// ============================================
let reportPeriodDays = 7; // Default 7 days

function setReportPeriod(days) {
    reportPeriodDays = days;
    document.querySelectorAll('#report-time-filter .time-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes(days === 365 ? 'Yearly' : `${days}`)) {
            btn.classList.add('active');
        }
    });
}

async function loadReport(reportType) {
    const loader = document.getElementById('report-loader');
    const container = document.getElementById('report-output-container');
    const titleEl = document.getElementById('report-title');
    const metaEl = document.getElementById('report-meta');
    const tableEl = document.getElementById('report-table');

    container.style.display = 'none';
    loader.style.display = 'block';

    // Store current report type for export
    window.currentReportType = reportType;

    try {
        const res = await window.auth.apiRequest(`/api/reports/${reportType}?days=${reportPeriodDays}`);
        const data = await res.json();

        if (data.success) {
            titleEl.innerText = data.report.title;

            // Update meta info
            const rowCount = data.report.data ? data.report.data.length : 0;
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            metaEl.innerText = `${rowCount} item${rowCount !== 1 ? 's' : ''} • Generated at ${timeStr} • Period: ${reportPeriodDays} days`;

            // Store data for export
            window.currentReportData = data.report.data;
            window.currentReportTitle = data.report.title;

            renderReportTable(tableEl, data.report.data);
            loader.style.display = 'none';
            container.style.display = 'block';

            // Scroll to report
            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            showToast(data.error || 'Failed to generate report', 'danger');
            loader.style.display = 'none';
        }
    } catch (e) {
        console.error('Report error:', e);
        showToast('System error generating report', 'danger');
        loader.style.display = 'none';
    }
}

function renderReportTable(tableEl, rows) {
    if (!rows || rows.length === 0) {
        tableEl.innerHTML = `
            <thead><tr><th>Status</th></tr></thead>
            <tbody><tr><td class="report-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
                    <rect x="9" y="3" width="6" height="4" rx="2"/>
                    <path d="M9 14h.01M13 14h2"/>
                </svg>
                <p>No items found for this report criteria.</p>
            </td></tr></tbody>`;
        return;
    }

    const columns = Object.keys(rows[0]);

    // Column type detection for formatting
    const numericCols = ['stock', 'quantity', 'units', 'count', 'sales', 'days_of_cover',
        'weeks_of_supply', 'avg_daily_sales', 'safety_threshold', 'units_below_threshold',
        'weekly_sales', 'period_sales', 'total_units', 'sku_count'];
    const currencyCols = ['price', 'cost', 'value', 'capital', 'revenue', 'cogs', 'risk'];

    // Header
    let thead = '<thead><tr>';
    columns.forEach(col => {
        const isNumeric = numericCols.some(n => col.toLowerCase().includes(n));
        const isCurrency = currencyCols.some(c => col.toLowerCase().includes(c));
        const align = (isNumeric || isCurrency) ? ' style="text-align:right;"' : '';
        thead += `<th${align}>${formatLabel(col)}</th>`;
    });
    thead += '</tr></thead>';

    // Body
    let tbody = '<tbody>';
    rows.forEach((row, idx) => {
        tbody += '<tr>';
        columns.forEach(col => {
            let val = row[col];
            let classes = [];

            const isNumeric = numericCols.some(n => col.toLowerCase().includes(n));
            const isCurrency = currencyCols.some(c => col.toLowerCase().includes(c));

            // Format currency
            if (isCurrency && typeof val === 'number') {
                val = `₹${parseFloat(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                classes.push('currency');
            }
            // Format numbers
            else if (isNumeric && typeof val === 'number') {
                val = val % 1 !== 0 ? val.toFixed(2) : val;
                classes.push('num');
            }

            // Special formatting for specific columns
            if (col === 'product_name') {
                val = `<strong>${val}</strong>`;
            }
            if (col === 'days_of_cover') {
                if (parseFloat(row[col]) < 3) {
                    val = `<span class="status-pill critical">${val} days</span>`;
                } else if (parseFloat(row[col]) < 7) {
                    val = `<span class="status-pill warning">${val} days</span>`;
                } else {
                    val = `${val} days`;
                }
            }
            if (col === 'weeks_of_supply') {
                const wos = parseFloat(row[col]);
                if (wos < 2) {
                    val = `<span class="status-pill critical">${val}w</span>`;
                } else if (wos < 4) {
                    val = `<span class="status-pill warning">${val}w</span>`;
                } else if (wos >= 52) {
                    val = `<span class="status-pill success">52+ weeks</span>`;
                } else {
                    val = `${val} weeks`;
                }
            }
            if (col === 'age_bucket') {
                if (val.includes('Fresh')) {
                    val = `<span class="status-pill success">${val}</span>`;
                } else if (val.includes('Stale') || val.includes('90+')) {
                    val = `<span class="status-pill critical">${val}</span>`;
                }
            }

            const classStr = classes.length ? ` class="${classes.join(' ')}"` : '';
            const alignStyle = (isNumeric || isCurrency) ? ' style="text-align:right;"' : '';
            tbody += `<td${classStr}${alignStyle}>${val === null || val === undefined ? '-' : val}</td>`;
        });
        tbody += '</tr>';
    });
    tbody += '</tbody>';

    tableEl.innerHTML = thead + tbody;
}

/**
 * Export current report to Excel (CSV format)
 */
function exportReportToExcel() {
    if (!window.currentReportData || window.currentReportData.length === 0) {
        showToast('No data to export', 'warning');
        return;
    }

    const data = window.currentReportData;
    const title = window.currentReportTitle || 'Report';
    const columns = Object.keys(data[0]);

    // Build CSV content
    let csv = '\uFEFF'; // BOM for Excel UTF-8

    // Header row
    csv += columns.map(col => `"${formatLabel(col)}"`).join(',') + '\n';

    // Data rows
    data.forEach(row => {
        const values = columns.map(col => {
            let val = row[col];
            if (val === null || val === undefined) val = '';
            // Escape quotes and wrap in quotes
            val = String(val).replace(/"/g, '""');
            return `"${val}"`;
        });
        csv += values.join(',') + '\n';
    });

    // Create download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    // Generate filename
    const date = new Date().toISOString().split('T')[0];
    const safeName = title.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    link.href = url;
    link.download = `${safeName}_${date}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('Report exported successfully!', 'success');
}


// Init Theme
(function initTheme() {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
        document.body.classList.add('dark-mode');
        setTimeout(() => {
            const btn = document.querySelector('.dark-mode-toggle');
            if (btn) {
                btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
            }
        }, 100);
    }
})();
