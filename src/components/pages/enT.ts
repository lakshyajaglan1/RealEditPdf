// Literal-English t() for root EN pages. Returns the English string from
// `ui.en` for any key passed in. Mirrors useTranslations('en') for English
// but inlines the lookup so the body components are reusable on both EN
// and dynamic [...lang] routes.
import { ui, defaultLang } from '../../i18n/ui';

const dict = ui[defaultLang];

export const enT = (key: string): string => {
  const value = dict[key as keyof typeof dict];
  return value !== undefined ? value : key;
};
