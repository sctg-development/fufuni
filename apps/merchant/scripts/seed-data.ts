/**
 * MIT License
 *
 * Copyright (c) 2026 Ronan Le Meillat - SCTG Development
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Shared seed data and initialization functions
 * Reusable across init.ts and seed.ts
 */

export const EUROPEAN_COUNTRIES = [
  { code: 'FR', display_name: 'France', country_name: 'French Republic' },
  { code: 'IT', display_name: 'Italy', country_name: 'Italian Republic' },
  { code: 'DE', display_name: 'Germany', country_name: 'Federal Republic of Germany' },
  { code: 'ES', display_name: 'Spain', country_name: 'Kingdom of Spain' },
  { code: 'NL', display_name: 'Netherlands', country_name: 'Kingdom of the Netherlands' },
  { code: 'BE', display_name: 'Belgium', country_name: 'Kingdom of Belgium' },
  { code: 'AT', display_name: 'Austria', country_name: 'Republic of Austria' },
  { code: 'PT', display_name: 'Portugal', country_name: 'Portuguese Republic' },
  { code: 'GR', display_name: 'Greece', country_name: 'Hellenic Republic' },
  { code: 'PL', display_name: 'Poland', country_name: 'Republic of Poland' },
  { code: 'CZ', display_name: 'Czech Republic', country_name: 'Czech Republic' },
  { code: 'HU', display_name: 'Hungary', country_name: 'Hungary' },
  { code: 'RO', display_name: 'Romania', country_name: 'Romania' },
  { code: 'BG', display_name: 'Bulgaria', country_name: 'Bulgaria' },
  { code: 'HR', display_name: 'Croatia', country_name: 'Republic of Croatia' },
  { code: 'SI', display_name: 'Slovenia', country_name: 'Republic of Slovenia' },
  { code: 'SK', display_name: 'Slovakia', country_name: 'Slovak Republic' },
  { code: 'SE', display_name: 'Sweden', country_name: 'Kingdom of Sweden' },
  { code: 'NO', display_name: 'Norway', country_name: 'Kingdom of Norway' },
  { code: 'DK', display_name: 'Denmark', country_name: 'Kingdom of Denmark' },
  { code: 'FI', display_name: 'Finland', country_name: 'Republic of Finland' },
  { code: 'IE', display_name: 'Ireland', country_name: 'Republic of Ireland' },
  { code: 'LU', display_name: 'Luxembourg', country_name: 'Grand Duchy of Luxembourg' },
  { code: 'MT', display_name: 'Malta', country_name: 'Republic of Malta' },
  { code: 'CY', display_name: 'Cyprus', country_name: 'Republic of Cyprus' },
];

export const UK_COUNTRIES = [
  { code: 'GB', display_name: 'United Kingdom', country_name: 'United Kingdom' },
];

export const US_COUNTRIES = [
  { code: 'US', display_name: 'United States', country_name: 'United States' },
  { code: 'CA', display_name: 'Canada', country_name: 'Canada' },
];

export const OTHER_COUNTRIES = [
  { code: 'AF', display_name: 'Afghanistan', country_name: 'Afghanistan' },
  { code: 'AX', display_name: 'Åland Islands', country_name: 'Åland Islands' },
  { code: 'AL', display_name: 'Albania', country_name: 'Albania' },
  { code: 'DZ', display_name: 'Algeria', country_name: 'Algeria' },
  { code: 'AS', display_name: 'American Samoa', country_name: 'American Samoa' },
  { code: 'AD', display_name: 'Andorra', country_name: 'Andorra' },
  { code: 'AO', display_name: 'Angola', country_name: 'Angola' },
  { code: 'AI', display_name: 'Anguilla', country_name: 'Anguilla' },
  { code: 'AQ', display_name: 'Antarctica', country_name: 'Antarctica' },
  { code: 'AG', display_name: 'Antigua and Barbuda', country_name: 'Antigua and Barbuda' },
  { code: 'AR', display_name: 'Argentina', country_name: 'Argentina' },
  { code: 'AM', display_name: 'Armenia', country_name: 'Armenia' },
  { code: 'AW', display_name: 'Aruba', country_name: 'Aruba' },
  { code: 'AU', display_name: 'Australia', country_name: 'Australia' },
  { code: 'AZ', display_name: 'Azerbaijan', country_name: 'Azerbaijan' },
  { code: 'BS', display_name: 'Bahamas', country_name: 'Bahamas' },
  { code: 'BH', display_name: 'Bahrain', country_name: 'Bahrain' },
  { code: 'BD', display_name: 'Bangladesh', country_name: 'Bangladesh' },
  { code: 'BB', display_name: 'Barbados', country_name: 'Barbados' },
  { code: 'BY', display_name: 'Belarus', country_name: 'Belarus' },
  { code: 'BZ', display_name: 'Belize', country_name: 'Belize' },
  { code: 'BJ', display_name: 'Benin', country_name: 'Benin' },
  { code: 'BM', display_name: 'Bermuda', country_name: 'Bermuda' },
  { code: 'BT', display_name: 'Bhutan', country_name: 'Bhutan' },
  { code: 'BO', display_name: 'Bolivia', country_name: 'Bolivia' },
  { code: 'BA', display_name: 'Bosnia and Herzegovina', country_name: 'Bosnia and Herzegovina' },
  { code: 'BW', display_name: 'Botswana', country_name: 'Botswana' },
  { code: 'BV', display_name: 'Bouvet Island', country_name: 'Bouvet Island' },
  { code: 'BR', display_name: 'Brazil', country_name: 'Brazil' },
  { code: 'VG', display_name: 'British Virgin Islands', country_name: 'British Virgin Islands' },
  { code: 'IO', display_name: 'British Indian Ocean Territory', country_name: 'British Indian Ocean Territory' },
  { code: 'BN', display_name: 'Brunei', country_name: 'Brunei Darussalam' },
  { code: 'BF', display_name: 'Burkina Faso', country_name: 'Burkina Faso' },
  { code: 'BI', display_name: 'Burundi', country_name: 'Burundi' },
  { code: 'KH', display_name: 'Cambodia', country_name: 'Cambodia' },
  { code: 'CM', display_name: 'Cameroon', country_name: 'Cameroon' },
  { code: 'CV', display_name: 'Cape Verde', country_name: 'Cape Verde' },
  { code: 'KY', display_name: 'Cayman Islands', country_name: 'Cayman Islands' },
  { code: 'CF', display_name: 'Central African Republic', country_name: 'Central African Republic' },
  { code: 'TD', display_name: 'Chad', country_name: 'Chad' },
  { code: 'CL', display_name: 'Chile', country_name: 'Chile' },
  { code: 'CN', display_name: 'China', country_name: 'China' },
  { code: 'HK', display_name: 'Hong Kong', country_name: 'Hong Kong' },
  { code: 'MO', display_name: 'Macau', country_name: 'Macau' },
  { code: 'CX', display_name: 'Christmas Island', country_name: 'Christmas Island' },
  { code: 'CC', display_name: 'Cocos Islands', country_name: 'Cocos Islands' },
  { code: 'CO', display_name: 'Colombia', country_name: 'Colombia' },
  { code: 'KM', display_name: 'Comoros', country_name: 'Comoros' },
  { code: 'CG', display_name: 'Republic of the Congo', country_name: 'Republic of the Congo' },
  { code: 'CD', display_name: 'Democratic Republic of the Congo', country_name: 'Democratic Republic of the Congo' },
  { code: 'CK', display_name: 'Cook Islands', country_name: 'Cook Islands' },
  { code: 'CR', display_name: 'Costa Rica', country_name: 'Costa Rica' },
  { code: 'CI', display_name: 'Côte d\'Ivoire', country_name: 'Côte d\'Ivoire' },
  { code: 'CU', display_name: 'Cuba', country_name: 'Cuba' },
  { code: 'DJ', display_name: 'Djibouti', country_name: 'Djibouti' },
  { code: 'DM', display_name: 'Dominica', country_name: 'Dominica' },
  { code: 'DO', display_name: 'Dominican Republic', country_name: 'Dominican Republic' },
  { code: 'EC', display_name: 'Ecuador', country_name: 'Ecuador' },
  { code: 'EG', display_name: 'Egypt', country_name: 'Egypt' },
  { code: 'SV', display_name: 'El Salvador', country_name: 'El Salvador' },
  { code: 'GQ', display_name: 'Equatorial Guinea', country_name: 'Equatorial Guinea' },
  { code: 'ER', display_name: 'Eritrea', country_name: 'Eritrea' },
  { code: 'EE', display_name: 'Estonia', country_name: 'Estonia' },
  { code: 'ET', display_name: 'Ethiopia', country_name: 'Ethiopia' },
  { code: 'FK', display_name: 'Falkland Islands', country_name: 'Falkland Islands' },
  { code: 'FO', display_name: 'Faroe Islands', country_name: 'Faroe Islands' },
  { code: 'FJ', display_name: 'Fiji', country_name: 'Fiji' },
  { code: 'GF', display_name: 'French Guiana', country_name: 'French Guiana' },
  { code: 'PF', display_name: 'French Polynesia', country_name: 'French Polynesia' },
  { code: 'TF', display_name: 'French Southern Territories', country_name: 'French Southern Territories' },
  { code: 'GA', display_name: 'Gabon', country_name: 'Gabon' },
  { code: 'GM', display_name: 'Gambia', country_name: 'Gambia' },
  { code: 'GE', display_name: 'Georgia', country_name: 'Georgia' },
  { code: 'GH', display_name: 'Ghana', country_name: 'Ghana' },
  { code: 'GI', display_name: 'Gibraltar', country_name: 'Gibraltar' },
  { code: 'GL', display_name: 'Greenland', country_name: 'Greenland' },
  { code: 'GD', display_name: 'Grenada', country_name: 'Grenada' },
  { code: 'GP', display_name: 'Guadeloupe', country_name: 'Guadeloupe' },
  { code: 'GU', display_name: 'Guam', country_name: 'Guam' },
  { code: 'GT', display_name: 'Guatemala', country_name: 'Guatemala' },
  { code: 'GG', display_name: 'Guernsey', country_name: 'Guernsey' },
  { code: 'GN', display_name: 'Guinea', country_name: 'Guinea' },
  { code: 'GW', display_name: 'Guinea-Bissau', country_name: 'Guinea-Bissau' },
  { code: 'GY', display_name: 'Guyana', country_name: 'Guyana' },
  { code: 'HT', display_name: 'Haiti', country_name: 'Haiti' },
  { code: 'HM', display_name: 'Heard Island and McDonald Islands', country_name: 'Heard Island and McDonald Islands' },
  { code: 'VA', display_name: 'Holy See', country_name: 'Holy See' },
  { code: 'HN', display_name: 'Honduras', country_name: 'Honduras' },
  { code: 'IN', display_name: 'India', country_name: 'India' },
  { code: 'ID', display_name: 'Indonesia', country_name: 'Indonesia' },
  { code: 'IR', display_name: 'Iran', country_name: 'Iran' },
  { code: 'IQ', display_name: 'Iraq', country_name: 'Iraq' },
  { code: 'IM', display_name: 'Isle of Man', country_name: 'Isle of Man' },
  { code: 'IL', display_name: 'Israel', country_name: 'Israel' },
  { code: 'JM', display_name: 'Jamaica', country_name: 'Jamaica' },
  { code: 'JP', display_name: 'Japan', country_name: 'Japan' },
  { code: 'JE', display_name: 'Jersey', country_name: 'Jersey' },
  { code: 'JO', display_name: 'Jordan', country_name: 'Jordan' },
  { code: 'KZ', display_name: 'Kazakhstan', country_name: 'Kazakhstan' },
  { code: 'KE', display_name: 'Kenya', country_name: 'Kenya' },
  { code: 'KI', display_name: 'Kiribati', country_name: 'Kiribati' },
  { code: 'KP', display_name: 'North Korea', country_name: 'North Korea' },
  { code: 'KR', display_name: 'South Korea', country_name: 'South Korea' },
  { code: 'KW', display_name: 'Kuwait', country_name: 'Kuwait' },
  { code: 'KG', display_name: 'Kyrgyzstan', country_name: 'Kyrgyzstan' },
  { code: 'LA', display_name: 'Laos', country_name: 'Laos' },
  { code: 'LV', display_name: 'Latvia', country_name: 'Latvia' },
  { code: 'LB', display_name: 'Lebanon', country_name: 'Lebanon' },
  { code: 'LS', display_name: 'Lesotho', country_name: 'Lesotho' },
  { code: 'LR', display_name: 'Liberia', country_name: 'Liberia' },
  { code: 'LY', display_name: 'Libya', country_name: 'Libya' },
  { code: 'LI', display_name: 'Liechtenstein', country_name: 'Liechtenstein' },
  { code: 'LT', display_name: 'Lithuania', country_name: 'Lithuania' },
  { code: 'MK', display_name: 'North Macedonia', country_name: 'North Macedonia' },
  { code: 'MG', display_name: 'Madagascar', country_name: 'Madagascar' },
  { code: 'MW', display_name: 'Malawi', country_name: 'Malawi' },
  { code: 'MY', display_name: 'Malaysia', country_name: 'Malaysia' },
  { code: 'MV', display_name: 'Maldives', country_name: 'Maldives' },
  { code: 'ML', display_name: 'Mali', country_name: 'Mali' },
  { code: 'MH', display_name: 'Marshall Islands', country_name: 'Marshall Islands' },
  { code: 'MQ', display_name: 'Martinique', country_name: 'Martinique' },
  { code: 'MR', display_name: 'Mauritania', country_name: 'Mauritania' },
  { code: 'MU', display_name: 'Mauritius', country_name: 'Mauritius' },
  { code: 'YT', display_name: 'Mayotte', country_name: 'Mayotte' },
  { code: 'MX', display_name: 'Mexico', country_name: 'Mexico' },
  { code: 'FM', display_name: 'Micronesia', country_name: 'Micronesia' },
  { code: 'MD', display_name: 'Moldova', country_name: 'Moldova' },
  { code: 'MC', display_name: 'Monaco', country_name: 'Monaco' },
  { code: 'MN', display_name: 'Mongolia', country_name: 'Mongolia' },
  { code: 'ME', display_name: 'Montenegro', country_name: 'Montenegro' },
  { code: 'MS', display_name: 'Montserrat', country_name: 'Montserrat' },
  { code: 'MA', display_name: 'Morocco', country_name: 'Morocco' },
  { code: 'MZ', display_name: 'Mozambique', country_name: 'Mozambique' },
  { code: 'MM', display_name: 'Myanmar', country_name: 'Myanmar' },
  { code: 'NA', display_name: 'Namibia', country_name: 'Namibia' },
  { code: 'NR', display_name: 'Nauru', country_name: 'Nauru' },
  { code: 'NP', display_name: 'Nepal', country_name: 'Nepal' },
  { code: 'NC', display_name: 'New Caledonia', country_name: 'New Caledonia' },
  { code: 'NZ', display_name: 'New Zealand', country_name: 'New Zealand' },
  { code: 'NI', display_name: 'Nicaragua', country_name: 'Nicaragua' },
  { code: 'NE', display_name: 'Niger', country_name: 'Niger' },
  { code: 'NG', display_name: 'Nigeria', country_name: 'Nigeria' },
  { code: 'NU', display_name: 'Niue', country_name: 'Niue' },
  { code: 'NF', display_name: 'Norfolk Island', country_name: 'Norfolk Island' },
  { code: 'MP', display_name: 'Northern Mariana Islands', country_name: 'Northern Mariana Islands' },
  { code: 'OM', display_name: 'Oman', country_name: 'Oman' },
  { code: 'PK', display_name: 'Pakistan', country_name: 'Pakistan' },
  { code: 'PW', display_name: 'Palau', country_name: 'Palau' },
  { code: 'PS', display_name: 'Palestine', country_name: 'Palestine' },
  { code: 'PA', display_name: 'Panama', country_name: 'Panama' },
  { code: 'PG', display_name: 'Papua New Guinea', country_name: 'Papua New Guinea' },
  { code: 'PY', display_name: 'Paraguay', country_name: 'Paraguay' },
  { code: 'PE', display_name: 'Peru', country_name: 'Peru' },
  { code: 'PH', display_name: 'Philippines', country_name: 'Philippines' },
  { code: 'PN', display_name: 'Pitcairn', country_name: 'Pitcairn' },
  { code: 'PR', display_name: 'Puerto Rico', country_name: 'Puerto Rico' },
  { code: 'QA', display_name: 'Qatar', country_name: 'Qatar' },
  { code: 'RE', display_name: 'Réunion', country_name: 'Réunion' },
  { code: 'RU', display_name: 'Russia', country_name: 'Russia' },
  { code: 'RW', display_name: 'Rwanda', country_name: 'Rwanda' },
  { code: 'BL', display_name: 'Saint Barthélemy', country_name: 'Saint Barthélemy' },
  { code: 'SH', display_name: 'Saint Helena', country_name: 'Saint Helena' },
  { code: 'KN', display_name: 'Saint Kitts and Nevis', country_name: 'Saint Kitts and Nevis' },
  { code: 'LC', display_name: 'Saint Lucia', country_name: 'Saint Lucia' },
  { code: 'MF', display_name: 'Saint Martin', country_name: 'Saint Martin' },
  { code: 'SX', display_name: 'Sint Maarten', country_name: 'Sint Maarten' },
  { code: 'PM', display_name: 'Saint Pierre and Miquelon', country_name: 'Saint Pierre and Miquelon' },
  { code: 'VC', display_name: 'Saint Vincent and the Grenadines', country_name: 'Saint Vincent and the Grenadines' },
  { code: 'WS', display_name: 'Samoa', country_name: 'Samoa' },
  { code: 'SM', display_name: 'San Marino', country_name: 'San Marino' },
  { code: 'ST', display_name: 'São Tomé and Príncipe', country_name: 'São Tomé and Príncipe' },
  { code: 'SA', display_name: 'Saudi Arabia', country_name: 'Saudi Arabia' },
  { code: 'SN', display_name: 'Senegal', country_name: 'Senegal' },
  { code: 'RS', display_name: 'Serbia', country_name: 'Serbia' },
  { code: 'SC', display_name: 'Seychelles', country_name: 'Seychelles' },
  { code: 'SL', display_name: 'Sierra Leone', country_name: 'Sierra Leone' },
  { code: 'SG', display_name: 'Singapore', country_name: 'Singapore' },
  { code: 'SB', display_name: 'Solomon Islands', country_name: 'Solomon Islands' },
  { code: 'SO', display_name: 'Somalia', country_name: 'Somalia' },
  { code: 'ZA', display_name: 'South Africa', country_name: 'South Africa' },
  { code: 'GS', display_name: 'South Georgia and the South Sandwich Islands', country_name: 'South Georgia and the South Sandwich Islands' },
  { code: 'SS', display_name: 'South Sudan', country_name: 'South Sudan' },
  { code: 'LK', display_name: 'Sri Lanka', country_name: 'Sri Lanka' },
  { code: 'SD', display_name: 'Sudan', country_name: 'Sudan' },
  { code: 'SR', display_name: 'Suriname', country_name: 'Suriname' },
  { code: 'SJ', display_name: 'Svalbard and Jan Mayen', country_name: 'Svalbard and Jan Mayen' },
  { code: 'SZ', display_name: 'Eswatini', country_name: 'Eswatini' },
  { code: 'CH', display_name: 'Switzerland', country_name: 'Switzerland' },
  { code: 'SY', display_name: 'Syria', country_name: 'Syria' },
  { code: 'TW', display_name: 'Taiwan', country_name: 'Taiwan' },
  { code: 'TJ', display_name: 'Tajikistan', country_name: 'Tajikistan' },
  { code: 'TZ', display_name: 'Tanzania', country_name: 'Tanzania' },
  { code: 'TH', display_name: 'Thailand', country_name: 'Thailand' },
  { code: 'TL', display_name: 'Timor-Leste', country_name: 'Timor-Leste' },
  { code: 'TG', display_name: 'Togo', country_name: 'Togo' },
  { code: 'TK', display_name: 'Tokelau', country_name: 'Tokelau' },
  { code: 'TO', display_name: 'Tonga', country_name: 'Tonga' },
  { code: 'TT', display_name: 'Trinidad and Tobago', country_name: 'Trinidad and Tobago' },
  { code: 'TN', display_name: 'Tunisia', country_name: 'Tunisia' },
  { code: 'TR', display_name: 'Turkey', country_name: 'Turkey' },
  { code: 'TM', display_name: 'Turkmenistan', country_name: 'Turkmenistan' },
  { code: 'TC', display_name: 'Turks and Caicos Islands', country_name: 'Turks and Caicos Islands' },
  { code: 'TV', display_name: 'Tuvalu', country_name: 'Tuvalu' },
  { code: 'UG', display_name: 'Uganda', country_name: 'Uganda' },
  { code: 'UA', display_name: 'Ukraine', country_name: 'Ukraine' },
  { code: 'AE', display_name: 'United Arab Emirates', country_name: 'United Arab Emirates' },
  { code: 'UY', display_name: 'Uruguay', country_name: 'Uruguay' },
  { code: 'UZ', display_name: 'Uzbekistan', country_name: 'Uzbekistan' },
  { code: 'VU', display_name: 'Vanuatu', country_name: 'Vanuatu' },
  { code: 'VE', display_name: 'Venezuela', country_name: 'Venezuela' },
  { code: 'VN', display_name: 'Vietnam', country_name: 'Vietnam' },
  { code: 'VI', display_name: 'US Virgin Islands', country_name: 'US Virgin Islands' },
  { code: 'WF', display_name: 'Wallis and Futuna', country_name: 'Wallis and Futuna' },
  { code: 'EH', display_name: 'Western Sahara', country_name: 'Western Sahara' },
  { code: 'YE', display_name: 'Yemen', country_name: 'Yemen' },
  { code: 'ZM', display_name: 'Zambia', country_name: 'Zambia' },
  { code: 'ZW', display_name: 'Zimbabwe', country_name: 'Zimbabwe' },
];

type ApiFunction = (path: string, body?: any) => Promise<any>;

export interface CurrencyCountryMaps {
  currencyMap: Record<string, string>;
  countryMap: Record<string, string>;
}

/**
 * Creates currencies and countries via the API
 * Returns maps of code/currency_id and code/country_id for use in region creation
 */
export async function seedCurrenciesAndCountries(api: ApiFunction): Promise<CurrencyCountryMaps> {
  console.log('💱 Creating currencies...');
  const currencies = await Promise.all([
    api('/v1/regions/currencies', {
      code: 'EUR',
      display_name: 'Euro',
      symbol: '€',
      decimal_places: 2,
    }),
    api('/v1/regions/currencies', {
      code: 'GBP',
      display_name: 'British Pound',
      symbol: '£',
      decimal_places: 2,
    }),
    api('/v1/regions/currencies', {
      code: 'USD',
      display_name: 'US Dollar',
      symbol: '$',
      decimal_places: 2,
    }),
  ]);

  const currencyMap = {
    EUR: currencies[0].id,
    GBP: currencies[1].id,
    USD: currencies[2].id,
  };

  console.log('🌍 Creating countries (batch)...');
  const allCountries = [...EUROPEAN_COUNTRIES, ...UK_COUNTRIES, ...US_COUNTRIES, ...OTHER_COUNTRIES];

  console.log(`   Total countries from lists: ${allCountries.length}`);

  // Deduplicate by country code (keep first occurrence)
  const seenCodes = new Set<string>();
  const uniqueCountries = allCountries.filter((country) => {
    if (seenCodes.has(country.code)) {
      return false;
    }
    seenCodes.add(country.code);
    return true;
  });

  console.log(`   Unique countries after deduplication: ${uniqueCountries.length}`);

  // Create all countries in one batch request
  const batchResponse = await api('/v1/regions/countries/batch', {
    countries: uniqueCountries,
  });

  const countryMap: Record<string, string> = {};
  for (const country of batchResponse.items) {
    countryMap[country.code] = country.id;
  }

  console.log(`   ✅ Created ${batchResponse.items.length} countries in one batch`);

  return { currencyMap, countryMap };
}
