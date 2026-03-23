/* ============================================================
   KEDAH HEAT DISEASE DASHBOARD — APPLICATION LOGIC
   Live CSV data from Google Sheets, Chart.js visualizations,
   3 KKM borang formats, auto-refresh
   ============================================================ */

(() => {
    'use strict';

    // ── Config ──────────────────────────────────────────────
    const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ3_hIsLiJsYCKrqcNgfVyk1eEyLbSepimBIHw6mIyKrLuemccUsGNVFA_HxdSpJ_rWBvU1P1vfBDI1/pub?gid=457876414&single=true&output=csv';
    const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

    // ── Diagnosis Classification ────────────────────────────
    const DIAGNOSIS_MAP = {
        'kejang': 'Kejang Haba',
        'cramps': 'Kejang Haba',
        'kelesuan': 'Kelesuan Haba',
        'exhaustion': 'Kelesuan Haba',
        'strok': 'Strok Haba',
        'stroke': 'Strok Haba',
        'patukan': 'Patukan Ular',
        'snake': 'Patukan Ular'
    };

    const DIAGNOSIS_COLORS = {
        'Kejang Haba': { bg: 'rgba(251, 191, 36, 0.7)', border: '#fbbf24' },
        'Kelesuan Haba': { bg: 'rgba(251, 146, 60, 0.7)', border: '#fb923c' },
        'Strok Haba': { bg: 'rgba(248, 113, 113, 0.7)', border: '#f87171' },
        'Patukan Ular': { bg: 'rgba(167, 139, 250, 0.7)', border: '#a78bfa' }
    };

    const COMORBID_KEYWORDS = ['DM', 'HPT', 'IHD', 'ESRF'];

    // ── State ───────────────────────────────────────────────
    let allRecords = [];
    let filteredRecords = [];
    let charts = {};

    // ── Column Mapping ──────────────────────────────────────
    // CSV columns from Google Form
    const COL = {
        TIMESTAMP: 0,
        EMAIL: 1,
        HOSPITAL: 2,
        DIAGNOSIS: 3,
        SNAKE_SPECIES: 4,
        NOTIFICATION_DATE: 5,
        EVENT_DATE: 6,
        PATIENT_NAME: 7,
        IC: 8,
        ADDRESS: 9,
        GENDER: 10,
        RACE: 11,
        RACE_OTHER: 12,
        AGE: 13,
        OCCUPATION: 14,
        ACTIVITY: 15,
        LOCATION: 16,
        COMORBID: 17,
        TREATMENT: 18,
        OUTCOME: 19,
        COMMENTS: 20
    };

    // ── Utility Functions ───────────────────────────────────
    function classifyDiagnosis(raw) {
        if (!raw) return 'Lain-lain';
        const lower = raw.toLowerCase();
        for (const [key, label] of Object.entries(DIAGNOSIS_MAP)) {
            if (lower.includes(key)) return label;
        }
        return 'Lain-lain';
    }

    function classifyAgeGroup(age) {
        const a = parseInt(age);
        if (isNaN(a)) return '13-64';
        if (a < 5) return '<5';
        if (a <= 12) return '5-12';
        if (a <= 64) return '13-64';
        return '≥65';
    }

    function parseDate(dateStr) {
        if (!dateStr) return null;
        // Handle DD/MM/YYYY format
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const [d, m, y] = parts;
            return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        }
        // Fallback try native
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
    }

    function formatDate(date) {
        if (!date) return '-';
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    }

    function parseComorbid(raw) {
        if (!raw) return [];
        const upper = raw.toUpperCase();
        if (upper === 'TIADA' || upper === '-' || upper.trim() === '') return [];
        const found = [];
        COMORBID_KEYWORDS.forEach(k => {
            if (upper.includes(k)) found.push(k);
        });
        return found;
    }

    function sanitize(val) {
        if (val === undefined || val === null) return '';
        return String(val).trim();
    }

    // ── Data Loading ────────────────────────────────────────
    async function loadData() {
        try {
            const response = await fetch(CSV_URL);
            const csvText = await response.text();

            return new Promise((resolve, reject) => {
                Papa.parse(csvText, {
                    complete: (results) => {
                        const rows = results.data;
                        if (rows.length <= 1) {
                            resolve([]);
                            return;
                        }

                        const records = [];
                        // Skip header row
                        for (let i = 1; i < rows.length; i++) {
                            const row = rows[i];
                            if (!row || row.length < 10 || !row[COL.DIAGNOSIS]) continue;

                            const diagnosis = classifyDiagnosis(row[COL.DIAGNOSIS]);
                            const age = parseInt(row[COL.AGE]) || 0;
                            const gender = sanitize(row[COL.GENDER]);
                            const comorbids = parseComorbid(row[COL.COMORBID]);
                            const treatment = sanitize(row[COL.TREATMENT]);
                            const eventDate = parseDate(sanitize(row[COL.EVENT_DATE]));
                            const notifDate = parseDate(sanitize(row[COL.NOTIFICATION_DATE]));

                            records.push({
                                timestamp: sanitize(row[COL.TIMESTAMP]),
                                hospital: sanitize(row[COL.HOSPITAL]),
                                diagnosisRaw: sanitize(row[COL.DIAGNOSIS]),
                                diagnosis,
                                snakeSpecies: sanitize(row[COL.SNAKE_SPECIES]),
                                notificationDate: notifDate,
                                eventDate: eventDate,
                                patientName: sanitize(row[COL.PATIENT_NAME]),
                                ic: sanitize(row[COL.IC]),
                                address: sanitize(row[COL.ADDRESS]),
                                gender,
                                race: sanitize(row[COL.RACE]),
                                raceOther: sanitize(row[COL.RACE_OTHER]),
                                age,
                                ageGroup: classifyAgeGroup(row[COL.AGE]),
                                occupation: sanitize(row[COL.OCCUPATION]),
                                activity: sanitize(row[COL.ACTIVITY]),
                                location: sanitize(row[COL.LOCATION]),
                                comorbidRaw: sanitize(row[COL.COMORBID]),
                                comorbids,
                                treatment,
                                outcome: sanitize(row[COL.OUTCOME]),
                                comments: sanitize(row[COL.COMMENTS])
                            });
                        }

                        resolve(records);
                    },
                    error: (err) => reject(err)
                });
            });
        } catch (err) {
            console.error('Error loading CSV:', err);
            return [];
        }
    }

    // ── Filter Logic (Cross-Filter) ────────────────────────
    function applyFilters() {
        const startDate = document.getElementById('filter-date-start').value;
        const endDate = document.getElementById('filter-date-end').value;
        const district = document.getElementById('filter-district').value;
        const diagnosis = document.getElementById('filter-diagnosis').value;

        filteredRecords = allRecords.filter(r => {
            // Date filter
            if (startDate) {
                const start = new Date(startDate);
                const evDate = r.eventDate || r.notificationDate;
                if (evDate && evDate < start) return false;
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                const evDate = r.eventDate || r.notificationDate;
                if (evDate && evDate > end) return false;
            }
            // District filter
            if (district && district !== 'all') {
                if (r.hospital !== district) return false;
            }
            // Diagnosis filter
            if (diagnosis && diagnosis !== 'all') {
                if (r.diagnosis !== diagnosis) return false;
            }
            return true;
        });

        renderAll();
    }

    function populateDistrictFilter() {
        const select = document.getElementById('filter-district');
        const districts = [...new Set(allRecords.map(r => r.hospital).filter(Boolean))].sort();
        // Keep the "all" option
        select.innerHTML = '<option value="all">Semua Daerah</option>';
        districts.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = d;
            select.appendChild(opt);
        });
    }

    // ── KPI Cards ───────────────────────────────────────────
    function updateKPIs() {
        const counts = {
            total: filteredRecords.length,
            cramps: filteredRecords.filter(r => r.diagnosis === 'Kejang Haba').length,
            exhaustion: filteredRecords.filter(r => r.diagnosis === 'Kelesuan Haba').length,
            stroke: filteredRecords.filter(r => r.diagnosis === 'Strok Haba').length,
            snake: filteredRecords.filter(r => r.diagnosis === 'Patukan Ular').length
        };

        animateCounter('kpi-total', counts.total);
        animateCounter('kpi-cramps', counts.cramps);
        animateCounter('kpi-exhaustion', counts.exhaustion);
        animateCounter('kpi-stroke', counts.stroke);
        animateCounter('kpi-snake', counts.snake);
    }

    function animateCounter(cardId, target) {
        const el = document.querySelector(`#${cardId} .kpi-value`);
        if (!el) return;

        const start = parseInt(el.textContent) || 0;
        const duration = 800;
        const startTime = performance.now();

        function tick(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
            el.textContent = Math.round(start + (target - start) * eased);
            if (progress < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    }

    // ── Charts ──────────────────────────────────────────────
    function renderCharts() {
        renderTrendChart();
        renderDiagnosisChart();
        renderDistrictChart();
        renderAgeChart();
        renderGenderTreatmentChart();
    }

    function destroyChart(name) {
        if (charts[name]) {
            charts[name].destroy();
            charts[name] = null;
        }
    }

    function renderTrendChart() {
        destroyChart('trend');
        const ctx = document.getElementById('chart-trend');
        if (!ctx) return;

        // Group by week
        const dateMap = {};
        filteredRecords.forEach(r => {
            const d = r.eventDate || r.notificationDate;
            if (!d) return;
            // Use week key
            const weekStart = new Date(d);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            const key = formatDate(weekStart);
            if (!dateMap[key]) dateMap[key] = { 'Kejang Haba': 0, 'Kelesuan Haba': 0, 'Strok Haba': 0, 'Patukan Ular': 0 };
            if (dateMap[key][r.diagnosis] !== undefined) dateMap[key][r.diagnosis]++;
        });

        // Sort by date
        const sortedKeys = Object.keys(dateMap).sort((a, b) => {
            const da = parseDate(a);
            const db = parseDate(b);
            return (da || 0) - (db || 0);
        });

        const diagnoses = ['Kejang Haba', 'Kelesuan Haba', 'Strok Haba', 'Patukan Ular'];
        const datasets = diagnoses.map(diag => ({
            label: diag,
            data: sortedKeys.map(k => dateMap[k][diag] || 0),
            borderColor: DIAGNOSIS_COLORS[diag].border,
            backgroundColor: DIAGNOSIS_COLORS[diag].bg,
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2
        }));

        charts.trend = new Chart(ctx, {
            type: 'line',
            data: { labels: sortedKeys, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, usePointStyle: true, pointStyle: 'circle' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        cornerRadius: 8,
                        titleFont: { family: 'Inter', weight: '600' },
                        bodyFont: { family: 'Inter' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#64748b', font: { family: 'Inter', size: 10 }, maxRotation: 45 },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#64748b', font: { family: 'Inter', size: 10 }, stepSize: 1 },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    }
                }
            }
        });
    }

    function renderDiagnosisChart() {
        destroyChart('diagnosis');
        const ctx = document.getElementById('chart-diagnosis');
        if (!ctx) return;

        const diagnoses = ['Kejang Haba', 'Kelesuan Haba', 'Strok Haba', 'Patukan Ular'];
        const counts = diagnoses.map(d => filteredRecords.filter(r => r.diagnosis === d).length);

        charts.diagnosis = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: diagnoses,
                datasets: [{
                    data: counts,
                    backgroundColor: diagnoses.map(d => DIAGNOSIS_COLORS[d].bg),
                    borderColor: diagnoses.map(d => DIAGNOSIS_COLORS[d].border),
                    borderWidth: 2,
                    hoverOffset: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, usePointStyle: true, pointStyle: 'circle', padding: 16 }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        cornerRadius: 8
                    }
                }
            }
        });
    }

    function renderDistrictChart() {
        destroyChart('district');
        const ctx = document.getElementById('chart-district');
        if (!ctx) return;

        const districtCounts = {};
        filteredRecords.forEach(r => {
            if (r.hospital) {
                districtCounts[r.hospital] = (districtCounts[r.hospital] || 0) + 1;
            }
        });

        const labels = Object.keys(districtCounts).sort((a, b) => districtCounts[b] - districtCounts[a]);
        const data = labels.map(l => districtCounts[l]);

        charts.district = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Jumlah Kes',
                    data,
                    backgroundColor: 'rgba(56, 189, 248, 0.6)',
                    borderColor: '#38bdf8',
                    borderWidth: 1,
                    borderRadius: 6,
                    barPercentage: 0.7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        cornerRadius: 8
                    }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { color: '#64748b', font: { family: 'Inter', size: 10 }, stepSize: 1 },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    },
                    y: {
                        ticks: { color: '#94a3b8', font: { family: 'Inter', size: 11 } },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    function renderAgeChart() {
        destroyChart('age');
        const ctx = document.getElementById('chart-age');
        if (!ctx) return;

        const ageGroups = ['<5', '5-12', '13-64', '≥65'];
        const heatRecords = filteredRecords.filter(r => r.diagnosis !== 'Patukan Ular');
        const snakeRecords = filteredRecords.filter(r => r.diagnosis === 'Patukan Ular');

        charts.age = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ageGroups,
                datasets: [
                    {
                        label: 'Penyakit Haba',
                        data: ageGroups.map(g => heatRecords.filter(r => r.ageGroup === g).length),
                        backgroundColor: 'rgba(251, 146, 60, 0.6)',
                        borderColor: '#fb923c',
                        borderWidth: 1,
                        borderRadius: 6
                    },
                    {
                        label: 'Patukan Ular',
                        data: ageGroups.map(g => snakeRecords.filter(r => r.ageGroup === g).length),
                        backgroundColor: 'rgba(167, 139, 250, 0.6)',
                        borderColor: '#a78bfa',
                        borderWidth: 1,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, usePointStyle: true, pointStyle: 'circle' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        cornerRadius: 8
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94a3b8', font: { family: 'Inter', size: 11 } },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#64748b', font: { family: 'Inter', size: 10 }, stepSize: 1 },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    }
                }
            }
        });
    }

    function renderGenderTreatmentChart() {
        destroyChart('genderTreatment');
        const ctx = document.getElementById('chart-gender-treatment');
        if (!ctx) return;

        const categories = ['Lelaki', 'Perempuan'];
        const wadCounts = categories.map(g => filteredRecords.filter(r => r.gender === g && r.treatment.includes('Wad')).length);
        const luarCounts = categories.map(g => filteredRecords.filter(r => r.gender === g && r.treatment.includes('Luar')).length);

        charts.genderTreatment = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: categories,
                datasets: [
                    {
                        label: 'Dalam Wad',
                        data: wadCounts,
                        backgroundColor: 'rgba(56, 189, 248, 0.6)',
                        borderColor: '#38bdf8',
                        borderWidth: 1,
                        borderRadius: 6
                    },
                    {
                        label: 'Pesakit Luar',
                        data: luarCounts,
                        backgroundColor: 'rgba(45, 212, 191, 0.6)',
                        borderColor: '#2dd4bf',
                        borderWidth: 1,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, usePointStyle: true, pointStyle: 'circle' }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#94a3b8',
                        cornerRadius: 8
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#94a3b8', font: { family: 'Inter', size: 11 } },
                        grid: { display: false }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#64748b', font: { family: 'Inter', size: 10 }, stepSize: 1 },
                        grid: { color: 'rgba(255,255,255,0.04)' }
                    }
                }
            }
        });
    }

    // ── Table: Reten Pemantauan CP-PBH ──────────────────────
    function renderCPBH() {
        const tbody = document.getElementById('tbody-cpbh');
        if (!tbody) return;

        const heatDiagnoses = ['Kejang Haba', 'Kelesuan Haba', 'Strok Haba'];
        const ageGroups = ['<5', '5-12', '13-64', '≥65'];
        const totals = { l: 0, p: 0, ag: {}, pluar: 0, wad: 0, dm: 0, hpt: 0, ihd: 0, esrf: 0, total: 0 };
        ageGroups.forEach(g => totals.ag[g] = 0);

        let html = '';
        heatDiagnoses.forEach(diag => {
            const recs = filteredRecords.filter(r => r.diagnosis === diag);
            const l = recs.filter(r => r.gender === 'Lelaki').length;
            const p = recs.filter(r => r.gender === 'Perempuan').length;
            const agCounts = {};
            ageGroups.forEach(g => {
                agCounts[g] = recs.filter(r => r.ageGroup === g).length;
                totals.ag[g] += agCounts[g];
            });
            const pluar = recs.filter(r => r.treatment.includes('Luar')).length;
            const wad = recs.filter(r => r.treatment.includes('Wad')).length;
            const dm = recs.filter(r => r.comorbids.includes('DM')).length;
            const hpt = recs.filter(r => r.comorbids.includes('HPT')).length;
            const ihd = recs.filter(r => r.comorbids.includes('IHD')).length;
            const esrf = recs.filter(r => r.comorbids.includes('ESRF')).length;

            totals.l += l; totals.p += p;
            totals.pluar += pluar; totals.wad += wad;
            totals.dm += dm; totals.hpt += hpt; totals.ihd += ihd; totals.esrf += esrf;
            totals.total += recs.length;

            const badgeClass = diag === 'Kejang Haba' ? 'badge-cramps' : diag === 'Kelesuan Haba' ? 'badge-exhaustion' : 'badge-stroke';

            html += `<tr>
                <td><span class="badge ${badgeClass}">${diag}</span></td>
                <td>${l}</td><td>${p}</td>
                ${ageGroups.map(g => `<td>${agCounts[g]}</td>`).join('')}
                <td>${pluar}</td><td>${wad}</td>
                <td>${dm}</td><td>${hpt}</td><td>${ihd}</td><td>${esrf}</td>
                <td><strong>${recs.length}</strong></td>
            </tr>`;
        });

        // Total row
        html += `<tr class="row-total">
            <td><strong>JUMLAH</strong></td>
            <td>${totals.l}</td><td>${totals.p}</td>
            ${ageGroups.map(g => `<td>${totals.ag[g]}</td>`).join('')}
            <td>${totals.pluar}</td><td>${totals.wad}</td>
            <td>${totals.dm}</td><td>${totals.hpt}</td><td>${totals.ihd}</td><td>${totals.esrf}</td>
            <td><strong>${totals.total}</strong></td>
        </tr>`;

        tbody.innerHTML = html;
    }

    // ── Scorecard: Per Daerah CP-LL ──────────────────────────
    function renderCPLL() {
        const container = document.getElementById('scorecard-container');
        if (!container) return;

        // Group records by hospital/district
        const districtMap = {};
        filteredRecords.forEach(r => {
            const key = r.hospital || 'Tidak Diketahui';
            if (!districtMap[key]) districtMap[key] = [];
            districtMap[key].push(r);
        });

        // Sort districts by case count descending
        const sortedDistricts = Object.keys(districtMap).sort((a, b) => districtMap[b].length - districtMap[a].length);

        if (sortedDistricts.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-muted);">Tiada rekod dijumpai</div>';
            return;
        }

        let html = '';
        sortedDistricts.forEach((district, dIdx) => {
            const recs = districtMap[district];
            const cramps = recs.filter(r => r.diagnosis === 'Kejang Haba').length;
            const exhaustion = recs.filter(r => r.diagnosis === 'Kelesuan Haba').length;
            const stroke = recs.filter(r => r.diagnosis === 'Strok Haba').length;
            const snake = recs.filter(r => r.diagnosis === 'Patukan Ular').length;
            const wad = recs.filter(r => r.treatment.includes('Wad')).length;
            const luar = recs.filter(r => r.treatment.includes('Luar')).length;
            const sembuh = recs.filter(r => r.outcome.includes('Sembuh')).length;
            const komplikasi = recs.filter(r => r.outcome.includes('Komplikasi')).length;

            // Build mini KPIs
            const kpis = [
                { val: cramps, label: 'Kejang Haba', cls: 'mini-cramps' },
                { val: exhaustion, label: 'Kelesuan Haba', cls: 'mini-exhaustion' },
                { val: stroke, label: 'Strok Haba', cls: 'mini-stroke' },
                { val: snake, label: 'Patukan Ular', cls: 'mini-snake' },
                { val: wad, label: 'Dalam Wad', cls: 'mini-wad' },
                { val: luar, label: 'Pesakit Luar', cls: 'mini-luar' },
                { val: sembuh, label: 'Sembuh', cls: 'mini-sembuh' },
                { val: komplikasi, label: 'Komplikasi', cls: 'mini-komplikasi' },
            ];

            const kpiHtml = kpis.map(k => `
                <div class="scorecard-mini-kpi ${k.cls}">
                    <div class="mini-kpi-value">${k.val}</div>
                    <div class="mini-kpi-label">${k.label}</div>
                </div>
            `).join('');

            // Build case detail rows (NO name, NO IC)
            let rowsHtml = '';
            recs.forEach((r, i) => {
                const diagClass = r.diagnosis === 'Kejang Haba' ? 'badge-cramps' :
                    r.diagnosis === 'Kelesuan Haba' ? 'badge-exhaustion' :
                    r.diagnosis === 'Strok Haba' ? 'badge-stroke' : 'badge-snake';

                const outcomeClass = r.outcome.includes('Sembuh') ? 'badge-sembuh' :
                    r.outcome.includes('Komplikasi') ? 'badge-komplikasi' :
                    r.outcome.includes('Mati') || r.outcome.includes('mati') ? 'badge-mati' : '';

                const treatmentClass = r.treatment.includes('Wad') ? 'badge-wad' : 'badge-luar';

                rowsHtml += `<tr>
                    <td>${i + 1}</td>
                    <td>${formatDate(r.notificationDate)}</td>
                    <td>${formatDate(r.eventDate)}</td>
                    <td>${r.gender === 'Lelaki' ? 'L' : 'P'}</td>
                    <td>${r.race}</td>
                    <td>${r.age}</td>
                    <td title="${r.occupation}">${r.occupation}</td>
                    <td title="${r.activity}">${r.activity}</td>
                    <td title="${r.location}">${r.location}</td>
                    <td><span class="badge ${diagClass}">${r.diagnosis}</span></td>
                    <td>${r.comorbidRaw || '-'}</td>
                    <td><span class="badge ${treatmentClass}">${r.treatment}</span></td>
                    <td><span class="badge ${outcomeClass}">${r.outcome}</span></td>
                </tr>`;
            });

            html += `
            <div class="district-scorecard${dIdx === 0 ? ' expanded' : ''}" style="animation-delay:${dIdx * 0.08}s">
                <div class="scorecard-header" onclick="this.parentElement.classList.toggle('expanded')">
                    <div class="scorecard-district-name">
                        <i class="fas fa-hospital-alt"></i>
                        <h4>${district}</h4>
                    </div>
                    <div style="display:flex;align-items:center;">
                        <div class="scorecard-total-badge">
                            <i class="fas fa-clipboard-list"></i>
                            <span>${recs.length}</span> kes
                        </div>
                        <i class="fas fa-chevron-down scorecard-toggle-icon"></i>
                    </div>
                </div>
                <div class="scorecard-kpi-row">
                    ${kpiHtml}
                </div>
                <div class="scorecard-details">
                    <div class="table-responsive">
                        <table class="scorecard-table">
                            <thead>
                                <tr>
                                    <th>Bil</th>
                                    <th>Tarikh Notifikasi</th>
                                    <th>Tarikh Kejadian</th>
                                    <th>Jantina</th>
                                    <th>Bangsa</th>
                                    <th>Umur</th>
                                    <th>Pekerjaan</th>
                                    <th>Aktiviti</th>
                                    <th>Tempat</th>
                                    <th>Diagnosis</th>
                                    <th>Komorbiditi</th>
                                    <th>Rawatan</th>
                                    <th>Hasil</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;
        });

        container.innerHTML = html;
    }

    // ── Table: Reten Patukan Ular CP-PU ─────────────────────
    function renderCPPU() {
        const tbody = document.getElementById('tbody-cppu');
        if (!tbody) return;

        const snakeRecords = filteredRecords.filter(r => r.diagnosis === 'Patukan Ular');
        const ageGroups = ['<5', '5-12', '13-64', '≥65'];

        // Group by date
        const dateMap = {};
        snakeRecords.forEach(r => {
            const d = r.eventDate || r.notificationDate;
            const key = d ? formatDate(d) : 'Tidak Diketahui';
            if (!dateMap[key]) {
                dateMap[key] = { date: d, records: [] };
            }
            dateMap[key].records.push(r);
        });

        // Sort by date
        const sortedKeys = Object.keys(dateMap).sort((a, b) => {
            const da = dateMap[a].date;
            const db = dateMap[b].date;
            if (!da && !db) return 0;
            if (!da) return 1;
            if (!db) return -1;
            return da - db;
        });

        const totals = { l: 0, p: 0, ag: {}, pluar: 0, wad: 0, total: 0 };
        ageGroups.forEach(g => totals.ag[g] = 0);

        let html = '';
        sortedKeys.forEach(key => {
            const recs = dateMap[key].records;
            const l = recs.filter(r => r.gender === 'Lelaki').length;
            const p = recs.filter(r => r.gender === 'Perempuan').length;
            const agCounts = {};
            ageGroups.forEach(g => {
                agCounts[g] = recs.filter(r => r.ageGroup === g).length;
                totals.ag[g] += agCounts[g];
            });
            const pluar = recs.filter(r => r.treatment.includes('Luar')).length;
            const wad = recs.filter(r => r.treatment.includes('Wad')).length;

            totals.l += l; totals.p += p;
            totals.pluar += pluar; totals.wad += wad;
            totals.total += recs.length;

            html += `<tr>
                <td>${key}</td>
                <td>${l}</td><td>${p}</td>
                ${ageGroups.map(g => `<td>${agCounts[g]}</td>`).join('')}
                <td>${pluar}</td><td>${wad}</td>
                <td><strong>${recs.length}</strong></td>
            </tr>`;
        });

        // Total row
        html += `<tr class="row-total">
            <td><strong>JUMLAH</strong></td>
            <td>${totals.l}</td><td>${totals.p}</td>
            ${ageGroups.map(g => `<td>${totals.ag[g]}</td>`).join('')}
            <td>${totals.pluar}</td><td>${totals.wad}</td>
            <td><strong>${totals.total}</strong></td>
        </tr>`;

        if (snakeRecords.length === 0) {
            html = `<tr><td colspan="10" style="text-align:center;padding:2rem;color:var(--text-muted);">Tiada rekod patukan ular dijumpai</td></tr>`;
        }

        tbody.innerHTML = html;
    }

    // ── Render All ──────────────────────────────────────────
    function renderAll() {
        updateKPIs();
        renderCharts();
        renderCPBH();
        renderCPLL();
        renderCPPU();
    }

    // ── Live Clock ──────────────────────────────────────────
    function startClock() {
        const clockEl = document.getElementById('live-clock');
        function tick() {
            const now = new Date();
            clockEl.textContent = now.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        tick();
        setInterval(tick, 1000);
    }

    // ── Tabs ────────────────────────────────────────────────
    function initTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.tab).classList.add('active');
            });
        });
    }



    // ── Cross-Filter: Auto-apply on any change ──────────────
    function initFilters() {
        // Auto-apply filters on any input change (cross-filter)
        const filterIds = ['filter-date-start', 'filter-date-end', 'filter-district', 'filter-diagnosis'];
        filterIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', applyFilters);
        });

        // Reset button
        document.getElementById('btn-reset-filter').addEventListener('click', () => {
            document.getElementById('filter-date-start').value = '';
            document.getElementById('filter-date-end').value = '';
            document.getElementById('filter-district').value = 'all';
            document.getElementById('filter-diagnosis').value = 'all';
            filteredRecords = [...allRecords];
            renderAll();
        });
    }

    // ── Auto Refresh ────────────────────────────────────────
    function startAutoRefresh() {
        setInterval(async () => {
            const newRecords = await loadData();
            if (newRecords.length > 0) {
                allRecords = newRecords;
                populateDistrictFilter();
                applyFilters();
                updateRefreshTime();
            }
        }, REFRESH_INTERVAL_MS);
    }

    function updateRefreshTime() {
        const el = document.getElementById('last-refresh');
        const now = new Date();
        el.textContent = now.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    // ── Init ────────────────────────────────────────────────
    async function init() {
        startClock();
        initTabs();

        initFilters();

        // Load data
        allRecords = await loadData();
        filteredRecords = [...allRecords];

        populateDistrictFilter();
        renderAll();
        updateRefreshTime();

        // Hide loading
        const overlay = document.getElementById('loading-overlay');
        overlay.classList.add('hidden');

        // Start auto-refresh
        startAutoRefresh();
    }

    // Wait for DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
