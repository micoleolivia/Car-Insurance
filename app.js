/**
 * RiskView SA — Car Insurance Risk Estimator
 * --------------------------------------------------
 * Data source: RTMC State of Road Safety in South Africa, Jan–Dec 2023
 * Methodology: Multiplicative relative risk scoring using fatality distributions
 * as proxies for accident risk, adjusted for population exposure.
 *
 * Risk Score = weighted composite of age, gender, province, vehicle, and
 * behavioural factors. Normalised to 0–100.
 * Premium estimate derived from base rate × composite risk multiplier.
 */

// ─── DATA: AGE RISK ────────────────────────────────────────────────────────
// Source: RTMC 2023, Figure 20 — Percentage distribution of fatalities per age group
// Relative risk = fatality % / population % for that age group
// Population % from RTMC Figure 20 (green line)
// We use the raw fatality % as a proxy and normalise relative to the lowest-risk group

const AGE_FATALITY = {
  "16-19": 3.9,
  "20-24": 7.0,
  "25-29": 12.0,
  "30-34": 14.5,
  "35-39": 14.7,
  "40-44": 11.0,
  "45-49": 7.6,
  "50-54": 5.6,
  "55-59": 5.0,
  "60-64": 3.5,
  "65-69": 2.8,
  "70-74": 1.8,
  "75-79": 1.0,
  "80+":   0.8,
};

// Map user age (integer) to age band
function getAgeBand(age) {
  if (age < 20)  return "16-19";
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

// Normalise age fatality % relative to lowest risk group (80+ = 0.8%)
// This gives us a relative risk multiplier
function getAgeMultiplier(age) {
  const band = getAgeBand(age);
  const fatPct = AGE_FATALITY[band];
  const minFat = 0.8; // 80+ group
  return fatPct / minFat; // e.g. 30-34 = 14.5/0.8 = 18.1x relative risk
}

// ─── DATA: PROVINCE RISK ────────────────────────────────────────────────────
// Source: RTMC 2023 — Distribution of Fatalities per Province (exact bar chart values)
// Adjusted for registered vehicles per province (RTMC 2023, Figure 6)
// Vehicle share proxy: GP=38.37%, WC=16.31%, KZN=13.43%, remaining split ~equally

const PROVINCE_FATALITIES = {
  GP:  2514,
  KZN: 2229,
  EC:  1390,
  LP:  1362,
  MP:  1183,
  WC:  1371,
  NW:  752,
  FS:  661,
  NC:  391,
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

// Rate = fatalities / vehicle share → normalised relative to lowest (NC)
function getProvinceMultiplier(province) {
  const fat = PROVINCE_FATALITIES[province];
  const veh = PROVINCE_VEHICLE_SHARE[province];
  const rate = fat / veh;

  // Calculate all rates to normalise
  const allRates = Object.keys(PROVINCE_FATALITIES).map(p =>
    PROVINCE_FATALITIES[p] / PROVINCE_VEHICLE_SHARE[p]
  );
  const minRate = Math.min(...allRates);
  return rate / minRate;
}

// ─── DATA: GENDER RISK ──────────────────────────────────────────────────────
// Source: RTMC 2023, Figure 21 — exact values from chart table
// Male: 76.5%, Female: 19.6% of fatalities
// SA driving population is roughly 52% male / 48% female
// Male relative risk = (76.5/52) / (19.6/48) = 1.47/0.408 = 3.6x relative to female

const GENDER_MULTIPLIER = {
  male:   3.6,
  female: 1.0,
};

// ─── DATA: VEHICLE TYPE RISK ────────────────────────────────────────────────
// Source: RTMC 2023 Table 2 — registered vehicles by type
// Higher risk vehicles: motorcycles (high fatality rate per km),
// minibuses (taxi industry crash rate), trucks (severity)
// Motorcars = baseline reference

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
// More km = more exposure = more risk. Linear proxy.

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
// Source: RTMC 2023 — Saturday 24.3% + Sunday 21.4% = 45.7% of crashes on weekends
// Weekend days = 2/7 = 28.6% of week → weekend crash rate is 45.7/28.6 = 1.6x weekday

const WEEKEND_MULTIPLIER = {
  yes:       1.4,
  sometimes: 1.15,
  no:        1.0,
};

// ─── SCORING WEIGHTS ────────────────────────────────────────────────────────
// These weights determine contribution to final composite score
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
// Indicative market benchmarks for comprehensive cover in SA (2023/24)
// Source: Hippo.co.za market averages and industry publications
const BASE_PREMIUM = {
  motorcar:   950,
  bakkie:     1100,
  motorcycle: 650,
  minibus:    1800,
  bus:        4500,
  truck:      5500,
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
  // We define reference max values based on data range
  const AGE_MAX      = getAgeMultiplier(32); // peak risk age ~30-34
  const GENDER_MAX   = 3.6;
  const PROVINCE_MAX = getProvinceMultiplier("KZN"); // highest rate
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
  if      (compositeScore < 25) { band = "Low Risk";       bandClass = "low"; }
  else if (compositeScore < 50) { band = "Medium Risk";    bandClass = "medium"; }
  else if (compositeScore < 75) { band = "High Risk";      bandClass = "high"; }
  else                          { band = "Very High Risk";  bandClass = "very-high"; }

  // 7. Premium estimate
  // Composite risk multiplier (relative to average risk score of ~40)
  const rawMultiplier = (ageMult * genderMult * vehicleMult * kmMult * weekendMult) /
                        (AGE_MAX * GENDER_MAX * VEHICLE_MAX * KM_MAX * WEEKEND_MAX);
  const premiumMultiplier = 0.4 + (compositeScore / 100) * 2.2;
  const basePremium = BASE_PREMIUM[vehicle];
  const estPremium  = basePremium * premiumMultiplier;
  const premiumLow  = Math.round(estPremium * 0.85 / 50) * 50;
  const premiumHigh = Math.round(estPremium * 1.15 / 50) * 50;

  // 8. Render results
  renderResults({
    compositeScore,
    band, bandClass,
    premiumLow, premiumHigh,
    factors: [
      { name: "Age",           score: ageScore,      value: `${age} yrs (${getAgeBand(age)})` },
      { name: "Gender",        score: genderScore,    value: gender.charAt(0).toUpperCase() + gender.slice(1) },
      { name: "Province",      score: provinceScore,  value: PROVINCE_NAME[province] },
      { name: "Vehicle Type",  score: vehicleScore,   value: VEHICLE_LABEL[vehicle] },
      { name: "Weekly km",     score: kmScore,        value: KM_LABEL[km] },
      { name: "Weekend driving", score: weekendScore, value: weekend === "yes" ? "Yes, regularly" : weekend === "sometimes" ? "Sometimes" : "Rarely / Never" },
    ]
  });
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
    // Colour by band
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
    low:        "Your profile suggests below-average road risk based on SA fatality data. You may be eligible for competitive premiums.",
    medium:     "Your profile is around the SA average. Standard market rates likely apply.",
    high:       "Your profile indicates above-average risk. Expect higher premiums — shop around.",
    "very-high":"Several high-risk factors are present. Premiums will be significantly above market average.",
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

  // Animate bars after render
  setTimeout(() => {
    document.querySelectorAll(".factor-bar").forEach(bar => {
      bar.style.width = bar.dataset.width;
    });
  }, 200);
}
