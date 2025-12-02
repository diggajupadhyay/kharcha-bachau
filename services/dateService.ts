import { format } from 'date-fns';
import { Season } from '../types';

// Nepali Months
const NEPALI_MONTHS_EN = [
  "Baishakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin", 
  "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"
];

const NEPALI_MONTHS_NP = [
  "बैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज", 
  "कार्तिक", "मंसिर", "पुष", "माघ", "फागुन", "चैत"
];

// Mapping data for BS Year 2081 (Approx Apr 2024 - Apr 2025)
// Start Date: 2024-04-13 (Baishakh 1, 2081)
const REFERENCE_AD_YEAR = 2024;
const REFERENCE_AD_MONTH = 3; // April (0-indexed)
const REFERENCE_AD_DAY = 13;
const REFERENCE_BS_YEAR = 2081;

// Days in months for year 2081 (Can be expanded for other years)
const BS_MONTH_DAYS = [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31];

export const getNepaliMonthName = (monthIndex: number, lang: 'en' | 'np'): string => {
  return lang === 'en' ? NEPALI_MONTHS_EN[monthIndex] : NEPALI_MONTHS_NP[monthIndex];
};

export const getNepaliDateDetails = (date: Date) => {
  const diffTime = date.getTime() - new Date(REFERENCE_AD_YEAR, REFERENCE_AD_MONTH, REFERENCE_AD_DAY).getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  let daysCount = diffDays;
  let bsYear = REFERENCE_BS_YEAR;
  let bsMonth = 0; // Baishakh

  // Fallback for dates before reference (Simple approx for MVP)
  if (daysCount < 0) {
      bsYear = date.getFullYear() + 57;
      bsMonth = (date.getMonth() + 8) % 12;
      return { year: bsYear, month: bsMonth, day: date.getDate() }; // Approx fallback
  }

  while (true) {
      const daysInMonth = BS_MONTH_DAYS[bsMonth];
      if (daysCount < daysInMonth) {
          break;
      }
      daysCount -= daysInMonth;
      bsMonth++;
      if (bsMonth > 11) {
          bsMonth = 0;
          bsYear++;
      }
  }

  return {
      year: bsYear,
      month: bsMonth,
      day: daysCount + 1
  };
};

export const convertToNepaliNumerals = (num: number): string => {
  const nepaliMap = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  return num.toString().split('').map(d => nepaliMap[parseInt(d)] || d).join('');
};

export const getNepaliDate = (date: Date, lang: 'en' | 'np'): string => {
  const { year, month, day } = getNepaliDateDetails(date);

  const monthName = lang === 'en' ? NEPALI_MONTHS_EN[month] : NEPALI_MONTHS_NP[month];
  const yearStr = lang === 'en' ? year : convertToNepaliNumerals(year);
  const dayStr = lang === 'en' ? day : convertToNepaliNumerals(day);

  return `${monthName} ${dayStr}, ${yearStr}`;
};

// Implement 6 Seasons Logic (Ritu)
export const getCurrentSeason = (): Season => {
    const { month } = getNepaliDateDetails(new Date());
    
    // Baishakh(0), Jestha(1) -> Basanta (Spring)
    if (month === 0 || month === 1) return 'basanta';
    
    // Ashadh(2), Shrawan(3) -> Grishma (Summer)
    if (month === 2 || month === 3) return 'grishma';
    
    // Bhadra(4), Ashwin(5) -> Barsha (Monsoon/Early Autumn)
    if (month === 4 || month === 5) return 'barsha';
    
    // Kartik(6), Mangsir(7) -> Sharad (Autumn)
    if (month === 6 || month === 7) return 'sharad';
    
    // Poush(8), Magh(9) -> Hemanta (Pre-Winter)
    if (month === 8 || month === 9) return 'hemanta';
    
    // Falgun(10), Chaitra(11) -> Shishir (Winter)
    return 'shishir';
};

export const getSeasonName = (season: Season, lang: 'en' | 'np'): string => {
    const names = {
        basanta: { en: 'Basanta (Spring)', np: 'वसन्त' },
        grishma: { en: 'Grishma (Summer)', np: 'ग्रीष्म' },
        barsha: { en: 'Barsha (Monsoon)', np: 'वर्षा' },
        sharad: { en: 'Sharad (Autumn)', np: 'शरद' },
        hemanta: { en: 'Hemanta (Pre-winter)', np: 'हेमन्त' },
        shishir: { en: 'Shishir (Winter)', np: 'शिशिर' },
        all: { en: 'All Season', np: 'सबै मौसम' }
    };
    return names[season][lang];
};

export const getTimeGreeting = (lang: 'en' | 'np'): string => {
    const hour = new Date().getHours();
    if (lang === 'en') {
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    } else {
        if (hour < 12) return 'शुभ प्रभात';
        if (hour < 18) return 'शुभ दिन';
        return 'शुभ सन्ध्या';
    }
};