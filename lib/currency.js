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

function currencyForCountry(country) {
  return COUNTRY_TO_CURRENCY[country] || COUNTRY_TO_CURRENCY[DEFAULT_COUNTRY];
}

function timezoneForCountry(country) {
  return COUNTRY_TO_TIMEZONE[country] || COUNTRY_TO_TIMEZONE[DEFAULT_COUNTRY];
}

module.exports = { currencyForCountry, timezoneForCountry, COUNTRY_TO_CURRENCY, COUNTRY_TO_TIMEZONE, DEFAULT_COUNTRY };
