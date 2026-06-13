/**
 * RiskView SA — Car Insurance Risk Estimator
 * --------------------------------------------------
 * Data source: RTMC State of Road Safety in South Africa, January–March 2025
 * (covering 2024 and 2025 data, published 2025)
 * Methodology: Multiplicative relative risk scoring using fatality distributions
 * as proxies for accident risk, adjusted for population exposure.
 *
 * Risk Score = weighted composite of age, gender, province, vehicle, and
 * behavioural factors. Normalised to 0–100.
 * Premium estimate derived from base rate × composite risk multiplier.
 */

// ─── DATA: AGE RISK ────────────────────────────────────────────────────────
// Source: RTMC 2025 Report — "%Distribution of road fatalities per age group: 2023-2025"
// 2025 exact values from chart (most recent year used as primary)
// Population % (AGE column) also extracted from same chart for exposure adjustment

const AGE_FATALITY_2025 = {
  "00-04": 3.52,
  "05-09": 3.30,
  "10-14": 2.18,
  "15-19": 3.57,
  "20-24": 6.95,
  "25-29": 10.50,
  "30-34": 14.07,
  "35-39": 14.20,
  "40-44": 11.63,
  "45-49": 7.91,
  "50-54": 6.95,
  "55-59": 5.29,
  "60-64": 4.26,
  "65-69": 2.25,
  "70-74": 1.59,
  "75-79": 1.11,
  "80+":   0.74,
};

// Population share by age group (from AGE line in RTMC 2025 chart)
const AGE_POPULATION = {
  "00-04": 9.5,
  "05-09": 8.9,
  "10-14": 9.1,
  "15-19": 8.7,
  "20-24": 7.5,
  "25-29": 8.0,
  "30-34": 8.9,
  "35-39": 8.8,
  "40-44": 7.1,
  "45-49": 5.5,
  "50-54": 4.5,
  "55-59": 3.7,
  "60-64": 3.2,
  "65-69": 2.5,
  "70-74": 1.8,
  "75-79": 1.2,
  "80+":   1.0,
};

// Map user age (integer) to age band
function getAgeBand(age) {
  if (age < 5)   return "00-04";
  if (age < 10)  return "05-09";
  if (age < 15)  return "10-14";
  if (age < 20)  return "15-19";
  if (age < 25)  return "20-24";
  if (age < 30)  return "25-29";
  if (age < 35)  return "30-34";
  if (age < 40)  return "35-39";
  if (age < 45)  return "40-44";
  if (age < 50)  return "45-49";
  if (age < 55)  return "50-54";
  if (age < 60)  return "55-59";
  if (age < 65)  return "60-64";
  if (age < 70)  return "65-69";
  if (age < 75)  return "70-74";
  if (age < 80)  return "75-79";
  return "80+";
}

// Exposure-adjusted age risk rate = fatality% / population%
// Normalised relative to the lowest-risk group
function getAgeMultiplier(age) {
  const band = getAgeBand(age);
  const rate = AGE_FATALITY_2025[band] / AGE_POPULATION[band];

  // Find minimum rate across all bands for normalisation
  const allRates = Object.keys(AGE_FATALITY_2025).map(b =>
    AGE_FATALITY_2025[b] / AGE_POPULATION[b]
  );
  const minRate = Math.min(...allRates);
  return rate / minRate;
}

// ─── DATA: PROVINCE RISK ────────────────────────────────────────────────────
// Source: RTMC 2025 — "%Distribution of fatalities per province 2024-2025"
// Using 2025 fatality percentages (exact from chart)
// Adjusted for registered vehicle share per province (RTMC 2023 Figure 6 — most recent available)

const PROVINCE_FATALITY_PCT_2025 = {
  GP:  19.99,
  KZN: 18.37,
  LP:  12.02,
  EC:  11.43,
  WC:  11.14,
  MP:  10.55,
  NW:  7.51,
  FS:  6.06,
  NC:  2.92,
};

// Registered vehicle share per province (RTMC 2023 Figure 6)
const PROVINCE_VEHICLE_SHARE = {
  GP:  0.3837,
  WC:  0.1631,
  KZN: 0.1343,
  EC:  0.0850,
  LP:  0.0720,
  MP:  0.0610,
  NW:  0.0510,
  FS:  0.0490,
  NC:  0.0230,
};

// Rate = fatality% / vehicle share → exposure-adjusted risk per province
// Normalised relative to lowest rate province
function getProvinceMultiplier(province) {
  const rate = PROVINCE_FATALITY_PCT_2025[province] / PROVINCE_VEHICLE_SHARE[province];

  const allRates = Object.keys(PROVINCE_FATALITY_PCT_2025).map(p =>
    PROVINCE_FATALITY_PCT_2025[p] / PROVINCE_VEHICLE_SHARE[p]
  );
  const minRate = Math.min(...allRates);
  return rate / minRate;
}

// ─── DATA: GENDER RISK ──────────────────────────────────────────────────────
// Source: RTMC 2025 — "%Distribution of Fatalities per Gender: 2024-2025"
// 2025 exact values: Male 75.7%, Female 21.4%
// SA driving population approximately 52% male / 48% female
// Male relative risk = (75.7/52) / (21.4/48) = 1.456 / 0.446 = 3.26x relative to female

const GENDER_MULTIPLIER = {
  male:   3.26,
  female: 1.0,
};

// ─── DATA: VEHICLE TYPE RISK ────────────────────────────────────────────────
// Source: RTMC 2023 Table 2 (most recent vehicle registration table available)
// Relative risk multipliers anchored to motorcars as baseline (1.0)
// Motorcycle risk from international literature (4-5x higher fatality rate per km)
// Minibus/taxi risk reflects SA taxi industry crash profile
// Truck and bus risk reflects severity of heavy vehicle crashes

const VEHICLE_MULTIPLIER = {
  motorcar:   1.0,
  bakkie:     1.3,
  motorcycle: 4.5,
  minibus:    2.8,
  bus:        1.6,
  truck:      2.1,
};

const VEHICLE_LABEL = {
  motorcar:   "Motorcar / Sedan",
  bakkie:     "LDV / Bakkie",
  motorcycle: "Motorcycle",
  minibus:    "Minibus / Taxi",
  bus:        "Bus / Coach",
  truck:      "Truck",
};

// ─── DATA: EXPOSURE (KM DRIVEN) ─────────────────────────────────────────────
// More km = more exposure = proportionally more risk
// Multipliers reflect linear exposure scaling relative to 100-300km/week baseline

const KM_MULTIPLIER = {
  low:       0.6,
  medium:    1.0,
  high:      1.4,
  very_high: 1.9,
};

const KM_LABEL = {
  low:       "Under 100 km/week",
  medium:    "100–300 km/week",
  high:      "300–600 km/week",
  very_high: "Over 600 km/week",
};

// ─── DATA: WEEKEND DRIVING ──────────────────────────────────────────────────
// Source: RTMC 2025 — "%Distribution of fatal crashes per day of the week 2024-2025"
// 2025: Saturday 22.8% + Sunday 22.8% = 45.6% of crashes on weekends
// Weekend = 2/7 = 28.6% of the week
// Weekend crash rate = 45.6% / 28.6% = 1.59x weekday rate

const WEEKEND_MULTIPLIER = {
  yes:       1.4,
  sometimes: 1.15,
  no:        1.0,
};

// ─── SCORING WEIGHTS ────────────────────────────────────────────────────────
// Weights reflect relative actuarial importance of each factor
// Age and province are the dominant predictors in SA road fatality data
const WEIGHTS = {
  age:      0.30,
  gender:   0.20,
  province: 0.25,
  vehicle:  0.15,
  km:       0.07,
  weekend:  0.03,
};

// ─── PROVINCE NAMES ─────────────────────────────────────────────────────────
const PROVINCE_NAME = {
  GP: "Gauteng", KZN: "KwaZulu-Natal", WC: "Western Cape",
  EC: "Eastern Cape", LP: "Limpopo", MP: "Mpumalanga",
  NW: "North West", FS: "Free State", NC: "Northern Cape",
};

// ─── PREMIUM BASE RATES (ZAR/month) ─────────────────────────────────────────
// Indicative market benchmarks for comprehensive cover in SA (2024/25)
// Source: Hippo.co.za market averages and industry publications
const BASE_PREMIUM = {
  motorcar:   1050,
  bakkie:     1200,
  motorcycle: 700,
  minibus:    1950,
  bus:        4800,
  truck:      5800,
};

// ─── MAIN CALCULATION ────────────────────────────────────────────────────────
function calculateRisk() {
  // 1. Read inputs
  const age      = parseInt(document.getElementById("age").value);
  const gender   = document.getElementById("gender").value;
  const province = document.getElementById("province").value;
  const vehicle  = document.getElementById("vehicle").value;
  const km       = document.getElementById("km").value;
  const weekend  = document.getElementById("weekend").value;

  // 2. Validate
  if (!age || age < 16 || age > 99 || !gender || !province || !vehicle || !km || !weekend) {
    alert("Please complete all fields before calculating.");
    return;
  }

  // 3. Get raw multipliers
  const ageMult      = getAgeMultiplier(age);
  const genderMult   = GENDER_MULTIPLIER[gender];
  const provinceMult = getProvinceMultiplier(province);
  const vehicleMult  = VEHICLE_MULTIPLIER[vehicle];
  const kmMult       = KM_MULTIPLIER[km];
  const weekendMult  = WEEKEND_MULTIPLIER[weekend];

  // 4. Normalise each multiplier to 0–100 scale for display
  const AGE_MAX      = getAgeMultiplier(35); // peak risk age 35-39 in 2025 data
  const GENDER_MAX   = 3.26;
  const PROVINCE_MAX = getProvinceMultiplier("NC"); // highest exposure-adjusted rate
  const VEHICLE_MAX  = 4.5; // motorcycle
  const KM_MAX       = 1.9;
  const WEEKEND_MAX  = 1.4;

  const ageScore      = Math.min((ageMult / AGE_MAX) * 100, 100);
  const genderScore   = Math.min((genderMult / GENDER_MAX) * 100, 100);
  const provinceScore = Math.min((provinceMult / PROVINCE_MAX) * 100, 100);
  const vehicleScore  = Math.min((vehicleMult / VEHICLE_MAX) * 100, 100);
  const kmScore       = Math.min((kmMult / KM_MAX) * 100, 100);
  const weekendScore  = Math.min((weekendMult / WEEKEND_MAX) * 100, 100);

  // 5. Weighted composite score
  const compositeScore = Math.round(
    ageScore      * WEIGHTS.age +
    genderScore   * WEIGHTS.gender +
    provinceScore * WEIGHTS.province +
    vehicleScore  * WEIGHTS.vehicle +
    kmScore       * WEIGHTS.km +
    weekendScore  * WEIGHTS.weekend
  );

  // 6. Risk band
  let band, bandClass;
  if      (compositeScore < 25) { band = "Low Risk";      bandClass = "low"; }
  else if (compositeScore < 50) { band = "Medium Risk";   bandClass = "medium"; }
  else if (compositeScore < 75) { band = "High Risk";     bandClass = "high"; }
  else                          { band = "Very High Risk"; bandClass = "very-high"; }

  // 7. Premium estimate
  const premiumMultiplier = 0.4 + (compositeScore / 100) * 2.2;
  const basePremium = BASE_PREMIUM[vehicle];
  const estPremium  = basePremium * premiumMultiplier;
  const premiumLow  = Math.round(estPremium * 0.85 / 50) * 50;
  const premiumHigh = Math.round(estPremium * 1.15 / 50) * 50;

  // 8. Render results
  const result2025 = {
    compositeScore, band, bandClass, premiumLow, premiumHigh,
    factors: [
      { name: "Age",             score: ageScore,      value: `${age} yrs (${getAgeBand(age)})` },
      { name: "Gender",          score: genderScore,   value: gender.charAt(0).toUpperCase() + gender.slice(1) },
      { name: "Province",        score: provinceScore, value: PROVINCE_NAME[province] },
      { name: "Vehicle Type",    score: vehicleScore,  value: VEHICLE_LABEL[vehicle] },
      { name: "Weekly km",       score: kmScore,       value: KM_LABEL[km] },
      { name: "Weekend driving", score: weekendScore,  value: weekend === "yes" ? "Yes, regularly" : weekend === "sometimes" ? "Sometimes" : "Rarely / Never" },
    ]
  };

  renderResults(result2025);

  // 9. Calculate and render 2023 vs 2025 comparison
  const result2023 = calculateScore2023(age, gender, province, vehicle, km, weekend);
  renderComparison({ age, gender, province, vehicle, km, weekend }, result2025, result2023);
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
function renderResults({ compositeScore, band, bandClass, premiumLow, premiumHigh, factors }) {

  // Show section
  const section = document.getElementById("results");
  section.style.display = "block";

  // Animate scroll
  setTimeout(() => section.scrollIntoView({ behavior: "smooth", block: "start" }), 50);

  // Score ring animation
  const ring = document.getElementById("scoreRing");
  const circumference = 314;
  const offset = circumference - (compositeScore / 100) * circumference;
  setTimeout(() => {
    ring.style.strokeDashoffset = offset;
    const colours = { low: "#2e7d52", medium: "#c17f24", high: "#b84444", "very-high": "#7b1d1d" };
    ring.style.stroke = colours[bandClass] || "#1a3c6e";
  }, 100);

  document.getElementById("scoreNumber").textContent = compositeScore;

  // Band
  const bandLabel = document.getElementById("bandLabel");
  bandLabel.textContent = band;
  bandLabel.className = `band-label ${bandClass}`;

  // Band breakdown text
  const breakdownEl = document.getElementById("bandBreakdown");
  const breakdownText = {
    low:         "Your profile suggests below-average road risk based on SA fatality data. You may be eligible for competitive premiums.",
    medium:      "Your profile is around the SA average. Standard market rates likely apply.",
    high:        "Your profile indicates above-average risk. Expect higher premiums — shop around.",
    "very-high": "Several high-risk factors are present. Premiums will be significantly above market average.",
  };
  breakdownEl.innerHTML = `<span>${breakdownText[bandClass]}</span>`;

  // Premium
  document.getElementById("premiumRange").textContent =
    `R${premiumLow.toLocaleString()} – R${premiumHigh.toLocaleString()}`;

  // Factor bars
  const factorList = document.getElementById("factorList");
  factorList.innerHTML = "";
  factors.forEach(f => {
    const row = document.createElement("div");
    row.className = "factor-row";
    row.innerHTML = `
      <span class="factor-name">${f.name}</span>
      <div class="factor-bar-wrap">
        <div class="factor-bar" style="width: 0%" data-width="${Math.round(f.score)}%"></div>
      </div>
      <span class="factor-value">${f.value}</span>
    `;
    factorList.appendChild(row);
  });

  // Animate bars
  setTimeout(() => {
    document.querySelectorAll(".factor-bar").forEach(bar => {
      bar.style.width = bar.dataset.width;
    });
  }, 200);
}

// ─── 2023 DATA (for comparison) ──────────────────────────────────────────────
// Source: RTMC State of Road Safety Report 2023 (Jan–Dec 2023)
// These are the original values used in the first version of this model

const AGE_FATALITY_2023 = {
  "00-04": 3.9,  "05-09": 3.8,  "10-14": 2.5,  "15-19": 3.9,
  "20-24": 7.0,  "25-29": 12.0, "30-34": 14.5,  "35-39": 14.7,
  "40-44": 11.0, "45-49": 7.6,  "50-54": 5.6,   "55-59": 5.0,
  "60-64": 3.5,  "65-69": 2.8,  "70-74": 1.8,   "75-79": 1.0,  "80+": 0.8,
};

const PROVINCE_FATALITIES_2023 = {
  GP: 2514, KZN: 2229, EC: 1390, LP: 1362,
  MP: 1183, WC: 1371,  NW: 752,  FS: 661,  NC: 391,
};

// 2023 gender: Male 76.5%, Female 19.6%
// Male relative risk 2023: (76.5/52) / (19.6/48) = 1.471/0.408 = 3.61
const GENDER_MULT_2023 = { male: 3.61, female: 1.0 };

// 2023 weekend: Sat 24.3% + Sun 21.4% = 45.7% → same multiplier structure
const WEEKEND_MULT_2023 = { yes: 1.4, sometimes: 1.15, no: 1.0 };

// 2023 base premiums (slightly lower)
const BASE_PREMIUM_2023 = {
  motorcar: 950, bakkie: 1100, motorcycle: 650,
  minibus: 1800, bus: 4500, truck: 5500,
};

function getAgeMultiplier2023(age) {
  const band = getAgeBand(age);
  const fatPct = AGE_FATALITY_2023[band] || AGE_FATALITY_2023["80+"];
  const minFat = 0.8;
  return fatPct / minFat;
}

function getProvinceMultiplier2023(province) {
  const rate = PROVINCE_FATALITIES_2023[province] / PROVINCE_VEHICLE_SHARE[province];
  const allRates = Object.keys(PROVINCE_FATALITIES_2023).map(p =>
    PROVINCE_FATALITIES_2023[p] / PROVINCE_VEHICLE_SHARE[p]
  );
  const minRate = Math.min(...allRates);
  return rate / minRate;
}

function calculateScore2023(age, gender, province, vehicle, km, weekend) {
  const ageMult      = getAgeMultiplier2023(age);
  const genderMult   = GENDER_MULT_2023[gender];
  const provinceMult = getProvinceMultiplier2023(province);
  const vehicleMult  = VEHICLE_MULTIPLIER[vehicle];
  const kmMult       = KM_MULTIPLIER[km];
  const weekendMult  = WEEKEND_MULT_2023[weekend];

  const AGE_MAX_23      = getAgeMultiplier2023(35);
  const GENDER_MAX_23   = 3.61;
  const PROVINCE_MAX_23 = getProvinceMultiplier2023("GP"); // highest in 2023
  const VEHICLE_MAX_23  = 4.5;
  const KM_MAX_23       = 1.9;
  const WEEKEND_MAX_23  = 1.4;

  const ageScore      = Math.min((ageMult / AGE_MAX_23) * 100, 100);
  const genderScore   = Math.min((genderMult / GENDER_MAX_23) * 100, 100);
  const provinceScore = Math.min((provinceMult / PROVINCE_MAX_23) * 100, 100);
  const vehicleScore  = Math.min((vehicleMult / VEHICLE_MAX_23) * 100, 100);
  const kmScore       = Math.min((kmMult / KM_MAX_23) * 100, 100);
  const weekendScore  = Math.min((weekendMult / WEEKEND_MAX_23) * 100, 100);

  const composite = Math.round(
    ageScore * WEIGHTS.age + genderScore * WEIGHTS.gender +
    provinceScore * WEIGHTS.province + vehicleScore * WEIGHTS.vehicle +
    kmScore * WEIGHTS.km + weekendScore * WEIGHTS.weekend
  );

  const premMult  = 0.4 + (composite / 100) * 2.2;
  const base      = BASE_PREMIUM_2023[vehicle];
  const est       = base * premMult;
  const premLow   = Math.round(est * 0.85 / 50) * 50;
  const premHigh  = Math.round(est * 1.15 / 50) * 50;

  return {
    composite,
    premLow, premHigh,
    factors: {
      age: { score: ageScore, raw: AGE_FATALITY_2023[getAgeBand(age)] },
      gender: { score: genderScore, raw: GENDER_MULT_2023[gender] },
      province: { score: provinceScore, raw: (PROVINCE_FATALITIES_2023[province] / PROVINCE_VEHICLE_SHARE[province]).toFixed(1) },
      vehicle: { score: vehicleScore, raw: VEHICLE_MULTIPLIER[vehicle] },
      km: { score: kmScore, raw: KM_MULTIPLIER[km] },
      weekend: { score: weekendScore, raw: WEEKEND_MULT_2023[weekend] },
    }
  };
}

// ─── RENDER COMPARISON TABLE ─────────────────────────────────────────────────
function renderComparison(inputs, result2025, result2023) {
  const { age, gender, province, vehicle, km, weekend } = inputs;

  // Your result summary
  document.getElementById("score2023").textContent   = result2023.composite;
  document.getElementById("score2025").textContent   = result2025.compositeScore;
  const scoreDiff = result2025.compositeScore - result2023.composite;
  const scoreDeltaEl = document.getElementById("scoreDelta");
  scoreDeltaEl.textContent = (scoreDiff > 0 ? "+" : "") + scoreDiff;
  scoreDeltaEl.className   = `yr-score ${scoreDiff > 0 ? "change-up" : scoreDiff < 0 ? "change-down" : "change-neutral"}`;

  document.getElementById("premium2023").textContent = `R${result2023.premLow.toLocaleString()}–${result2023.premHigh.toLocaleString()}`;
  document.getElementById("premium2025").textContent = `R${result2025.premiumLow.toLocaleString()}–${result2025.premiumHigh.toLocaleString()}`;

  const premMidDiff = Math.round(
    ((result2025.premiumLow + result2025.premiumHigh) / 2) -
    ((result2023.premLow + result2023.premHigh) / 2)
  );
  const premDeltaEl = document.getElementById("premiumDelta");
  premDeltaEl.textContent = (premMidDiff > 0 ? "+R" : "-R") + Math.abs(premMidDiff).toLocaleString() + "/mo";
  premDeltaEl.className   = `yr-premium ${premMidDiff > 0 ? "change-up" : premMidDiff < 0 ? "change-down" : "change-neutral"}`;

  // Comparison table rows
  const ageBand = getAgeBand(age);
  const rows = [
    {
      factor: "Age fatality rate",
      val2023: `${AGE_FATALITY_2023[ageBand]}% (${ageBand})`,
      val2025: `${AGE_FATALITY_2025[ageBand]}% (${ageBand})`,
      diff: AGE_FATALITY_2025[ageBand] - AGE_FATALITY_2023[ageBand],
      unit: "%",
      impact: AGE_FATALITY_2025[ageBand] > AGE_FATALITY_2023[ageBand] ? "higher" : AGE_FATALITY_2025[ageBand] < AGE_FATALITY_2023[ageBand] ? "lower" : "neutral",
      note: AGE_FATALITY_2025[ageBand] > AGE_FATALITY_2023[ageBand] ? "↑ Pushes premium up" : "↓ Pushes premium down",
    },
    {
      factor: "Gender fatality split (male)",
      val2023: "76.5% of fatalities",
      val2025: "75.7% of fatalities",
      diff: 75.7 - 76.5,
      unit: "%",
      impact: "lower",
      note: "↓ Slightly lower male risk recorded",
    },
    {
      factor: "Province fatality share",
      val2023: `${(PROVINCE_FATALITIES_2023[province] / Object.values(PROVINCE_FATALITIES_2023).reduce((a,b)=>a+b,0) * 100).toFixed(2)}% of SA fatalities`,
      val2025: `${PROVINCE_FATALITY_PCT_2025[province]}% of SA fatalities`,
      diff: PROVINCE_FATALITY_PCT_2025[province] - (PROVINCE_FATALITIES_2023[province] / Object.values(PROVINCE_FATALITIES_2023).reduce((a,b)=>a+b,0) * 100),
      unit: "%",
      impact: PROVINCE_FATALITY_PCT_2025[province] > (PROVINCE_FATALITIES_2023[province] / Object.values(PROVINCE_FATALITIES_2023).reduce((a,b)=>a+b,0) * 100) ? "higher" : "lower",
      note: PROVINCE_FATALITY_PCT_2025[province] > (PROVINCE_FATALITIES_2023[province] / Object.values(PROVINCE_FATALITIES_2023).reduce((a,b)=>a+b,0) * 100) ? "↑ Province share increased" : "↓ Province share decreased",
    },
    {
      factor: "Weekend crash share",
      val2023: "45.7% of crashes (Sat+Sun)",
      val2025: "45.6% of crashes (Sat+Sun)",
      diff: -0.1,
      unit: "%",
      impact: "neutral",
      note: "→ Essentially unchanged",
    },
    {
      factor: "Base premium (motorcar)",
      val2023: "R950/month benchmark",
      val2025: "R1,050/month benchmark",
      diff: 100,
      unit: "R",
      impact: "higher",
      note: "↑ Market premiums rose ~10% 2023–2025",
    },
  ];

  const tbody = document.getElementById("comparisonTableBody");
  tbody.innerHTML = "";
  rows.forEach(row => {
    const diffStr = row.unit === "%" 
      ? `${row.diff > 0 ? "+" : ""}${row.diff.toFixed(2)}%`
      : `${row.diff > 0 ? "+" : ""}R${Math.abs(row.diff).toLocaleString()}`;
    const diffClass = row.diff > 0 ? "change-up" : row.diff < 0 ? "change-down" : "change-neutral";
    const impactClass = `impact-tag impact-${row.impact}`;
    const impactText  = row.impact === "higher" ? "↑ Higher premium" : row.impact === "lower" ? "↓ Lower premium" : "→ No change";

    tbody.innerHTML += `
      <tr>
        <td>${row.factor}</td>
        <td>${row.val2023}</td>
        <td>${row.val2025}</td>
        <td class="${diffClass}">${diffStr}</td>
        <td><span class="${impactClass}">${impactText}</span><br><small style="color:var(--ink-faint);font-size:0.72rem;">${row.note}</small></td>
      </tr>
    `;
  });
}
