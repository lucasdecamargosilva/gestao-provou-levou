# Tamagotchi Provinha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Tamagotchi mascot ("Provinha") to the dashboard that visually evolves based on two business axes: Growth (active stores) and Revenue (MRR).

**Architecture:** Pure frontend implementation. SVG illustrations composed of layered body + clothing. Data sourced from the existing `clients` array already loaded by `loadClients()`. New section injected between KPI cards and Package Breakdown in `index.html`.

**Tech Stack:** Vanilla JS, inline SVG, CSS animations. No new dependencies.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `index.html` | Modify (after line 115, before line 117) | Add Tamagotchi section HTML |
| `script.js` | Modify (add functions after PLAN_VALUES, call from updateStats) | Level calculation + SVG rendering logic |
| `style.css` | Modify (append at end) | Tamagotchi card, progress bars, animations |

---

### Task 1: Add Tamagotchi HTML Section

**Files:**
- Modify: `index.html:115-117` (between KPI stats-grid closing div and Package Breakdown h2)

- [ ] **Step 1: Add the Tamagotchi container HTML**

Insert after line 115 (closing `</div>` of the stats-grid) and before line 117 (`<!-- Package Breakdown -->`). Add this HTML:

```html
<!-- Tamagotchi Provinha -->
<div class="provinha-section">
    <div class="provinha-card glass">
        <div class="provinha-header">
            <h2 class="provinha-title">Provinha Status</h2>
        </div>
        <div class="provinha-body">
            <div class="provinha-avatar" id="provinha-avatar">
                <!-- SVG layers injected by JS -->
            </div>
            <div class="provinha-stage-name" id="provinha-stage-name">Carregando...</div>
        </div>
        <div class="provinha-bars">
            <div class="provinha-bar-group">
                <div class="provinha-bar-label">
                    <span><i class="fas fa-store"></i> Crescimento</span>
                    <span id="provinha-growth-text">0/4 lojistas (Nv.1)</span>
                </div>
                <div class="provinha-bar-track">
                    <div class="provinha-bar-fill provinha-bar-growth" id="provinha-growth-bar" style="width: 0%"></div>
                </div>
            </div>
            <div class="provinha-bar-group">
                <div class="provinha-bar-label">
                    <span><i class="fas fa-dollar-sign"></i> Receita</span>
                    <span id="provinha-revenue-text">R$0/R$201 (Nv.1)</span>
                </div>
                <div class="provinha-bar-track">
                    <div class="provinha-bar-fill provinha-bar-revenue" id="provinha-revenue-bar" style="width: 0%"></div>
                </div>
            </div>
        </div>
        <div class="provinha-indicators">
            <div class="provinha-indicator">
                <div class="provinha-indicator-value" id="provinha-ind-stores">0</div>
                <div class="provinha-indicator-label">Lojistas Ativos</div>
            </div>
            <div class="provinha-indicator">
                <div class="provinha-indicator-value" id="provinha-ind-mrr">R$ 0</div>
                <div class="provinha-indicator-label">MRR</div>
            </div>
            <div class="provinha-indicator">
                <div class="provinha-indicator-value" id="provinha-ind-affiliates">0</div>
                <div class="provinha-indicator-label">Afiliados</div>
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Verify the page renders without errors**

Open `index.html` in the browser. The Tamagotchi section should appear as an unstyled block between KPIs and Package cards. No JS errors in console.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add Tamagotchi Provinha HTML section to dashboard"
```

---

### Task 2: Add Tamagotchi CSS Styles

**Files:**
- Modify: `style.css` (append at end, after line 683)

- [ ] **Step 1: Add all Provinha styles**

Append to end of `style.css`:

```css
/* --- Tamagotchi Provinha --- */
.provinha-section {
    width: 100%;
}

.provinha-card {
    padding: 32px;
    border-radius: var(--border-radius);
    background: var(--card-bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    position: relative;
    overflow: hidden;
}

.provinha-card::before {
    content: '';
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle at 50% 50%, var(--primary-glow), transparent 60%);
    opacity: 0.15;
    pointer-events: none;
}

.provinha-header {
    text-align: center;
    position: relative;
}

.provinha-title {
    font-family: 'Outfit', sans-serif;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-main);
}

.provinha-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    position: relative;
}

.provinha-avatar {
    width: 160px;
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    animation: provinha-idle 3s ease-in-out infinite;
}

@keyframes provinha-idle {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-6px); }
}

.provinha-stage-name {
    font-family: 'Outfit', sans-serif;
    font-size: 16px;
    font-weight: 600;
    color: var(--accent);
    text-align: center;
}

.provinha-bars {
    width: 100%;
    max-width: 400px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.provinha-bar-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.provinha-bar-label {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: var(--text-muted);
}

.provinha-bar-label i {
    margin-right: 6px;
}

.provinha-bar-track {
    width: 100%;
    height: 10px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 5px;
    overflow: hidden;
}

.provinha-bar-fill {
    height: 100%;
    border-radius: 5px;
    transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1);
}

.provinha-bar-growth {
    background: linear-gradient(90deg, var(--primary), var(--secondary));
}

.provinha-bar-revenue {
    background: linear-gradient(90deg, var(--success), #34d399);
}

.provinha-indicators {
    display: flex;
    gap: 24px;
    width: 100%;
    max-width: 400px;
    justify-content: center;
}

.provinha-indicator {
    text-align: center;
    padding: 12px 20px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--card-border);
    border-radius: 10px;
    flex: 1;
}

.provinha-indicator-value {
    font-family: 'Outfit', sans-serif;
    font-size: 20px;
    font-weight: 700;
    color: var(--text-main);
}

.provinha-indicator-label {
    font-size: 11px;
    color: var(--text-dim);
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

@keyframes provinha-levelup {
    0% { filter: brightness(1); }
    50% { filter: brightness(1.5) drop-shadow(0 0 20px var(--primary)); }
    100% { filter: brightness(1); }
}

.provinha-avatar.level-up {
    animation: provinha-levelup 1s ease-in-out, provinha-idle 3s ease-in-out infinite;
}

@media (max-width: 768px) {
    .provinha-indicators {
        flex-direction: column;
        gap: 12px;
    }

    .provinha-avatar {
        width: 120px;
        height: 150px;
    }
}
```

- [ ] **Step 2: Verify styling in browser**

Open in browser. The Provinha card should appear with glassmorphism, centered layout, purple glow background, progress bars, and indicator boxes.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "feat: add Tamagotchi Provinha CSS styles"
```

---

### Task 3: Add Provinha Level Logic and SVG Illustrations

**Files:**
- Modify: `script.js` (add after line 16 — after PLAN_VALUES closing brace)

- [ ] **Step 1: Add level configuration constants and helper functions**

Insert after line 16 (`};` closing PLAN_VALUES) in `script.js`:

```javascript
// --- Tamagotchi Provinha ---
const GROWTH_LEVELS = [
    { min: 0, max: 3, name: 'Ovo', level: 1 },
    { min: 4, max: 10, name: 'Mini Cabide', level: 2 },
    { min: 11, max: 25, name: 'Cabide Medio', level: 3 },
    { min: 26, max: 50, name: 'Manequim', level: 4 },
    { min: 51, max: Infinity, name: 'Manequim Premium', level: 5 },
];

const REVENUE_LEVELS = [
    { min: 0, max: 200, name: 'Pelado', level: 1 },
    { min: 201, max: 1000, name: 'Camiseta', level: 2 },
    { min: 1001, max: 5000, name: 'Casual', level: 3 },
    { min: 5001, max: 15000, name: 'Elegante', level: 4 },
    { min: 15001, max: Infinity, name: 'Dourado', level: 5 },
];

function getLevel(value, levels) {
    for (const l of levels) {
        if (value >= l.min && value <= l.max) return l;
    }
    return levels[0];
}

function getBarPercent(value, levelObj) {
    if (levelObj.max === Infinity) return 100;
    const range = levelObj.max - levelObj.min + 1;
    const progress = value - levelObj.min;
    return Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
}

function getNextThreshold(levelObj) {
    if (levelObj.max === Infinity) return 'MAX';
    return levelObj.max + 1;
}

function getStageName(growthLevel, revenueLevel) {
    if (growthLevel.level === 1 && revenueLevel.level === 1) return 'Ovo Pelado';
    if (growthLevel.level === 1) return 'Ovo de ' + revenueLevel.name;
    if (revenueLevel.level === 1) return growthLevel.name + ' Pelado';
    return growthLevel.name + ' ' + revenueLevel.name;
}
```

- [ ] **Step 2: Add the SVG factory function**

Immediately after the code from step 1, add the `buildProvinhaSVG` function. This function takes two integer levels (1-5) and returns an SVG string composed of hardcoded, developer-controlled shapes — no user input is involved, making innerHTML assignment safe for this use case:

```javascript
function buildProvinhaSVG(growthLvl, revenueLvl) {
    const bodies = {
        1: '<ellipse cx="80" cy="110" rx="35" ry="45" fill="#2d1f4e" stroke="#7c3aed" stroke-width="2"/>'
         + '<ellipse cx="80" cy="110" rx="28" ry="38" fill="#3b2766" opacity="0.5"/>'
         + '<circle cx="70" cy="102" r="5" fill="white"/><circle cx="70" cy="102" r="3" fill="#1a1a2e"/>'
         + '<circle cx="90" cy="102" r="5" fill="white"/><circle cx="90" cy="102" r="3" fill="#1a1a2e"/>'
         + '<ellipse cx="80" cy="115" rx="4" ry="2" fill="#c084fc" opacity="0.6"/>',
        2: '<line x1="80" y1="40" x2="80" y2="55" stroke="#7c3aed" stroke-width="4" stroke-linecap="round"/>'
         + '<circle cx="80" cy="36" r="6" fill="none" stroke="#7c3aed" stroke-width="3"/>'
         + '<path d="M50 70 Q80 55 110 70" stroke="#7c3aed" stroke-width="5" fill="none" stroke-linecap="round"/>'
         + '<line x1="50" y1="70" x2="50" y2="80" stroke="#7c3aed" stroke-width="4" stroke-linecap="round"/>'
         + '<line x1="110" y1="70" x2="110" y2="80" stroke="#7c3aed" stroke-width="4" stroke-linecap="round"/>'
         + '<circle cx="70" cy="90" r="5" fill="white"/><circle cx="70" cy="90" r="3" fill="#1a1a2e"/>'
         + '<circle cx="90" cy="90" r="5" fill="white"/><circle cx="90" cy="90" r="3" fill="#1a1a2e"/>'
         + '<path d="M73 100 Q80 105 87 100" stroke="#c084fc" stroke-width="2" fill="none" stroke-linecap="round"/>',
        3: '<line x1="80" y1="30" x2="80" y2="50" stroke="#9333ea" stroke-width="4" stroke-linecap="round"/>'
         + '<circle cx="80" cy="26" r="7" fill="none" stroke="#9333ea" stroke-width="3"/>'
         + '<path d="M40 65 Q80 45 120 65" stroke="#9333ea" stroke-width="6" fill="none" stroke-linecap="round"/>'
         + '<line x1="40" y1="65" x2="40" y2="80" stroke="#9333ea" stroke-width="4" stroke-linecap="round"/>'
         + '<line x1="120" y1="65" x2="120" y2="80" stroke="#9333ea" stroke-width="4" stroke-linecap="round"/>'
         + '<line x1="40" y1="80" x2="35" y2="110" stroke="#9333ea" stroke-width="3" stroke-linecap="round"/>'
         + '<line x1="120" y1="80" x2="125" y2="110" stroke="#9333ea" stroke-width="3" stroke-linecap="round"/>'
         + '<circle cx="68" cy="88" r="6" fill="white"/><circle cx="68" cy="88" r="3.5" fill="#1a1a2e"/>'
         + '<circle cx="92" cy="88" r="6" fill="white"/><circle cx="92" cy="88" r="3.5" fill="#1a1a2e"/>'
         + '<path d="M72 102 Q80 108 88 102" stroke="#c084fc" stroke-width="2" fill="none" stroke-linecap="round"/>',
        4: '<ellipse cx="80" cy="45" rx="22" ry="26" fill="#2d1f4e" stroke="#9333ea" stroke-width="2"/>'
         + '<rect x="65" y="70" width="30" height="55" rx="8" fill="#2d1f4e" stroke="#9333ea" stroke-width="2"/>'
         + '<line x1="65" y1="85" x2="40" y2="100" stroke="#9333ea" stroke-width="4" stroke-linecap="round"/>'
         + '<line x1="95" y1="85" x2="120" y2="100" stroke="#9333ea" stroke-width="4" stroke-linecap="round"/>'
         + '<rect x="70" y="125" width="8" height="35" rx="4" fill="#2d1f4e" stroke="#9333ea" stroke-width="2"/>'
         + '<rect x="82" y="125" width="8" height="35" rx="4" fill="#2d1f4e" stroke="#9333ea" stroke-width="2"/>'
         + '<circle cx="72" cy="40" r="5" fill="white"/><circle cx="72" cy="40" r="3" fill="#1a1a2e"/>'
         + '<circle cx="88" cy="40" r="5" fill="white"/><circle cx="88" cy="40" r="3" fill="#1a1a2e"/>'
         + '<path d="M75 52 Q80 56 85 52" stroke="#c084fc" stroke-width="2" fill="none" stroke-linecap="round"/>',
        5: '<defs><linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">'
         + '<stop offset="0%" style="stop-color:#fbbf24"/><stop offset="100%" style="stop-color:#f59e0b"/>'
         + '</linearGradient></defs>'
         + '<ellipse cx="80" cy="42" rx="24" ry="28" fill="#3b2766" stroke="url(#gold-grad)" stroke-width="3"/>'
         + '<rect x="62" y="68" width="36" height="58" rx="10" fill="#3b2766" stroke="url(#gold-grad)" stroke-width="3"/>'
         + '<line x1="62" y1="85" x2="35" y2="98" stroke="url(#gold-grad)" stroke-width="5" stroke-linecap="round"/>'
         + '<line x1="98" y1="85" x2="125" y2="98" stroke="url(#gold-grad)" stroke-width="5" stroke-linecap="round"/>'
         + '<rect x="68" y="126" width="10" height="38" rx="5" fill="#3b2766" stroke="url(#gold-grad)" stroke-width="3"/>'
         + '<rect x="82" y="126" width="10" height="38" rx="5" fill="#3b2766" stroke="url(#gold-grad)" stroke-width="3"/>'
         + '<circle cx="72" cy="37" r="5.5" fill="white"/><circle cx="72" cy="37" r="3.5" fill="#1a1a2e"/>'
         + '<circle cx="88" cy="37" r="5.5" fill="white"/><circle cx="88" cy="37" r="3.5" fill="#1a1a2e"/>'
         + '<path d="M74 50 Q80 55 86 50" stroke="#fbbf24" stroke-width="2" fill="none" stroke-linecap="round"/>'
         + '<circle cx="80" cy="20" r="3" fill="#fbbf24" opacity="0.8"/>'
         + '<circle cx="68" cy="24" r="2" fill="#fbbf24" opacity="0.5"/>'
         + '<circle cx="92" cy="24" r="2" fill="#fbbf24" opacity="0.5"/>'
    };

    const clothes = {
        1: '<ellipse cx="72" cy="48" rx="6" ry="3" fill="#ef4444" opacity="0.3"/>'
         + '<ellipse cx="88" cy="48" rx="6" ry="3" fill="#ef4444" opacity="0.3"/>',
        2: '<rect x="63" y="70" width="34" height="30" rx="4" fill="#7c3aed" opacity="0.7"/>'
         + '<line x1="80" y1="70" x2="80" y2="100" stroke="#9333ea" stroke-width="1" opacity="0.5"/>',
        3: '<rect x="63" y="70" width="34" height="25" rx="4" fill="#3b82f6" opacity="0.7"/>'
         + '<path d="M73 70 L80 65 L87 70" fill="#3b82f6" stroke="#60a5fa" stroke-width="1"/>'
         + '<rect x="66" y="95" width="12" height="30" rx="3" fill="#1e3a5f" opacity="0.8"/>'
         + '<rect x="82" y="95" width="12" height="30" rx="3" fill="#1e3a5f" opacity="0.8"/>',
        4: '<rect x="61" y="70" width="38" height="28" rx="4" fill="#1e293b" opacity="0.9"/>'
         + '<path d="M70 70 L80 62 L90 70" fill="#334155" stroke="#64748b" stroke-width="1"/>'
         + '<rect x="78" y="72" width="4" height="24" rx="2" fill="#7c3aed" opacity="0.8"/>'
         + '<rect x="64" y="98" width="14" height="28" rx="3" fill="#0f172a" opacity="0.9"/>'
         + '<rect x="82" y="98" width="14" height="28" rx="3" fill="#0f172a" opacity="0.9"/>'
         + '<circle cx="80" cy="73" r="2.5" fill="#c084fc"/>',
        5: '<rect x="59" y="68" width="42" height="30" rx="5" fill="#1a1a2e" opacity="0.95" stroke="#fbbf24" stroke-width="1"/>'
         + '<path d="M68 68 L80 58 L92 68" fill="#1a1a2e" stroke="#fbbf24" stroke-width="1"/>'
         + '<rect x="78" y="70" width="4" height="26" rx="2" fill="#fbbf24" opacity="0.8"/>'
         + '<rect x="62" y="98" width="15" height="30" rx="4" fill="#0f0f13" opacity="0.95" stroke="#fbbf24" stroke-width="0.5"/>'
         + '<rect x="83" y="98" width="15" height="30" rx="4" fill="#0f0f13" opacity="0.95" stroke="#fbbf24" stroke-width="0.5"/>'
         + '<circle cx="80" cy="71" r="3" fill="#fbbf24"/>'
         + '<rect x="35" y="95" width="10" height="3" rx="1.5" fill="#fbbf24" opacity="0.6"/>'
         + '<rect x="115" y="95" width="10" height="3" rx="1.5" fill="#fbbf24" opacity="0.6"/>'
    };

    var bodyKey = Math.min(growthLvl, 5);
    var clothesKey = Math.min(revenueLvl, 5);
    // Only show clothes on bodies level 2+ (ovo has no body to dress)
    var clothesSvg = bodyKey >= 2 ? clothes[clothesKey] : clothes[1];

    return '<svg viewBox="0 0 160 180" width="160" height="200" xmlns="http://www.w3.org/2000/svg">'
        + bodies[bodyKey]
        + clothesSvg
        + '</svg>';
}
```

- [ ] **Step 3: Verify no syntax errors**

Open in browser, check console. Page should load normally — these are definitions only, not yet called.

- [ ] **Step 4: Commit**

```bash
git add script.js
git commit -m "feat: add Provinha level configs and SVG factory"
```

---

### Task 4: Wire Up Provinha Rendering to Dashboard Data

**Files:**
- Modify: `script.js` (add `updateProvinha()` function before `updateStats()`, call it from `updateStats()`)

- [ ] **Step 1: Add the updateProvinha function and state variables**

Insert right before the `function updateStats()` definition (before line 490 in the original file, which will be shifted down after Task 3 insertions). Add:

```javascript
var lastGrowthLevel = 0;
var lastRevenueLevel = 0;

function updateProvinha() {
    var active = clients.filter(function(c) { return c.status === 'Ativo'; });
    var activeCount = active.length;
    var mrr = active.reduce(function(sum, c) { return sum + (PLAN_VALUES[c.plan] || 0); }, 0);

    var growthLevel = getLevel(activeCount, GROWTH_LEVELS);
    var revenueLevel = getLevel(mrr, REVENUE_LEVELS);

    // Update SVG — buildProvinhaSVG returns hardcoded SVG strings only (no user input)
    var avatarEl = document.getElementById('provinha-avatar');
    if (avatarEl) {
        avatarEl.innerHTML = buildProvinhaSVG(growthLevel.level, revenueLevel.level);

        // Level-up animation
        if ((growthLevel.level > lastGrowthLevel || revenueLevel.level > lastRevenueLevel) && lastGrowthLevel > 0) {
            avatarEl.classList.add('level-up');
            setTimeout(function() { avatarEl.classList.remove('level-up'); }, 1000);
        }
        lastGrowthLevel = growthLevel.level;
        lastRevenueLevel = revenueLevel.level;
    }

    // Stage name
    setText('provinha-stage-name', getStageName(growthLevel, revenueLevel));

    // Growth bar
    var growthPercent = getBarPercent(activeCount, growthLevel);
    var growthNext = getNextThreshold(growthLevel);
    var growthBar = document.getElementById('provinha-growth-bar');
    if (growthBar) growthBar.style.width = growthPercent + '%';
    setText('provinha-growth-text', activeCount + '/' + growthNext + ' lojistas (Nv.' + growthLevel.level + ')');

    // Revenue bar
    var revenuePercent = getBarPercent(mrr, revenueLevel);
    var revenueNext = getNextThreshold(revenueLevel);
    var revenueBar = document.getElementById('provinha-revenue-bar');
    if (revenueBar) revenueBar.style.width = revenuePercent + '%';
    var nextFormatted = revenueNext === 'MAX' ? 'MAX' : 'R$' + revenueNext.toLocaleString('pt-BR');
    setText('provinha-revenue-text', 'R$' + mrr.toLocaleString('pt-BR') + '/' + nextFormatted + ' (Nv.' + revenueLevel.level + ')');

    // Indicators
    setText('provinha-ind-stores', activeCount);
    setText('provinha-ind-mrr', 'R$ ' + mrr.toLocaleString('pt-BR'));
    setText('provinha-ind-affiliates', '-');
}
```

- [ ] **Step 2: Call updateProvinha() from updateStats()**

At the end of the `updateStats()` function body, right before its closing `}`, add:

```javascript
    updateProvinha();
```

- [ ] **Step 3: Test in browser**

Open the dashboard. After login:
- Provinha section renders between KPIs and Package cards
- SVG avatar displays based on active clients count and MRR
- Progress bars fill proportionally within current level
- Stage name displays (e.g. "Mini Cabide Camiseta")
- Indicators show active count and MRR values

- [ ] **Step 4: Commit**

```bash
git add script.js
git commit -m "feat: wire Provinha rendering to dashboard data"
```

---

### Task 5: Visual Verification of All Level Combinations

- [ ] **Step 1: Test all body+clothes combos in browser console**

After logging in, open browser console and run:

```javascript
// Ovo Pelado (1+1)
document.getElementById('provinha-avatar').innerHTML = buildProvinhaSVG(1, 1);
// Mini Cabide Camiseta (2+2) - current state
document.getElementById('provinha-avatar').innerHTML = buildProvinhaSVG(2, 2);
// Cabide Casual (3+3)
document.getElementById('provinha-avatar').innerHTML = buildProvinhaSVG(3, 3);
// Manequim Elegante (4+4)
document.getElementById('provinha-avatar').innerHTML = buildProvinhaSVG(4, 4);
// Manequim Premium Dourado (5+5)
document.getElementById('provinha-avatar').innerHTML = buildProvinhaSVG(5, 5);
// Mixed: Manequim Pelado (4+1)
document.getElementById('provinha-avatar').innerHTML = buildProvinhaSVG(4, 1);
// Mixed: Mini Cabide Dourado (2+5)
document.getElementById('provinha-avatar').innerHTML = buildProvinhaSVG(2, 5);
```

Verify each renders without SVG errors and clothes overlay body correctly.

- [ ] **Step 2: Test responsive layout**

Resize to < 768px. Verify indicators stack vertically and avatar scales.

- [ ] **Step 3: Fix any SVG alignment issues found**

If clothes don't align properly with certain bodies, adjust the SVG coordinates in the `clothes` object of `buildProvinhaSVG`.

- [ ] **Step 4: Final commit**

```bash
git add index.html script.js style.css
git commit -m "feat: complete Tamagotchi Provinha implementation"
```
