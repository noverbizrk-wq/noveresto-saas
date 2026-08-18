// lib/currency.js
//
// Correspondance pays -> devise/fuseau horaire, alignée sur la liste des
// pays du formulaire d'inscription (app/onboarding/page.tsx:COUNTRIES).
// Source unique de vérité, utilisée par /context pour ne plus renvoyer
// "TND" en dur peu importe le compte.

const COUNTRY_TO_CURRENCY = {
  'Tunisie':       'TND',
  'France':        'EUR',
  'Maroc':         'MAD',
  'Algérie':       'DZD',
  'Sénégal':       'XOF',
  "Côte d'Ivoire": 'XOF',
  'UAE':           'AED',
  'Belgique':      'EUR',
};

const COUNTRY_TO_TIMEZONE = {
  'Tunisie':       'Africa/Tunis',
  'France':        'Europe/Paris',
  'Maroc':         'Africa/Casablanca',
  'Algérie':       'Africa/Algiers',
  'Sénégal':       'Africa/Dakar',
  "Côte d'Ivoire": 'Africa/Abidjan',
  'UAE':           'Asia/Dubai',
  'Belgique':      'Europe/Brussels',
};

// Marché domestique historique de NoveResto — fallback si le pays est
// absent, vide, ou "Autre" (valeur possible du formulaire d'inscription).
const DEFAULT_COUNTRY = 'Tunisie';

// Retire un eventuel prefixe emoji drapeau (2 caracteres regionaux Unicode)
// + espaces. Certains formulaires d'inscription historiques stockaient le
// pays avec son drapeau (ex: "\ud83c\uddeb\ud83c\uddf7 France"), ce qui cassait silencieusement
// la correspondance et retombait sur le fallback Tunisie/TND.
function normalizeCountry(country) {
  if (!country) return country;
  return country.replace(/^[\u{1F1E6}-\u{1F1FF}]{2}\s*/u, '').trim();
}

function currencyForCountry(country) {
  const normalized = normalizeCountry(country);
  return COUNTRY_TO_CURRENCY[normalized] || COUNTRY_TO_CURRENCY[DEFAULT_COUNTRY];
}

function timezoneForCountry(country) {
  const normalized = normalizeCountry(country);
  return COUNTRY_TO_TIMEZONE[normalized] || COUNTRY_TO_TIMEZONE[DEFAULT_COUNTRY];
}

module.exports = { currencyForCountry, timezoneForCountry, normalizeCountry, COUNTRY_TO_CURRENCY, COUNTRY_TO_TIMEZONE, DEFAULT_COUNTRY };
